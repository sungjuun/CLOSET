-- All outfit mutations enter through authenticated, ownership-checking RPCs.
-- The wardrobe locks cover validation and the complete metadata/slot write.
create function public.save_outfit(p_id uuid, p_expected timestamptz default null, p_draft jsonb default null)
returns public.outfits language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  current_outfit public.outfits;
  clothing public.wardrobe_items;
  entry record;
  root_slug text;
  wanted_root text;
  wanted_name text;
  wanted_memo text;
  wanted_occasion text;
  wanted_seasons text[];
  wanted_tags text[];
  wanted_favorite boolean;
  wanted_items jsonb;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_id is null or p_draft is null or jsonb_typeof(p_draft) <> 'object' then
    raise exception 'Invalid outfit' using errcode = '22023';
  end if;
  if not (p_draft ?& array['name','memo','occasion','seasons','tags','is_favorite','items'])
    or exists (select 1 from jsonb_object_keys(p_draft) k where k <> all(array['name','memo','occasion','seasons','tags','is_favorite','items']))
    or jsonb_typeof(p_draft->'name') <> 'string'
    or jsonb_typeof(p_draft->'memo') <> 'string'
    or jsonb_typeof(p_draft->'occasion') <> 'string'
    or jsonb_typeof(p_draft->'seasons') <> 'array'
    or jsonb_typeof(p_draft->'tags') <> 'array'
    or jsonb_typeof(p_draft->'is_favorite') <> 'boolean'
    or jsonb_typeof(p_draft->'items') <> 'array' then
    raise exception 'Invalid outfit fields' using errcode = '22023';
  end if;
  if jsonb_array_length(p_draft->'items') not between 1 and 7
    or jsonb_array_length(p_draft->'seasons') > 4 or jsonb_array_length(p_draft->'tags') > 20
    or exists (select 1 from jsonb_array_elements(p_draft->'seasons') v where jsonb_typeof(v) <> 'string' or v #>> '{}' <> all(array['spring','summer','autumn','winter']))
    or exists (select 1 from jsonb_array_elements(p_draft->'tags') v where jsonb_typeof(v) <> 'string' or length(btrim(v #>> '{}')) not between 1 and 40) then
    raise exception 'Invalid outfit fields' using errcode = '22023';
  end if;
  wanted_name := btrim(p_draft->>'name');
  wanted_memo := nullif(btrim(p_draft->>'memo'), '');
  wanted_occasion := nullif(btrim(p_draft->>'occasion'), '');
  if length(wanted_name) not between 1 and 160 or length(wanted_memo) > 5000 or length(wanted_occasion) > 80 then
    raise exception 'Invalid outfit lengths' using errcode = '22023';
  end if;
  wanted_seasons := array(select distinct value from jsonb_array_elements_text(p_draft->'seasons') order by value);
  wanted_tags := array(select distinct btrim(value) from jsonb_array_elements_text(p_draft->'tags') order by btrim(value));
  wanted_favorite := (p_draft->>'is_favorite')::boolean;
  for entry in select value from jsonb_array_elements(p_draft->'items') loop
    if jsonb_typeof(entry.value) <> 'object' then raise exception 'Invalid slot' using errcode = '22023'; end if;
    if not (entry.value ?& array['slot','item_id','position'])
      or exists (select 1 from jsonb_object_keys(entry.value) k where k <> all(array['slot','item_id','position']))
      or jsonb_typeof(entry.value->'slot') <> 'string'
      or jsonb_typeof(entry.value->'item_id') <> 'string'
      or entry.value->>'slot' <> all(array['outerwear','top','bottom','shoes','onepiece','bag','accessory'])
      or entry.value->'position' <> '0'::jsonb
      or jsonb_typeof(entry.value->'position') <> 'number' then
      raise exception 'Invalid slot' using errcode = '22023';
    end if;
    perform (entry.value->>'item_id')::uuid;
  end loop;
  if (select count(distinct value->>'slot') from jsonb_array_elements(p_draft->'items')) <> jsonb_array_length(p_draft->'items')
    or (select count(distinct (value->>'item_id')::uuid) from jsonb_array_elements(p_draft->'items')) <> jsonb_array_length(p_draft->'items') then
    raise exception 'Duplicate slot or garment' using errcode = '22023';
  end if;
  wanted_items := (select jsonb_agg(jsonb_build_object('slot', value->>'slot', 'item_id', (value->>'item_id')::uuid, 'position', 0) order by value->>'slot') from jsonb_array_elements(p_draft->'items'));
  -- Also serialize first-create retries, where a row does not exist to lock yet.
  perform pg_advisory_xact_lock(hashtextextended('closet.outfit.' || p_id::text, 0));
  select * into current_outfit from public.outfits where id = p_id for update;
  if found then
    if current_outfit.user_id <> owner_id or current_outfit.deleted_at is not null then
      raise exception 'Outfit unavailable' using errcode = 'P0002';
    end if;
    if p_expected is null or current_outfit.updated_at <> p_expected then
      -- A response may be lost after commit. Accept only an exact desired state.
      if current_outfit.name = wanted_name and current_outfit.memo is not distinct from wanted_memo
        and current_outfit.occasion is not distinct from wanted_occasion and current_outfit.is_favorite = wanted_favorite
        and array(select value from unnest(current_outfit.seasons) value order by value) = wanted_seasons
        and array(select value from unnest(current_outfit.tags) value order by value) = wanted_tags
        and (select jsonb_agg(jsonb_build_object('slot', slot, 'item_id', item_id, 'position', position) order by slot) from public.outfit_items where outfit_id = p_id and user_id = owner_id) = wanted_items then
        return current_outfit;
      end if;
      raise exception 'Outfit conflict' using errcode = '40001';
    end if;
  elsif p_expected is not null then
    raise exception 'Outfit unavailable' using errcode = 'P0002';
  end if;
  -- Consistent UUID lock order avoids deadlocks between outfits sharing garments.
  for entry in select * from jsonb_to_recordset(wanted_items) as x(slot text, item_id uuid, position int) order by item_id loop
    select * into clothing from public.wardrobe_items where id = entry.item_id and user_id = owner_id for share;
    if not found or clothing.deleted_at is not null or clothing.lifecycle_status <> 'active' then
      raise exception 'Garment unavailable' using errcode = 'P0003';
    end if;
    with recursive ancestors as (
      select slug, parent_slug, array[slug] as path from public.categories where slug = clothing.category_slug
      union all
      select c.slug, c.parent_slug, a.path || c.slug from public.categories c join ancestors a on c.slug = a.parent_slug where not c.slug = any(a.path)
    ) select slug into root_slug from ancestors where parent_slug is null;
    wanted_root := case entry.slot when 'top' then 'tops' when 'bottom' then 'bottoms' when 'bag' then 'bags' when 'accessory' then 'accessories' else entry.slot end;
    if root_slug is distinct from wanted_root then raise exception 'Garment category changed' using errcode = 'P0003'; end if;
  end loop;
  if current_outfit.id is null then
    insert into public.outfits(id,user_id,name,memo,occasion,seasons,tags,is_favorite)
      values(p_id,owner_id,wanted_name,wanted_memo,wanted_occasion,wanted_seasons,wanted_tags,wanted_favorite) returning * into current_outfit;
  else
    update public.outfits set name = wanted_name, memo = wanted_memo, occasion = wanted_occasion,
      seasons = wanted_seasons, tags = wanted_tags, is_favorite = wanted_favorite where id = p_id returning * into current_outfit;
    delete from public.outfit_items where outfit_id = p_id and user_id = owner_id;
  end if;
  insert into public.outfit_items(user_id,outfit_id,item_id,slot,position)
    select owner_id,p_id,item_id,slot,position from jsonb_to_recordset(wanted_items) as x(slot text,item_id uuid,position int);
  return current_outfit;
end;
$$;

create function public.copy_outfit(p_source uuid, p_expected timestamptz, p_id uuid)
returns public.outfits language plpgsql security definer set search_path = '' as $$
declare source public.outfits; payload jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_source is null or p_id is null or p_source = p_id or p_expected is null then raise exception 'Invalid copy' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('closet.outfit.' || least(p_source,p_id)::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('closet.outfit.' || greatest(p_source,p_id)::text, 0));
  select * into source from public.outfits where id = p_source and user_id = auth.uid() and deleted_at is null for share;
  if not found then raise exception 'Outfit unavailable' using errcode = 'P0002'; end if;
  if source.updated_at <> p_expected then raise exception 'Outfit conflict' using errcode = '40001'; end if;
  payload := jsonb_build_object('name', left(source.name, 155) || ' (복사)', 'memo', coalesce(source.memo,''),
    'occasion',coalesce(source.occasion,''),'seasons',source.seasons,'tags',source.tags,'is_favorite',source.is_favorite,
    'items',coalesce((select jsonb_agg(jsonb_build_object('slot',slot,'item_id',item_id,'position',position)) from public.outfit_items where outfit_id = p_source and user_id = auth.uid()),'[]'::jsonb));
  return public.save_outfit(p_id,null,payload);
end;
$$;

create function public.delete_outfit(p_id uuid, p_expected timestamptz)
returns public.outfits language plpgsql security definer set search_path = '' as $$
declare result public.outfits;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_id is null or p_expected is null then raise exception 'Invalid deletion' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('closet.outfit.' || p_id::text, 0));
  select * into result from public.outfits where id = p_id and user_id = auth.uid() for update;
  if not found then raise exception 'Outfit unavailable' using errcode = 'P0002'; end if;
  if result.deleted_at is not null then return result; end if;
  if result.updated_at <> p_expected then raise exception 'Outfit conflict' using errcode = '40001'; end if;
  update public.outfits set deleted_at = clock_timestamp() where id = p_id returning * into result;
  -- Preserve historical wear-event references and their garment snapshots.
  return result;
end;
$$;

create function app_private.outfit_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  return new;
end;
$$;
drop trigger outfits_updated_at on public.outfits;
create trigger outfits_updated_at before update on public.outfits for each row execute function app_private.outfit_updated_at();
revoke all on function app_private.outfit_updated_at() from public, anon, authenticated;
revoke all on function public.save_outfit(uuid,timestamptz,jsonb), public.copy_outfit(uuid,timestamptz,uuid), public.delete_outfit(uuid,timestamptz) from public,anon;
grant execute on function public.save_outfit(uuid,timestamptz,jsonb), public.copy_outfit(uuid,timestamptz,uuid), public.delete_outfit(uuid,timestamptz) to authenticated;
comment on table public.outfits is 'Authenticated writes only through atomic save_outfit/copy_outfit/delete_outfit RPCs.';
