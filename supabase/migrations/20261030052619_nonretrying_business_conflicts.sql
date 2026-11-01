-- Version/request conflicts use PT409 (HTTP 409), never serialization_failure.
-- Signatures, validation, atomic writes, ownership checks and grants are preserved.

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION app_private.record_wear_event(p_id uuid, p_worn_on date, p_memo text DEFAULT ''::text, p_outfit uuid DEFAULT NULL::uuid, p_outfit_expected timestamp with time zone DEFAULT NULL::timestamp with time zone, p_items uuid[] DEFAULT NULL::uuid[])
 RETURNS public.wear_events
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    raise exception 'Wear request conflict' using errcode = 'PT409';
  end if;
  if p_outfit is not null then
    -- Same lock namespace/order as outfit writes: outfit before garments.
    perform pg_advisory_xact_lock(hashtextextended('closet.outfit.' || p_outfit::text,0));
    select * into source from public.outfits where id = p_outfit and user_id = owner_id and deleted_at is null for share;
    if not found then raise exception 'Outfit unavailable' using errcode = 'P0002'; end if;
    if source.updated_at <> p_outfit_expected then raise exception 'Outfit changed' using errcode = 'PT409'; end if;
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
$function$
;

CREATE OR REPLACE FUNCTION public.complete_outfit_render(p_id uuid)
 RETURNS public.outfit_render_assets
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result public.outfit_render_assets; o public.outfits; p public.outfit_presentations;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select * into result from public.outfit_render_assets where id=p_id and user_id=auth.uid() for update;
 if not found then raise exception 'Render unavailable' using errcode='P0002'; end if;
 select * into o from public.outfits where id=result.outfit_id and user_id=auth.uid() and deleted_at is null for share;
 if not found then raise exception 'Outfit unavailable' using errcode='P0002'; end if;
 if o.updated_at<>result.outfit_version then raise exception 'Outfit changed' using errcode='PT409'; end if;
 perform app_private.assert_render_garments(o.id);
 select * into p from public.outfit_presentations where outfit_id=o.id and user_id=auth.uid() for update;
 if not found or p.view_mode<>result.requested_mode or p.body_preset<>result.body_preset then raise exception 'Presentation changed' using errcode='PT409'; end if;
 if not exists(select 1 from storage.objects s where s.bucket_id='outfit-renders-private' and s.name=result.storage_path and s.metadata->>'mimetype'='image/png' and coalesce((s.metadata->>'size')::bigint,0) between 1 and 5242880) then raise exception 'Render file unavailable' using errcode='P0002'; end if;
 update public.outfit_render_assets set status='ready' where id=p_id returning * into result;
 update public.outfit_presentations set render_id=p_id,updated_at=clock_timestamp() where outfit_id=o.id and user_id=auth.uid();
 return result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.copy_outfit(p_source uuid, p_expected timestamp with time zone, p_id uuid)
 RETURNS public.outfits
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare source public.outfits; payload jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_source is null or p_id is null or p_source = p_id or p_expected is null then raise exception 'Invalid copy' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('closet.outfit.' || least(p_source,p_id)::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('closet.outfit.' || greatest(p_source,p_id)::text, 0));
  select * into source from public.outfits where id = p_source and user_id = auth.uid() and deleted_at is null for share;
  if not found then raise exception 'Outfit unavailable' using errcode = 'P0002'; end if;
  if source.updated_at <> p_expected then raise exception 'Outfit conflict' using errcode = 'PT409'; end if;
  payload := jsonb_build_object('name', left(source.name, 155) || ' (복사)', 'memo', coalesce(source.memo,''),
    'occasion',coalesce(source.occasion,''),'seasons',source.seasons,'tags',source.tags,'is_favorite',source.is_favorite,
    'items',coalesce((select jsonb_agg(jsonb_build_object('slot',slot,'item_id',item_id,'position',position)) from public.outfit_items where outfit_id = p_source and user_id = auth.uid()),'[]'::jsonb));
  return public.save_outfit(p_id,null,payload);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_brand(p_id uuid, p_expected timestamp with time zone)
 RETURNS public.brands
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare b public.brands; owner uuid := auth.uid();
begin
  if owner is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('brand:' || p_id::text,0));
  select * into b from public.brands where id = p_id and user_id = owner for update;
  if not found then raise exception 'Access denied' using errcode = '42501'; end if;
  if b.deleted_at is not null then return b; end if;
  if p_expected is null or b.updated_at <> p_expected then raise exception 'Brand conflict' using errcode = 'PT409'; end if;
  perform i.id from public.wardrobe_items i where i.user_id = owner and i.brand_id = b.id order by i.id for update nowait;
  update public.wardrobe_items set brand_id = null,brand_name = null where user_id = owner and brand_id = b.id;
  update public.brands set deleted_at = clock_timestamp(),updated_at = greatest(clock_timestamp(),b.updated_at + interval '1 microsecond') where id = b.id returning * into b;
  return b;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_member_category(p_slug text, p_expected timestamp with time zone, p_target text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := auth.uid();
  source public.categories%rowtype;
  target public.categories%rowtype;
  removed public.category_deletions%rowtype;
  wanted_target text := nullif(p_target, '');
  current_version timestamptz;
  moved integer;
begin
  if actor is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_slug is null or length(p_slug) > 80 or p_expected is null then raise exception 'Invalid category' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('member-categories:' || actor::text, 0));
  select * into removed from public.category_deletions where category_slug = p_slug and user_id = actor;
  if found then
    if removed.user_id <> actor then raise exception 'Category unavailable' using errcode = '42501'; end if;
    if removed.target_slug is distinct from coalesce(wanted_target, removed.parent_slug) then raise exception 'Category deletion changed' using errcode = 'PT409'; end if;
    return to_jsonb(removed);
  end if;
  -- Refuse a busy category/item rather than wait for the reverse FK lock order.
  select * into source from public.categories where slug = p_slug for update nowait;
  if not found or (source.user_id is not null and source.user_id <> actor) or source.parent_slug is null then
    raise exception 'Only available leaf categories can be deleted' using errcode = '42501';
  end if;
  select coalesce(p.updated_at, 'epoch'::timestamptz) into current_version
    from public.categories c left join public.category_preferences p on p.category_slug = c.slug and p.user_id = actor where c.slug = p_slug;
  if current_version is distinct from p_expected then raise exception 'Category changed' using errcode = 'PT409'; end if;
  wanted_target := coalesce(wanted_target, source.parent_slug);
  select * into target from public.categories where slug = wanted_target for key share;
  if not found or target.slug = source.slug or (target.user_id is not null and target.user_id <> actor)
    or exists (select 1 from public.category_deletions d where d.user_id = actor and d.category_slug = target.slug)
    or not (target.slug = source.parent_slug or target.parent_slug is not distinct from source.parent_slug) then
    raise exception 'Invalid destination category' using errcode = '22023';
  end if;
  if source.user_id is not null and exists (select 1 from public.wardrobe_items where category_slug = source.slug and user_id <> actor) then
    raise exception 'Category ownership mismatch' using errcode = '42501';
  end if;
  perform i.id from public.wardrobe_items i where i.category_slug = source.slug and i.user_id = actor order by i.id for update nowait;
  -- Preserve garments, photos, outfits and wear snapshots. The canonical root
  -- remains the same, so existing outfit slot/category contracts remain valid.
  update public.wardrobe_items set category_slug = target.slug where category_slug = source.slug and user_id = actor;
  get diagnostics moved = row_count;
  insert into public.category_deletions(category_slug, user_id, parent_slug, target_slug, moved_items)
    values (source.slug, actor, source.parent_slug, target.slug, moved) returning * into removed;
  delete from public.categories where slug = source.slug and user_id = actor;
  return to_jsonb(removed);
end $function$
;

CREATE OR REPLACE FUNCTION public.delete_outfit(p_id uuid, p_expected timestamp with time zone)
 RETURNS public.outfits
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result public.outfits;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_id is null or p_expected is null then raise exception 'Invalid deletion' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('closet.outfit.' || p_id::text, 0));
  select * into result from public.outfits where id = p_id and user_id = auth.uid() for update;
  if not found then raise exception 'Outfit unavailable' using errcode = 'P0002'; end if;
  if result.deleted_at is not null then return result; end if;
  if result.updated_at <> p_expected then raise exception 'Outfit conflict' using errcode = 'PT409'; end if;
  update public.outfits set deleted_at = clock_timestamp() where id = p_id returning * into result;
  -- Preserve historical wear-event references and their garment snapshots.
  return result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_wear_event(p_id uuid, p_expected timestamp with time zone)
 RETURNS public.wear_events
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result public.wear_events;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_id is null or p_expected is null then raise exception 'Invalid deletion' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('closet.wear.' || p_id::text,0));
  select * into result from public.wear_events where id = p_id and user_id = auth.uid() for update;
  if not found then raise exception 'Wear record unavailable' using errcode = 'P0002'; end if;
  if result.deleted_at is not null then return result; end if;
  if result.updated_at <> p_expected then raise exception 'Wear delete conflict' using errcode = 'PT409'; end if;
  update public.wear_events set deleted_at = clock_timestamp() where id = p_id returning * into result;
  return result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rename_outfit(p_id uuid, p_expected timestamp with time zone, p_name text)
 RETURNS public.outfits
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := auth.uid();
  result public.outfits;
  wanted_name text := btrim(p_name);
begin
  if actor is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_id is null or p_expected is null or wanted_name is null or length(wanted_name) not between 1 and 160 then
    raise exception 'Invalid outfit name' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('closet.outfit.' || p_id::text, 0));
  select * into result from public.outfits where id = p_id and user_id = actor and deleted_at is null for update;
  if not found then raise exception 'Outfit unavailable' using errcode = 'P0002'; end if;
  if result.updated_at <> p_expected and result.name <> wanted_name then
    raise exception 'Outfit conflict' using errcode = 'PT409';
  end if;
  -- Safe retry after a lost response; never restore stale metadata or slots.
  if result.name = wanted_name then return result; end if;
  update public.outfits set name = wanted_name where id = p_id returning * into result;
  return result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.reorder_member_categories(p_parent text, p_order text[], p_expected text[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid := auth.uid(); current_order text[]; wanted_parent text := nullif(p_parent,'');
begin
  if actor is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('member-categories:' || actor::text,0));
  select coalesce(array_agg(c.slug order by c.position,c.slug),'{}'::text[]) into current_order
    from public.member_categories(actor) c where c.parent_slug is not distinct from wanted_parent;
  if current_order is distinct from p_expected then raise exception 'Category order changed' using errcode = 'PT409'; end if;
  if p_order is null or array_position(p_order,null) is not null or cardinality(p_order) <> cardinality(current_order)
    or (select count(distinct s) from unnest(p_order) s) <> cardinality(current_order)
    or not (p_order @> current_order and p_order <@ current_order) then
    raise exception 'Invalid category order' using errcode = '22023';
  end if;
  insert into public.category_preferences(user_id,category_slug,position)
    select actor,s.slug,((s.ordinality - 1) * 10)::integer from unnest(p_order) with ordinality s(slug,ordinality)
  on conflict (user_id,category_slug) do update set position = excluded.position,
    updated_at = greatest(clock_timestamp(),public.category_preferences.updated_at + interval '1 microsecond');
end $function$
;

CREATE OR REPLACE FUNCTION public.reserve_outfit_render(p_id uuid, p_outfit uuid, p_expected timestamp with time zone, p_mode text, p_preset text, p_kind text)
 RETURNS public.outfit_render_assets
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare o public.outfits; result public.outfit_render_assets;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_id is null or p_kind is null or p_kind<>all(array['item-board','mannequin-sample']) or (p_mode='items' and p_kind<>'item-board') then raise exception 'Invalid renderer' using errcode='22023'; end if;
 select * into o from public.outfits where id=p_outfit and user_id=auth.uid() and deleted_at is null for share;
 if not found then raise exception 'Outfit unavailable' using errcode='P0002'; end if;
 if p_expected is null or o.updated_at<>p_expected then raise exception 'Outfit changed' using errcode='PT409'; end if;
 if not exists(select 1 from public.outfit_presentations p where p.outfit_id=o.id and p.user_id=o.user_id and p.view_mode=p_mode and p.body_preset=p_preset) then raise exception 'Presentation changed' using errcode='PT409'; end if;
 perform app_private.assert_render_garments(o.id);
 perform pg_advisory_xact_lock(hashtextextended('closet.render.'||p_id::text,0));
 select * into result from public.outfit_render_assets where id=p_id;
 if found then
  if result.user_id<>o.user_id or result.outfit_id<>o.id or result.outfit_version<>p_expected or result.requested_mode<>p_mode or result.body_preset<>p_preset or result.render_kind<>p_kind then raise exception 'Render identity mismatch' using errcode='22023'; end if;
  return result;
 end if;
 insert into public.outfit_render_assets(id,user_id,outfit_id,outfit_version,requested_mode,body_preset,render_kind,storage_path)
 values(p_id,o.user_id,o.id,p_expected,p_mode,p_preset,p_kind,o.user_id::text||'/'||o.id::text||'/'||p_id::text||'.png') returning * into result;
 return result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.save_account_preferences(p_patch jsonb, p_expected jsonb)
 RETURNS public.profiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid := auth.uid(); result public.profiles; field text; value jsonb; current_values jsonb;
begin
  if actor is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_patch is null or p_expected is null or jsonb_typeof(p_patch) <> 'object' or jsonb_typeof(p_expected) <> 'object'
    or p_patch = '{}'::jsonb then raise exception 'Invalid preferences' using errcode = '22023'; end if;
  if (select array_agg(k order by k) from jsonb_object_keys(p_patch) k)
    is distinct from (select array_agg(k order by k) from jsonb_object_keys(p_expected) k) then
    raise exception 'Invalid expected fields' using errcode = '22023';
  end if;
  for field,value in select * from jsonb_each(p_patch) loop
    if field not in ('display_name','wardrobe_sort','outfit_sort','card_density') then
      raise exception 'Invalid preference field' using errcode = '22023';
    end if;
    if field = 'display_name' then
      if jsonb_typeof(value) not in ('string','null') or length(btrim(value #>> '{}')) > 80 then
        raise exception 'Invalid display name' using errcode = '22023';
      end if;
    elsif jsonb_typeof(value) <> 'string'
      or (field = 'wardrobe_sort' and value #>> '{}' not in ('recent','oldest','name','brand','price_asc','price_desc'))
      or (field = 'outfit_sort' and value #>> '{}' not in ('recent','updated','oldest','name'))
      or (field = 'card_density' and value #>> '{}' not in ('compact','standard','roomy')) then
      raise exception 'Invalid preference value' using errcode = '22023';
    end if;
  end loop;
  select * into result from public.profiles where id = actor for update;
  if not found then raise exception 'Profile unavailable' using errcode = 'P0002'; end if;
  current_values := to_jsonb(result);
  for field,value in select * from jsonb_each(p_patch) loop
    if current_values->field is distinct from p_expected->field and current_values->field is distinct from value then
      raise exception 'Preference conflict' using errcode = 'PT409';
    end if;
  end loop;
  update public.profiles set
    display_name = case when p_patch ? 'display_name' then nullif(btrim(p_patch->>'display_name'),'') else result.display_name end,
    wardrobe_sort = coalesce(p_patch->>'wardrobe_sort',result.wardrobe_sort),
    outfit_sort = coalesce(p_patch->>'outfit_sort',result.outfit_sort),
    card_density = coalesce(p_patch->>'card_density',result.card_density)
    where id = actor returning * into result;
  return result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.save_brand(p_id uuid, p_name text, p_expected timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS public.brands
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare b public.brands; owner uuid := auth.uid(); title text := btrim(p_name);
begin
  if owner is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_id is null or title is null or length(title) not between 1 and 120 then raise exception 'Invalid brand' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('brand:' || p_id::text,0));
  select * into b from public.brands where id = p_id for update;
  if found then
    if b.user_id <> owner then raise exception 'Access denied' using errcode = '42501'; end if;
    if b.deleted_at is not null then raise exception 'Brand deleted' using errcode = 'P0002'; end if;
    if b.name = title then return b; end if;
    if p_expected is null or b.updated_at <> p_expected then raise exception 'Brand conflict' using errcode = 'PT409'; end if;
    -- Writers on wardrobe rows acquire a brand SHARE lock. Refuse a busy row
    -- rather than wait for the opposite lock order while holding this brand.
    perform i.id from public.wardrobe_items i where i.user_id = owner and i.brand_id = b.id order by i.id for update nowait;
    update public.brands set name = title,updated_at = greatest(clock_timestamp(),b.updated_at + interval '1 microsecond') where id = b.id returning * into b;
    update public.wardrobe_items set brand_name = b.name where user_id = owner and brand_id = b.id;
  else
    if p_expected is not null then raise exception 'Brand conflict' using errcode = 'PT409'; end if;
    insert into public.brands(id,user_id,name) values(p_id,owner,title) returning * into b;
  end if;
  return b;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.save_member_category(p_slug text, p_label text, p_active boolean, p_parent text DEFAULT NULL::text, p_expected timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := auth.uid();
  existing public.categories%rowtype;
  pref public.category_preferences%rowtype;
  wanted_parent text := nullif(p_parent,'');
  title text := btrim(p_label);
  target_parent text;
  next_position integer;
begin
  if actor is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_slug is null or length(p_slug) > 80 or title is null or length(title) not between 1 and 80 or p_active is null then
    raise exception 'Invalid category' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('member-categories:' || actor::text,0));
  if exists (select 1 from public.category_deletions where category_slug = p_slug and (user_id = actor or p_slug ~ '^u_')) then
    raise exception 'Category was deleted' using errcode = 'P0002';
  end if;
  select c.* into existing from public.categories c where c.slug = p_slug;
  if p_expected is null then
    if p_slug !~ '^u_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Invalid custom category identifier' using errcode = '22023';
    end if;
    if existing.slug is not null then
      if existing.user_id = actor and existing.parent_slug = wanted_parent and exists (
        select 1 from public.member_categories(actor) c where c.slug = p_slug and c.label_ko = title and c.is_active = p_active
      ) then return (select to_jsonb(c) from public.member_categories(actor) c where c.slug = p_slug); end if;
      raise exception 'Category creation conflict' using errcode = 'PT409';
    end if;
    if not exists (select 1 from public.categories c where c.slug = wanted_parent and c.parent_slug is null and c.user_id is null and c.is_active
      and c.slug in ('outerwear','tops','bottoms','onepiece','shoes','bags','accessories')) then
      raise exception 'Invalid parent category' using errcode = '22023';
    end if;
    target_parent := wanted_parent;
  else
    if existing.slug is null or (existing.user_id is not null and existing.user_id <> actor) then
      raise exception 'Category unavailable' using errcode = '42501';
    end if;
    if existing.parent_slug is distinct from wanted_parent then raise exception 'Category parent cannot change' using errcode = '22023'; end if;
    target_parent := existing.parent_slug;
    select p.* into pref from public.category_preferences p where p.user_id = actor and p.category_slug = p_slug for update;
    if coalesce(pref.updated_at,'epoch'::timestamptz) is distinct from p_expected then
      if pref.label_ko = title and pref.is_active = p_active then
        return (select to_jsonb(c) from public.member_categories(actor) c where c.slug = p_slug);
      end if;
      raise exception 'Category changed' using errcode = 'PT409';
    end if;
  end if;
  if exists (select 1 from public.member_categories(actor) c where c.slug <> p_slug and c.parent_slug is not distinct from target_parent and lower(c.label_ko) = lower(title)) then
    raise exception 'Duplicate category name' using errcode = '23505';
  end if;
  if existing.slug is null then
    select coalesce(max(c.position),0) + 10 into next_position from public.member_categories(actor) c where c.parent_slug = target_parent;
    insert into public.categories(slug,parent_slug,label_ko,position,user_id) values(p_slug,target_parent,title,next_position,actor);
  end if;
  insert into public.category_preferences(user_id,category_slug,label_ko,is_active) values(actor,p_slug,title,p_active)
  on conflict (user_id,category_slug) do update set label_ko = excluded.label_ko,is_active = excluded.is_active,
    updated_at = greatest(clock_timestamp(),public.category_preferences.updated_at + interval '1 microsecond');
  return (select to_jsonb(c) from public.member_categories(actor) c where c.slug = p_slug);
end $function$
;

CREATE OR REPLACE FUNCTION public.save_outfit(p_id uuid, p_expected timestamp with time zone DEFAULT NULL::timestamp with time zone, p_draft jsonb DEFAULT NULL::jsonb)
 RETURNS public.outfits
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      raise exception 'Outfit conflict' using errcode = 'PT409';
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
$function$
;

CREATE OR REPLACE FUNCTION public.set_brand_image(p_id uuid, p_path text, p_expected timestamp with time zone)
 RETURNS public.brands
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare b public.brands; meta jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('brand:' || p_id::text,0));
  select * into b from public.brands where id = p_id and user_id = auth.uid() for update;
  if not found then raise exception 'Access denied' using errcode = '42501'; end if;
  if b.deleted_at is not null then raise exception 'Brand deleted' using errcode = 'P0002'; end if;
  if b.image_path is not distinct from p_path then return b; end if;
  if p_expected is null or b.updated_at <> p_expected then raise exception 'Brand conflict' using errcode = 'PT409'; end if;
  if p_path is not null then
    if p_path !~ ('^' || b.user_id::text || '/brands/' || b.id::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$') then raise exception 'Invalid image path' using errcode = '22023'; end if;
    select metadata into meta from storage.objects where bucket_id = 'brand-private' and name = p_path for share;
    if not found or meta is null or coalesce((meta->>'size')::bigint,0) not between 1 and 5242880
      or coalesce(meta->>'mimetype','') not in ('image/jpeg','image/png','image/webp') then raise exception 'Image not uploaded' using errcode = '23514'; end if;
  end if;
  update public.brands set image_path = p_path,updated_at = greatest(clock_timestamp(),b.updated_at + interval '1 microsecond') where id = b.id returning * into b;
  return b;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_outfit_presentation(p_outfit uuid, p_expected timestamp with time zone, p_mode text, p_preset text)
 RETURNS public.outfit_presentations
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare o public.outfits; result public.outfit_presentations;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_mode is null or p_mode<>all(array['items','mannequin']) or p_preset is null or p_preset<>all(array['slim','regular','broad']) then raise exception 'Invalid presentation' using errcode='22023'; end if;
 select * into o from public.outfits where id=p_outfit and user_id=auth.uid() and deleted_at is null for share;
 if not found then raise exception 'Outfit unavailable' using errcode='P0002'; end if;
 if p_expected is null or o.updated_at<>p_expected then raise exception 'Outfit changed' using errcode='PT409'; end if;
 insert into public.outfit_presentations(outfit_id,user_id,view_mode,body_preset) values(o.id,o.user_id,p_mode,p_preset)
 on conflict(outfit_id) do update set view_mode=excluded.view_mode,body_preset=excluded.body_preset,
  render_id=case when outfit_presentations.view_mode=excluded.view_mode and outfit_presentations.body_preset=excluded.body_preset then outfit_presentations.render_id else null end,
  updated_at=clock_timestamp()
 returning * into result;
 return result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.update_wear_event(p_id uuid, p_expected timestamp with time zone, p_worn_on date, p_memo text DEFAULT ''::text, p_mode text DEFAULT 'keep'::text, p_outfit uuid DEFAULT NULL::uuid, p_outfit_expected timestamp with time zone DEFAULT NULL::timestamp with time zone, p_items uuid[] DEFAULT NULL::uuid[])
 RETURNS public.wear_events
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if current_event.updated_at <> p_expected then raise exception 'Wear edit conflict' using errcode = 'PT409'; end if;
  if p_mode = 'outfit' then
    perform pg_advisory_xact_lock(hashtextextended('closet.outfit.' || p_outfit::text,0));
    select * into source from public.outfits where id = p_outfit and user_id = owner_id and deleted_at is null for share;
    if not found then raise exception 'Outfit unavailable' using errcode = 'P0002'; end if;
    if source.updated_at <> p_outfit_expected then raise exception 'Outfit changed' using errcode = 'PT409'; end if;
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
$function$
;


