-- Read-only reference information for lifecycle/delete confirmation. RLS remains
-- active, and both the expected owner and current JWT identity must agree.
create function public.wardrobe_item_usage(p_owner uuid, p_item uuid)
returns table(outfit_count bigint, wear_count bigint, outfit_names text[])
language sql stable security invoker set search_path = '' as $$
  with linked as (
    select outfit.id, outfit.name
    from public.outfits outfit
    join public.outfit_items link on link.outfit_id = outfit.id and link.user_id = outfit.user_id
    where link.item_id = p_item and link.user_id = auth.uid() and link.user_id = p_owner
      and outfit.deleted_at is null
  )
  select (select count(*) from linked),
    (select count(*) from public.wear_event_items history
      where history.item_id = p_item and history.user_id = auth.uid() and history.user_id = p_owner),
    coalesce((select array_agg(name order by name, id) from linked), '{}'::text[]);
$$;
revoke all on function public.wardrobe_item_usage(uuid,uuid) from public, anon;
grant execute on function public.wardrobe_item_usage(uuid,uuid) to authenticated;
