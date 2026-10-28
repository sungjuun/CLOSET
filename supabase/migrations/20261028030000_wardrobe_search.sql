-- Read-only, RLS-respecting search. Parameters are values, never PostgREST
-- filter fragments or dynamic SQL. strpos treats %, _, quotes, etc literally.
create function public.search_wardrobe_items(
  p_owner uuid,
  p_search text default '',
  p_category text default '',
  p_brand text default '',
  p_color text default '',
  p_season text default '',
  p_favorite_only boolean default false,
  p_status text default '',
  p_sort text default 'recent'
) returns setof public.wardrobe_items
language plpgsql stable security invoker set search_path = '' as $$
begin
  if length(p_search) > 200 or length(p_brand) > 120 or length(p_color) > 60 or length(p_category) > 80
    or p_season not in ('','spring','summer','autumn','winter')
    or p_status not in ('','active','archived','sold','donated')
    or p_sort not in ('recent','oldest','name','brand','price_asc','price_desc') then
    raise exception 'Invalid list filters' using errcode = '22023';
  end if;
  return query
  with recursive category_tree(slug) as (
    select category.slug from public.categories category where category.slug = p_category
    union
    select child.slug from public.categories child join category_tree parent on child.parent_slug = parent.slug
  )
  select item.* from public.wardrobe_items item
  where item.user_id = auth.uid() and item.user_id = p_owner and item.deleted_at is null
    and (coalesce(trim(p_search),'') = ''
      or strpos(lower(item.name), lower(trim(p_search))) > 0
      or strpos(lower(coalesce(item.brand_name,'')), lower(trim(p_search))) > 0
      or strpos(lower(coalesce(item.color_name,'')), lower(trim(p_search))) > 0)
    and (p_category = '' or item.category_slug in (select slug from category_tree))
    and (p_brand = '' or item.brand_name = p_brand)
    and (p_color = '' or item.color_name = p_color)
    and (p_season = '' or p_season = any(item.seasons))
    and (not p_favorite_only or item.is_favorite)
    and (p_status = '' or item.lifecycle_status = p_status)
  order by
    case when p_sort = 'oldest' then item.created_at end asc,
    case when p_sort = 'name' then lower(item.name) end asc,
    case when p_sort = 'brand' then lower(item.brand_name) end asc nulls last,
    case when p_sort in ('price_asc','price_desc') then item.purchase_price is null end asc,
    case when p_sort in ('price_asc','price_desc') then item.currency end asc,
    case when p_sort = 'price_asc' then item.purchase_price end asc nulls last,
    case when p_sort = 'price_desc' then item.purchase_price end desc nulls last,
    item.created_at desc, item.id desc;
end $$;

create function public.wardrobe_filter_options(p_owner uuid)
returns table(brands text[], colors text[])
language sql stable security invoker set search_path = '' as $$
  select
    coalesce(array_agg(distinct item.brand_name order by item.brand_name) filter (where nullif(trim(item.brand_name),'') is not null), '{}'::text[]),
    coalesce(array_agg(distinct item.color_name order by item.color_name) filter (where nullif(trim(item.color_name),'') is not null), '{}'::text[])
  from public.wardrobe_items item
  where item.user_id = auth.uid() and item.user_id = p_owner and item.deleted_at is null;
$$;

revoke all on function public.search_wardrobe_items(uuid,text,text,text,text,text,boolean,text,text),
  public.wardrobe_filter_options(uuid) from public, anon;
grant execute on function public.search_wardrobe_items(uuid,text,text,text,text,text,boolean,text,text),
  public.wardrobe_filter_options(uuid) to authenticated;
