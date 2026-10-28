-- Explicit completion and primary photo selection. Reservations still occupy
-- one of five unique slots until their object is removed and row is deleted.
alter table public.item_images
  add column upload_status text not null default 'pending' check (upload_status in ('pending','ready')),
  add column is_primary boolean not null default false,
  add constraint images_primary_ready check (not is_primary or upload_status = 'ready');

update public.item_images image set upload_status = 'ready'
where exists (select 1 from storage.objects object where object.bucket_id = 'wardrobe-private' and object.name = image.storage_path);
update public.item_images image set is_primary = true where image.id in (
  select distinct on (item_id) id from public.item_images where upload_status = 'ready' order by item_id, image_order, id
);
create unique index images_one_primary on public.item_images(item_id) where is_primary;

-- Neither ready nor primary can be forged in direct client INSERT/UPDATE.
revoke insert on public.item_images from authenticated;
grant insert (id, user_id, item_id, storage_path, image_order, source_kind) on public.item_images to authenticated;

create function public.reserve_item_image(p_item_id uuid, p_image_id uuid, p_extension text default 'webp')
returns public.item_images language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  clothing public.wardrobe_items;
  image public.item_images;
  free_slot int;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_extension not in ('jpg','png','webp') then raise exception 'Invalid format' using errcode = '23514'; end if;
  select * into clothing from public.wardrobe_items where id = p_item_id and user_id = owner_id for update;
  if not found then raise exception 'Item unavailable' using errcode = '42501'; end if;
  select * into image from public.item_images where id = p_image_id and user_id = owner_id and item_id = p_item_id;
  if found then
    if image.storage_path <> owner_id::text || '/items/' || p_item_id::text || '/' || p_image_id::text || '.' || p_extension then
      raise exception 'Reservation differs' using errcode = '23514';
    end if;
    return image;
  end if;
  if clothing.deleted_at is not null or clothing.lifecycle_status <> 'active' then
    raise exception 'Item inactive' using errcode = '23514';
  end if;
  select slot into free_slot from generate_series(0,4) slot where not exists (
    select 1 from public.item_images where item_id = p_item_id and image_order = slot
  ) order by slot limit 1;
  if free_slot is null then raise exception 'Maximum five photos' using errcode = 'P0001'; end if;
  insert into public.item_images(id, user_id, item_id, image_order, storage_path)
  values (p_image_id, owner_id, p_item_id, free_slot, owner_id::text || '/items/' || p_item_id::text || '/' || p_image_id::text || '.' || p_extension)
  returning * into image;
  return image;
end $$;

create function public.complete_item_image(p_image_id uuid)
returns public.item_images language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  image public.item_images;
  object_metadata jsonb;
  expected_type text;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select * into image from public.item_images where id = p_image_id and user_id = owner_id;
  if not found then raise exception 'Photo unavailable' using errcode = '42501'; end if;
  perform 1 from public.wardrobe_items where id = image.item_id and user_id = owner_id for update;
  -- Re-read after acquiring the item lock: another operation may have deleted it.
  select * into image from public.item_images where id = p_image_id and user_id = owner_id for update;
  if not found then raise exception 'Photo unavailable' using errcode = '42501'; end if;
  select metadata into object_metadata from storage.objects where bucket_id = 'wardrobe-private' and name = image.storage_path;
  if not found then raise exception 'Upload missing' using errcode = 'P0002'; end if;
  expected_type := case when image.storage_path like '%.webp' then 'image/webp' when image.storage_path like '%.png' then 'image/png' else 'image/jpeg' end;
  if coalesce((object_metadata->>'size')::bigint,0) not between 1 and 5242880 or object_metadata->>'mimetype' is distinct from expected_type then
    raise exception 'Invalid uploaded metadata' using errcode = '23514';
  end if;
  if image.upload_status = 'ready' then return image; end if;
  update public.item_images set upload_status = 'ready',
    is_primary = not exists (select 1 from public.item_images where item_id = image.item_id and is_primary)
  where id = p_image_id returning * into image;
  return image;
end $$;

create function public.set_primary_item_image(p_image_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  image public.item_images;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select * into image from public.item_images where id = p_image_id and user_id = owner_id;
  if not found then raise exception 'Photo unavailable' using errcode = '42501'; end if;
  perform 1 from public.wardrobe_items where id = image.item_id and user_id = owner_id for update;
  select * into image from public.item_images where id = p_image_id and user_id = owner_id for update;
  if not found or image.upload_status <> 'ready' then raise exception 'Photo unavailable' using errcode = '42501'; end if;
  update public.item_images set is_primary = false where item_id = image.item_id and user_id = owner_id and is_primary;
  update public.item_images set is_primary = true where id = p_image_id and user_id = owner_id;
end $$;

create function public.remove_item_image(p_image_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  image public.item_images;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select * into image from public.item_images where id = p_image_id and user_id = owner_id;
  if not found then return; end if;
  perform 1 from public.wardrobe_items where id = image.item_id and user_id = owner_id for update;
  select * into image from public.item_images where id = p_image_id and user_id = owner_id for update;
  if not found then return; end if;
  -- protect_image_reference also enforces object-first deletion.
  delete from public.item_images where id = p_image_id and user_id = owner_id;
  if image.is_primary then
    update public.item_images set is_primary = true where id = (
      select id from public.item_images where item_id = image.item_id and user_id = owner_id and upload_status = 'ready' order by image_order,id limit 1
    );
  end if;
end $$;

revoke all on function public.reserve_item_image(uuid,uuid,text), public.complete_item_image(uuid),
  public.set_primary_item_image(uuid), public.remove_item_image(uuid) from public, anon;
grant execute on function public.reserve_item_image(uuid,uuid,text), public.complete_item_image(uuid),
  public.set_primary_item_image(uuid), public.remove_item_image(uuid) to authenticated;
