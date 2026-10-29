-- Keep the seven canonical roots/identifiers used by existing garments/outfits.
-- Names, order and visibility are member preferences; custom leaves are private.
alter table public.categories add column user_id uuid references auth.users(id) on delete cascade;
alter table public.categories add constraint custom_category_leaf check (
  user_id is null or (parent_slug is not null and slug ~ '^u_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
);
create index categories_member_idx on public.categories(user_id,parent_slug);
alter policy categories_read on public.categories using (user_id is null or user_id = (select auth.uid()));

create table public.category_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  category_slug text not null references public.categories(slug) on delete cascade,
  label_ko text check (label_ko = btrim(label_ko) and length(label_ko) between 1 and 80),
  position integer check (position >= 0),
  is_active boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id,category_slug)
);
alter table public.category_preferences enable row level security;
create policy own_category_preferences on public.category_preferences for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.category_preferences from public,anon,authenticated;
grant select on public.category_preferences to authenticated;
grant all on public.category_preferences to service_role;

create function app_private.validate_custom_category() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.user_id is distinct from old.user_id then
    raise exception 'Category ownership is immutable' using errcode = '23514';
  end if;
  if new.user_id is not null and not exists (
    select 1 from public.categories parent where parent.slug = new.parent_slug
      and parent.user_id is null and parent.parent_slug is null
      and parent.slug in ('outerwear','tops','bottoms','onepiece','shoes','bags','accessories')
  ) then raise exception 'A private category must belong to a canonical root' using errcode = '23514'; end if;
  return new;
end $$;
create trigger validate_custom_category before insert or update on public.categories for each row execute function app_private.validate_custom_category();

-- The existing global slug FK alone cannot reject another member's custom leaf.
create function app_private.validate_wardrobe_category_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    with recursive ancestors as (
      select c.slug,c.parent_slug,c.user_id,array[c.slug] as path from public.categories c where c.slug = new.category_slug
      union all
      select c.slug,c.parent_slug,c.user_id,a.path || c.slug from public.categories c join ancestors a on c.slug = a.parent_slug where not c.slug = any(a.path)
    ) select 1 from ancestors where user_id is not null and user_id <> new.user_id
  ) then raise exception 'Category is not available to this owner' using errcode = '23503'; end if;
  return new;
end $$;
create trigger wardrobe_category_owner before insert or update of category_slug,user_id on public.wardrobe_items for each row execute function app_private.validate_wardrobe_category_owner();
revoke all on function app_private.validate_custom_category(),app_private.validate_wardrobe_category_owner() from public,anon,authenticated;

create function public.member_categories(p_owner uuid)
returns table(slug text,parent_slug text,label_ko text,"position" integer,is_active boolean,is_custom boolean,updated_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select c.slug,c.parent_slug,coalesce(pref.label_ko,c.label_ko),coalesce(pref.position,c.position),
    c.is_active and coalesce(pref.is_active,true),c.user_id is not null,coalesce(pref.updated_at,'epoch'::timestamptz)
  from public.categories c left join public.category_preferences pref on pref.category_slug = c.slug and pref.user_id = p_owner
  where p_owner = auth.uid() and (c.user_id is null or c.user_id = p_owner)
  order by coalesce(pref.position,c.position),c.slug;
$$;

create function public.save_member_category(p_slug text,p_label text,p_active boolean,p_parent text default null,p_expected timestamptz default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
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
  select c.* into existing from public.categories c where c.slug = p_slug;
  if p_expected is null then
    if p_slug !~ '^u_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Invalid custom category identifier' using errcode = '22023';
    end if;
    if existing.slug is not null then
      if existing.user_id = actor and existing.parent_slug = wanted_parent and exists (
        select 1 from public.member_categories(actor) c where c.slug = p_slug and c.label_ko = title and c.is_active = p_active
      ) then return (select to_jsonb(c) from public.member_categories(actor) c where c.slug = p_slug); end if;
      raise exception 'Category creation conflict' using errcode = '40001';
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
      raise exception 'Category changed' using errcode = '40001';
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
end $$;

create function public.reorder_member_categories(p_parent text,p_order text[],p_expected text[])
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); current_order text[]; wanted_parent text := nullif(p_parent,'');
begin
  if actor is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('member-categories:' || actor::text,0));
  select coalesce(array_agg(c.slug order by c.position,c.slug),'{}'::text[]) into current_order
    from public.member_categories(actor) c where c.parent_slug is not distinct from wanted_parent;
  if current_order is distinct from p_expected then raise exception 'Category order changed' using errcode = '40001'; end if;
  if p_order is null or array_position(p_order,null) is not null or cardinality(p_order) <> cardinality(current_order)
    or (select count(distinct s) from unnest(p_order) s) <> cardinality(current_order)
    or not (p_order @> current_order and p_order <@ current_order) then
    raise exception 'Invalid category order' using errcode = '22023';
  end if;
  insert into public.category_preferences(user_id,category_slug,position)
    select actor,s.slug,((s.ordinality - 1) * 10)::integer from unnest(p_order) with ordinality s(slug,ordinality)
  on conflict (user_id,category_slug) do update set position = excluded.position,
    updated_at = greatest(clock_timestamp(),public.category_preferences.updated_at + interval '1 microsecond');
end $$;

revoke all on function public.member_categories(uuid),public.save_member_category(text,text,boolean,text,timestamptz),public.reorder_member_categories(text,text[],text[]) from public,anon,authenticated;
grant execute on function public.member_categories(uuid),public.save_member_category(text,text,boolean,text,timestamptz),public.reorder_member_categories(text,text[],text[]) to authenticated;

-- Statistics use the member display names without changing canonical roots.
create or replace function public.wardrobe_insights(p_owner uuid,p_as_of date,p_days integer default null)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare start_on date;
begin
  if p_as_of is null or p_as_of not between date '1900-01-01' and date '9999-12-31'
    or (p_days is not null and p_days not in (30,90)) then raise exception 'Invalid insight scope' using errcode = '22023'; end if;
  start_on := case when p_days is null then date '1900-01-01' else greatest(date '1900-01-01',p_as_of - (p_days - 1)) end;
  return (
    with recursive category_tree(root_slug,slug) as (
      select category.slug,category.slug from public.categories category where category.parent_slug is null
      union
      select tree.root_slug,child.slug from public.categories child join category_tree tree on child.parent_slug = tree.slug
    ), items as materialized (
      select * from public.insight_item_stats(p_owner,p_as_of,p_days,'all','')
    ), events as materialized (
      select event.id,event.worn_on from public.wear_events event
      where event.user_id = auth.uid() and event.user_id = p_owner and event.deleted_at is null and event.worn_on between start_on and p_as_of
    ), brands as (
      select nullif(btrim(item.brand_name),'') as name,count(*) as count from items item group by nullif(btrim(item.brand_name),'')
    ), top_brands as (
      select * from brands order by count desc,name asc nulls last limit 10
    ), categories as (
      select coalesce(tree.root_slug,item.category_slug) as slug,category.label_ko as name,count(*) as count
      from items item left join category_tree tree on tree.slug = item.category_slug
      join public.member_categories(p_owner) category on category.slug = coalesce(tree.root_slug,item.category_slug)
      group by coalesce(tree.root_slug,item.category_slug),category.label_ko
    ), costs as (
      select item.currency,sum(item.purchase_price) as amount,count(*) as priced_items from items item where item.purchase_price is not null group by item.currency
    ) select jsonb_build_object(
      'as_of',p_as_of,'start_on',case when p_days is null then null else start_on end,'days',p_days,
      'wardrobe',jsonb_build_object(
        'total',(select count(*) from items),'active',(select count(*) from items where lifecycle_status = 'active'),
        'archived',(select count(*) from items where lifecycle_status = 'archived'),'sold',(select count(*) from items where lifecycle_status = 'sold'),
        'donated',(select count(*) from items where lifecycle_status = 'donated'),'priced',(select count(*) from items where purchase_price is not null),
        'unpriced',(select count(*) from items where purchase_price is null),'recorded',(select count(*) from items where period_wear_count > 0),
        'unrecorded',(select count(*) from items where period_wear_count = 0),'never_recorded',(select count(*) from items where lifetime_wear_count = 0)
      ),
      'wear',jsonb_build_object('events',(select count(*) from events),'days',(select count(distinct worn_on) from events),
        'garment_uses',(select count(*) from events join public.wear_event_items link on link.wear_event_id = events.id and link.user_id = auth.uid() and link.user_id = p_owner)),
      'costs',coalesce((select jsonb_agg(to_jsonb(costs) order by currency) from costs),'[]'::jsonb),
      'categories',coalesce((select jsonb_agg(to_jsonb(categories) order by count desc,name,slug) from categories),'[]'::jsonb),
      'brands',coalesce((select jsonb_agg(to_jsonb(top_brands) order by count desc,name asc nulls last) from top_brands),'[]'::jsonb),
      'other_brand_count',coalesce((select sum(count) from brands),0) - coalesce((select sum(count) from top_brands),0)
    )
  );
end;
$$;
