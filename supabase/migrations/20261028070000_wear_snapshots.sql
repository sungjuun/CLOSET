-- Immutable provenance identifies an outfit-based retry even after the original
-- outfit is edited or hard-deleted (the existing FK clears only outfit_id).
alter table public.wear_events
  add column source_outfit_id uuid,
  add column source_outfit_updated_at timestamptz,
  add constraint wear_source_pair check ((source_outfit_id is null) = (source_outfit_updated_at is null));
comment on column public.wear_events.source_outfit_id is 'Original owned outfit identity at recording; provenance, deliberately not a live FK.';
comment on column public.wear_events.source_outfit_updated_at is 'Original outfit version for exact request retry; not a source for recomputing historical garments.';

create function public.record_wear_event(
  p_id uuid,
  p_worn_on date,
  p_memo text default '',
  p_outfit uuid default null,
  p_outfit_expected timestamptz default null,
  p_items uuid[] default null
) returns public.wear_events
language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  existing public.wear_events;
  source public.outfits;
  clothing public.wardrobe_items;
  wanted_items uuid[];
  existing_items uuid[];
  clothing_id uuid;
  wanted_memo text;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_id is null or p_worn_on is null or p_worn_on not between date '1900-01-01' and date '9999-12-31'
    or p_memo is null or length(btrim(p_memo)) > 5000 then
    raise exception 'Invalid wear fields' using errcode = '22023';
  end if;
  if p_outfit is not null then
    if p_outfit_expected is null or p_items is not null then raise exception 'Choose outfit or garments' using errcode = '22023'; end if;
  else
    if p_outfit_expected is not null or p_items is null or cardinality(p_items) not between 1 and 50 then
      raise exception 'Choose one to fifty garments' using errcode = '22023';
    end if;
    if array_position(p_items,null) is not null or (select count(distinct id) from unnest(p_items) id) <> cardinality(p_items) then
      raise exception 'Invalid or duplicate garments' using errcode = '22023';
    end if;
    wanted_items := array(select id from unnest(p_items) id order by id);
  end if;
  wanted_memo := nullif(btrim(p_memo),'');
  -- Serialize create/retry before there is a row to lock. Each new ID is a
  -- distinct event, including repeated wear of the same outfit on the same day.
  perform pg_advisory_xact_lock(hashtextextended('closet.wear.' || p_id::text,0));
  select * into existing from public.wear_events where id = p_id for update;
  if found then
    if existing.user_id <> owner_id then raise exception 'Wear record unavailable' using errcode = 'P0002'; end if;
    if existing.worn_on = p_worn_on and existing.memo is not distinct from wanted_memo
      and existing.source_outfit_id is not distinct from p_outfit
      and existing.source_outfit_updated_at is not distinct from p_outfit_expected then
      if p_outfit is not null then return existing; end if;
      existing_items := array(select item_id from public.wear_event_items where wear_event_id = p_id and user_id = owner_id order by item_id);
      if existing_items = wanted_items then return existing; end if;
    end if;
    raise exception 'Wear request conflict' using errcode = '40001';
  end if;
  if p_outfit is not null then
    -- Same lock namespace/order as outfit writes: outfit before garments.
    perform pg_advisory_xact_lock(hashtextextended('closet.outfit.' || p_outfit::text,0));
    select * into source from public.outfits where id = p_outfit and user_id = owner_id and deleted_at is null for share;
    if not found then raise exception 'Outfit unavailable' using errcode = 'P0002'; end if;
    if source.updated_at <> p_outfit_expected then raise exception 'Outfit changed' using errcode = '40001'; end if;
    wanted_items := array(select item_id from public.outfit_items where outfit_id = p_outfit and user_id = owner_id order by item_id);
    if cardinality(wanted_items) not between 1 and 50 then raise exception 'Invalid wear composition' using errcode = '22023'; end if;
  end if;
  -- No metadata or snapshot rows are written until every garment is valid.
  foreach clothing_id in array wanted_items loop
    select * into clothing from public.wardrobe_items where id = clothing_id and user_id = owner_id for share;
    if not found or clothing.deleted_at is not null or clothing.lifecycle_status <> 'active' then
      raise exception 'Garment unavailable' using errcode = 'P0003';
    end if;
  end loop;
  insert into public.wear_events(id,user_id,worn_on,outfit_id,memo,source_outfit_id,source_outfit_updated_at)
    values(p_id,owner_id,p_worn_on,p_outfit,wanted_memo,p_outfit,p_outfit_expected) returning * into existing;
  insert into public.wear_event_items(wear_event_id,user_id,item_id)
    select p_id,owner_id,id from unnest(wanted_items) id;
  return existing;
end;
$$;

revoke all on function public.record_wear_event(uuid,date,text,uuid,timestamptz,uuid[]) from public,anon;
grant execute on function public.record_wear_event(uuid,date,text,uuid,timestamptz,uuid[]) to authenticated;
comment on table public.wear_events is 'Authenticated create only through record_wear_event; direct writes and edit/delete remain closed.';
