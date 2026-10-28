-- Bound-value search across saved outfits and their current garments.
-- EXISTS keeps counts/pagination at one row per outfit, even for several matches.
create function public.search_outfits(
  p_owner uuid,
  p_search text default '',
  p_brand text default '',
  p_tag text default '',
  p_season text default '',
  p_favorite_only boolean default false,
  p_sort text default 'recent'
) returns setof public.outfits
language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_search is null or p_brand is null or p_tag is null or p_season is null or p_favorite_only is null or p_sort is null
    or length(p_search) > 200 or length(p_brand) > 120 or length(p_tag) > 40
    or p_season not in ('','spring','summer','autumn','winter')
    or p_sort not in ('recent','updated','oldest','name') then
    raise exception 'Invalid outfit filters' using errcode = '22023';
  end if;
  return query
  select outfit.* from public.outfits outfit
  where outfit.user_id = auth.uid() and outfit.user_id = p_owner and outfit.deleted_at is null
    and (btrim(p_search) = ''
      or strpos(lower(outfit.name), lower(btrim(p_search))) > 0
      or strpos(lower(coalesce(outfit.memo,'')), lower(btrim(p_search))) > 0
      or exists (select 1 from unnest(outfit.tags) tag where strpos(lower(tag),lower(btrim(p_search))) > 0)
      or exists (
        select 1 from public.outfit_items entry
        join public.wardrobe_items item on item.id = entry.item_id and item.user_id = entry.user_id
        where entry.outfit_id = outfit.id and entry.user_id = auth.uid() and item.deleted_at is null
          and strpos(lower(coalesce(item.brand_name,'')), lower(btrim(p_search))) > 0
      ))
    and (p_brand = '' or exists (
      select 1 from public.outfit_items entry
      join public.wardrobe_items item on item.id = entry.item_id and item.user_id = entry.user_id
      where entry.outfit_id = outfit.id and entry.user_id = auth.uid() and item.deleted_at is null and item.brand_name = p_brand
    ))
    and (p_tag = '' or p_tag = any(outfit.tags))
    and (p_season = '' or p_season = any(outfit.seasons))
    and (not p_favorite_only or outfit.is_favorite)
  order by
    case when p_sort = 'recent' then outfit.created_at end desc,
    case when p_sort = 'updated' then outfit.updated_at end desc,
    case when p_sort = 'oldest' then outfit.created_at end asc,
    case when p_sort = 'name' then lower(outfit.name) end asc,
    case when p_sort in ('oldest','name') then outfit.id end asc,
    outfit.id desc;
end;
$$;

create function public.outfit_filter_options(p_owner uuid)
returns table(brands text[], tags text[])
language sql stable security invoker set search_path = '' as $$
  with own_outfits as (
    select outfit.id, outfit.tags from public.outfits outfit
    where outfit.user_id = auth.uid() and outfit.user_id = p_owner and outfit.deleted_at is null
  )
  select
    array(
      select distinct item.brand_name from own_outfits outfit
      join public.outfit_items entry on entry.outfit_id = outfit.id and entry.user_id = auth.uid()
      join public.wardrobe_items item on item.id = entry.item_id and item.user_id = entry.user_id
      where item.deleted_at is null and nullif(btrim(item.brand_name),'') is not null
      order by item.brand_name
    ),
    array(
      select distinct tag from own_outfits outfit cross join lateral unnest(outfit.tags) tag
      where nullif(btrim(tag),'') is not null order by tag
    );
$$;

revoke all on function public.search_outfits(uuid,text,text,text,text,boolean,text), public.outfit_filter_options(uuid) from public,anon;
grant execute on function public.search_outfits(uuid,text,text,text,text,boolean,text), public.outfit_filter_options(uuid) to authenticated;
