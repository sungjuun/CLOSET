-- Once published, a path cannot be deleted and reinserted with different bytes.
-- Missing ready objects are removed through the object-first cleanup workflow.
create or replace function app_private.storage_image_allowed(object_name text, writing boolean)
returns boolean language plpgsql volatile security invoker set search_path = '' as $$
declare image_id uuid; clothing_id uuid;
begin
  if writing then
    select id,item_id into image_id,clothing_id from public.item_images
      where user_id = (select auth.uid()) and storage_path = object_name and upload_status = 'pending';
    if not found then return false; end if;
    perform 1 from public.wardrobe_items where id = clothing_id and user_id = (select auth.uid())
      and lifecycle_status = 'active' and deleted_at is null for share;
    if not found then return false; end if;
    perform 1 from public.item_images where id = image_id and user_id = (select auth.uid())
      and storage_path = object_name and upload_status = 'pending' for share;
    return found;
  end if;
  return exists (
    select 1 from public.item_images image join public.wardrobe_items item on item.id = image.item_id and item.user_id = image.user_id
    where image.user_id = (select auth.uid()) and image.storage_path = object_name
  );
end $$;
