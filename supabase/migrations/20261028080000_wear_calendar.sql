alter table public.wear_events add column deleted_at timestamptz;
create index wear_events_live_date_idx on public.wear_events(user_id,worn_on desc,created_at desc,id desc) where deleted_at is null;

-- Keep the original creation validator private; the public entry point prevents
-- an old create retry from resurrecting a deleted event.
alter function public.record_wear_event(uuid,date,text,uuid,timestamptz,uuid[]) set schema app_private;
revoke all on function app_private.record_wear_event(uuid,date,text,uuid,timestamptz,uuid[]) from public,anon,authenticated;
create function public.record_wear_event(p_id uuid,p_worn_on date,p_memo text default '',p_outfit uuid default null,p_outfit_expected timestamptz default null,p_items uuid[] default null)
returns public.wear_events language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_id is null then raise exception 'Invalid event' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('closet.wear.' || p_id::text,0));
  if exists(select 1 from public.wear_events where id = p_id and user_id = auth.uid() and deleted_at is not null) then
    raise exception 'Wear record unavailable' using errcode = 'P0002';
  end if;
  return app_private.record_wear_event(p_id,p_worn_on,p_memo,p_outfit,p_outfit_expected,p_items);
end;
$$;

create function public.update_wear_event(
  p_id uuid,p_expected timestamptz,p_worn_on date,p_memo text default '',p_mode text default 'keep',
  p_outfit uuid default null,p_outfit_expected timestamptz default null,p_items uuid[] default null
) returns public.wear_events language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := auth.uid(); current_event public.wear_events; source public.outfits;
  clothing public.wardrobe_items; wanted_items uuid[]; existing_items uuid[]; clothing_id uuid; wanted_memo text;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_id is null or p_expected is null or p_worn_on is null or p_worn_on not between date '1900-01-01' and date '9999-12-31'
    or p_memo is null or length(btrim(p_memo)) > 5000 or p_mode is null or p_mode not in ('keep','items','outfit') then
    raise exception 'Invalid wear edit' using errcode = '22023';
  end if;
  if p_mode = 'keep' then
    if p_outfit is not null or p_outfit_expected is not null or p_items is not null then raise exception 'Invalid keep input' using errcode = '22023'; end if;
  elsif p_mode = 'outfit' then
    if p_outfit is null or p_outfit_expected is null or p_items is not null then raise exception 'Choose an outfit' using errcode = '22023'; end if;
  else
    if p_outfit is not null or p_outfit_expected is not null or p_items is null or cardinality(p_items) not between 1 and 50 then
      raise exception 'Choose one to fifty garments' using errcode = '22023';
    end if;
    if array_position(p_items,null) is not null or (select count(distinct id) from unnest(p_items) id) <> cardinality(p_items) then
      raise exception 'Invalid or duplicate garments' using errcode = '22023';
    end if;
    wanted_items := array(select id from unnest(p_items) id order by id);
  end if;
  wanted_memo := nullif(btrim(p_memo),'');
  perform pg_advisory_xact_lock(hashtextextended('closet.wear.' || p_id::text,0));
  select * into current_event from public.wear_events where id = p_id and user_id = owner_id and deleted_at is null for update;
  if not found then raise exception 'Wear record unavailable' using errcode = 'P0002'; end if;
  existing_items := array(select item_id from public.wear_event_items where wear_event_id = p_id and user_id = owner_id order by item_id);
  -- Exact desired-state retries never re-copy a source that has since changed.
  if current_event.worn_on = p_worn_on and current_event.memo is not distinct from wanted_memo then
    if p_mode = 'keep' then return current_event; end if;
    if p_mode = 'items' and current_event.source_outfit_id is null and current_event.outfit_id is null and existing_items = wanted_items then return current_event; end if;
    if p_mode = 'outfit' and current_event.source_outfit_id = p_outfit and current_event.source_outfit_updated_at = p_outfit_expected then return current_event; end if;
  end if;
  if current_event.updated_at <> p_expected then raise exception 'Wear edit conflict' using errcode = '40001'; end if;
  if p_mode = 'outfit' then
    perform pg_advisory_xact_lock(hashtextextended('closet.outfit.' || p_outfit::text,0));
    select * into source from public.outfits where id = p_outfit and user_id = owner_id and deleted_at is null for share;
    if not found then raise exception 'Outfit unavailable' using errcode = 'P0002'; end if;
    if source.updated_at <> p_outfit_expected then raise exception 'Outfit changed' using errcode = '40001'; end if;
    wanted_items := array(select item_id from public.outfit_items where outfit_id = p_outfit and user_id = owner_id order by item_id);
    if cardinality(wanted_items) not between 1 and 50 then raise exception 'Invalid composition' using errcode = '22023'; end if;
  end if;
  if p_mode <> 'keep' then
    foreach clothing_id in array wanted_items loop
      select * into clothing from public.wardrobe_items where id = clothing_id and user_id = owner_id for share;
      if not found or clothing.deleted_at is not null or clothing.lifecycle_status <> 'active' then raise exception 'Garment unavailable' using errcode = 'P0003'; end if;
    end loop;
    delete from public.wear_event_items where wear_event_id = p_id and user_id = owner_id;
    insert into public.wear_event_items(wear_event_id,user_id,item_id) select p_id,owner_id,id from unnest(wanted_items) id;
    update public.wear_events set outfit_id = case when p_mode = 'outfit' then p_outfit else null end,
      source_outfit_id = case when p_mode = 'outfit' then p_outfit else null end,
      source_outfit_updated_at = case when p_mode = 'outfit' then p_outfit_expected else null end where id = p_id;
  end if;
  update public.wear_events set worn_on = p_worn_on,memo = wanted_memo where id = p_id returning * into current_event;
  return current_event;
end;
$$;

create function public.delete_wear_event(p_id uuid,p_expected timestamptz)
returns public.wear_events language plpgsql security definer set search_path = '' as $$
declare result public.wear_events;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_id is null or p_expected is null then raise exception 'Invalid deletion' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('closet.wear.' || p_id::text,0));
  select * into result from public.wear_events where id = p_id and user_id = auth.uid() for update;
  if not found then raise exception 'Wear record unavailable' using errcode = 'P0002'; end if;
  if result.deleted_at is not null then return result; end if;
  if result.updated_at <> p_expected then raise exception 'Wear delete conflict' using errcode = '40001'; end if;
  update public.wear_events set deleted_at = clock_timestamp() where id = p_id returning * into result;
  return result;
end;
$$;

create function app_private.wear_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := greatest(clock_timestamp(),old.updated_at + interval '1 microsecond'); return new; end;
$$;
drop trigger wear_events_updated_at on public.wear_events;
create trigger wear_events_updated_at before update on public.wear_events for each row execute function app_private.wear_updated_at();
revoke all on function app_private.wear_updated_at() from public,anon,authenticated;

create function public.wear_day_counts(p_owner uuid,p_start date,p_end date)
returns table(worn_on date,event_count bigint) language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_start is null or p_end is null or p_start < date '1900-01-01' or p_end > date '9999-12-31' or p_start > p_end or p_end - p_start >= 366 then
    raise exception 'Invalid date range' using errcode = '22023';
  end if;
  return query select event.worn_on,count(*) from public.wear_events event
    where event.user_id = auth.uid() and event.user_id = p_owner and event.deleted_at is null and event.worn_on between p_start and p_end
    group by event.worn_on order by event.worn_on;
end;
$$;

create or replace view public.item_wear_stats with (security_invoker = true) as
select wi.id as item_id,wi.user_id,count(we.id)::bigint as wear_count,max(we.worn_on) as last_worn_on,
  case when count(we.id) > 0 and wi.purchase_price is not null then round(wi.purchase_price / count(we.id)::numeric,2) else null end as cost_per_wear
from public.wardrobe_items wi
left join public.wear_event_items wei on wei.item_id = wi.id and wei.user_id = wi.user_id
left join public.wear_events we on we.id = wei.wear_event_id and we.user_id = wi.user_id and we.deleted_at is null
group by wi.id,wi.user_id,wi.purchase_price;

create or replace function public.wardrobe_item_usage(p_owner uuid,p_item uuid)
returns table(outfit_count bigint,wear_count bigint,outfit_names text[])
language sql stable security invoker set search_path = '' as $$
  with linked as (
    select outfit.id,outfit.name from public.outfits outfit join public.outfit_items link on link.outfit_id = outfit.id and link.user_id = outfit.user_id
    where link.item_id = p_item and link.user_id = auth.uid() and link.user_id = p_owner and outfit.deleted_at is null
  ) select (select count(*) from linked),
    (select count(*) from public.wear_event_items history join public.wear_events event on event.id = history.wear_event_id and event.user_id = history.user_id
      where history.item_id = p_item and history.user_id = auth.uid() and history.user_id = p_owner and event.deleted_at is null),
    coalesce((select array_agg(name order by name,id) from linked),'{}'::text[]);
$$;

revoke all on function public.record_wear_event(uuid,date,text,uuid,timestamptz,uuid[]),public.update_wear_event(uuid,timestamptz,date,text,text,uuid,timestamptz,uuid[]),
  public.delete_wear_event(uuid,timestamptz),public.wear_day_counts(uuid,date,date) from public,anon;
grant execute on function public.record_wear_event(uuid,date,text,uuid,timestamptz,uuid[]),public.update_wear_event(uuid,timestamptz,date,text,text,uuid,timestamptz,uuid[]),
  public.delete_wear_event(uuid,timestamptz),public.wear_day_counts(uuid,date,date) to authenticated;
comment on table public.wear_events is 'Authenticated writes only through record/update/delete RPCs; deleted tombstones prevent retry resurrection and are excluded from statistics.';
