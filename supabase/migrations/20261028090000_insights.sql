-- Read-only, owner/RLS-scoped item statistics. The same unpaged relation feeds
-- the dashboard inside PostgreSQL, avoiding client/API row-limit truncation.
create function public.insight_item_stats(
  p_owner uuid,p_as_of date,p_days integer default null,p_mode text default 'most',p_search text default ''
) returns table(
  item_id uuid,name text,brand_name text,category_slug text,lifecycle_status text,currency text,purchase_price numeric,
  period_wear_count bigint,lifetime_wear_count bigint,last_worn_on date,cost_per_wear numeric,created_at timestamptz
) language plpgsql stable security invoker set search_path = '' as $$
declare start_on date;
begin
  if p_as_of is null or p_as_of not between date '1900-01-01' and date '9999-12-31'
    or (p_days is not null and p_days not in (30,90)) or p_mode is null or p_mode not in ('all','most','unrecorded','recent')
    or p_search is null or length(p_search) > 200 then raise exception 'Invalid insight scope' using errcode = '22023'; end if;
  start_on := case when p_days is null then date '1900-01-01' else greatest(date '1900-01-01',p_as_of - (p_days - 1)) end;
  return query
  with history as (
    select link.item_id,event.worn_on,event.id from public.wear_event_items link
    join public.wear_events event on event.id = link.wear_event_id and event.user_id = link.user_id
    where link.user_id = auth.uid() and link.user_id = p_owner and event.deleted_at is null
      and event.worn_on between date '1900-01-01' and p_as_of
  ), stats as (
    select item.id as item_id,item.name,item.brand_name,item.category_slug,item.lifecycle_status,item.currency,item.purchase_price,
      count(history.id) filter(where history.worn_on >= start_on) as period_wear_count,
      count(history.id) as lifetime_wear_count,max(history.worn_on) as last_worn_on,
      case when count(history.id) > 0 and item.purchase_price is not null then round(item.purchase_price / count(history.id)::numeric,2) else null end as cost_per_wear,
      item.created_at
    from public.wardrobe_items item left join history on history.item_id = item.id
    where item.user_id = auth.uid() and item.user_id = p_owner and item.deleted_at is null
    group by item.id,item.name,item.brand_name,item.category_slug,item.lifecycle_status,item.currency,item.purchase_price,item.created_at
  ) select stats.* from stats
  where (p_mode <> 'most' or stats.period_wear_count > 0)
    and (p_mode <> 'unrecorded' or stats.period_wear_count = 0)
    and (btrim(p_search) = '' or strpos(lower(stats.name),lower(btrim(p_search))) > 0 or strpos(lower(coalesce(stats.brand_name,'')),lower(btrim(p_search))) > 0)
  order by
    case when p_mode = 'most' then stats.period_wear_count end desc,
    case when p_mode = 'most' then stats.lifetime_wear_count end desc,
    case when p_mode = 'unrecorded' then stats.last_worn_on end asc nulls first,
    case when p_mode in ('unrecorded','recent') then stats.created_at end desc,
    lower(stats.name),stats.item_id;
end;
$$;

create function public.wardrobe_insights(p_owner uuid,p_as_of date,p_days integer default null)
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
      join public.categories category on category.slug = coalesce(tree.root_slug,item.category_slug)
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

revoke all on function public.insight_item_stats(uuid,date,integer,text,text),public.wardrobe_insights(uuid,date,integer) from public,anon;
grant execute on function public.insight_item_stats(uuid,date,integer,text,text),public.wardrobe_insights(uuid,date,integer) to authenticated;
