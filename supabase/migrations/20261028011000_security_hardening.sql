-- Initial CLOSET hardening. Apply after 20261028010000_initial_schema.sql.
-- No product RPCs are exposed yet; outfit/wear writes stay closed until their stages.
create schema if not exists app_private;
revoke all on schema app_private from public, anon;
grant usage on schema app_private to authenticated, service_role;

create function app_private.valid_tags(values_to_check text[])
returns boolean language sql immutable set search_path = '' as $$
  select cardinality(values_to_check) <= 20 and not exists (
    select 1 from unnest(values_to_check) value
    where value is null or length(trim(value)) not between 1 and 40
  );
$$;

create function app_private.valid_image_path(owner_id uuid, clothing_id uuid, object_path text)
returns boolean language sql immutable set search_path = '' as $$
  select array_length(string_to_array(object_path, '/'), 1) = 4
    and split_part(object_path, '/', 1) = owner_id::text
    and split_part(object_path, '/', 2) = 'items'
    and split_part(object_path, '/', 3) = clothing_id::text
    and split_part(object_path, '/', 4) ~
      '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$';
$$;

alter table public.profiles
  add constraint profiles_name_length check (display_name is null or length(display_name) <= 80),
  add constraint profiles_currency check (default_currency ~ '^[A-Z]{3}$');

-- Untrusted signup metadata must not make account creation fail or grow without bound.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, display_name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 80));
  return new;
end $$;

alter table public.wardrobe_items
  alter column user_id set default auth.uid(),
  add constraint wardrobe_currency check (currency ~ '^[A-Z]{3}$'),
  add constraint wardrobe_hex check (color_hex is null or color_hex ~ '^#[0-9A-Fa-f]{6}$'),
  add constraint wardrobe_seasons check (seasons <@ array['spring','summer','autumn','winter']::text[] and array_position(seasons, null) is null),
  add constraint wardrobe_tags check (app_private.valid_tags(tags)),
  add constraint wardrobe_brand_length check (brand_name is null or length(brand_name) <= 120),
  add constraint wardrobe_color_length check (color_name is null or length(color_name) <= 60),
  add constraint wardrobe_size_length check (size_label is null or length(size_label) <= 60),
  add constraint wardrobe_material_length check (material is null or length(material) <= 200),
  add constraint wardrobe_notes_length check (notes is null or length(notes) <= 5000),
  add constraint wardrobe_purchase_url check (purchase_url is null or (length(purchase_url) <= 2048 and purchase_url ~ '^https://[^[:space:]]+$'));

alter table public.item_images
  alter column user_id set default auth.uid(),
  add constraint images_slot_range check (image_order between 0 and 4),
  add constraint images_slot_unique unique (item_id, image_order),
  add constraint images_path_valid check (app_private.valid_image_path(user_id, item_id, storage_path));

alter table public.outfits
  add constraint outfits_seasons check (seasons <@ array['spring','summer','autumn','winter']::text[] and array_position(seasons, null) is null),
  add constraint outfits_tags check (app_private.valid_tags(tags)),
  add constraint outfits_memo_length check (memo is null or length(memo) <= 5000),
  add constraint outfits_occasion_length check (occasion is null or length(occasion) <= 80);

alter table public.wear_events add constraint wear_memo_length check (memo is null or length(memo) <= 5000);
alter table public.import_jobs
  alter column user_id set default auth.uid(),
  add constraint import_https_url check (length(source_url) <= 2048 and source_url ~ '^https://[^[:space:]]+$');

-- Reserve one of five metadata slots BEFORE uploading. A reservation cannot be
-- removed while its file exists; otherwise deleting metadata would bypass quota.
create function app_private.protect_image_reference()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if (new.user_id, new.item_id, new.storage_path) is distinct from
       (old.user_id, old.item_id, old.storage_path) then
      raise exception 'Image identity is immutable' using errcode = '23514';
    end if;
    return new;
  end if;
  if exists (select 1 from storage.objects where bucket_id = 'wardrobe-private' and name = old.storage_path) then
    raise exception 'Remove the storage object before its reservation' using errcode = '23514';
  end if;
  return old;
end $$;

create trigger protect_image_reference before update or delete on public.item_images
for each row execute function app_private.protect_image_reference();

drop policy item_images_owner on public.item_images;
create policy images_read on public.item_images for select to authenticated
  using (user_id = (select auth.uid()));
create policy images_insert on public.item_images for insert to authenticated
  with check (user_id = (select auth.uid()) and source_kind = 'user_upload' and exists (
    select 1 from public.wardrobe_items item where item.id = item_id and item.user_id = (select auth.uid())
      and item.lifecycle_status = 'active' and item.deleted_at is null
  ));
create policy images_update on public.item_images for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy images_delete on public.item_images for delete to authenticated
  using (user_id = (select auth.uid()));

-- Invoker helper follows both item/image RLS. Use text comparison, not an unsafe
-- cast of arbitrary Storage object paths to UUID.
create function app_private.storage_image_allowed(object_name text, writing boolean)
returns boolean language plpgsql volatile security invoker set search_path = '' as $$
begin
  if writing then
    -- Hold the reservation/item until the object INSERT commits. This prevents
    -- concurrent reservation deletion from creating uncounted orphan uploads.
    perform 1 from public.item_images image
    join public.wardrobe_items item on item.id = image.item_id and item.user_id = image.user_id
    where image.user_id = (select auth.uid()) and image.storage_path = object_name
      and item.lifecycle_status = 'active' and item.deleted_at is null
    for share of image, item;
    return found;
  end if;
  return exists (
    select 1 from public.item_images image
    join public.wardrobe_items item on item.id = image.item_id and item.user_id = image.user_id
    where image.user_id = (select auth.uid()) and image.storage_path = object_name
  );
end;
$$;

drop policy wardrobe_storage_read on storage.objects;
drop policy wardrobe_storage_insert on storage.objects;
drop policy wardrobe_storage_update on storage.objects;
drop policy wardrobe_storage_delete on storage.objects;
create policy wardrobe_storage_read on storage.objects for select to authenticated
  using (bucket_id = 'wardrobe-private' and app_private.storage_image_allowed(name, false));
create policy wardrobe_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'wardrobe-private' and app_private.storage_image_allowed(name, true));
-- Object renaming/moving is closed; upload a new reserved path instead.
create policy wardrobe_storage_update on storage.objects for update to authenticated
  using (false) with check (false);
create policy wardrobe_storage_delete on storage.objects for delete to authenticated
  using (bucket_id = 'wardrobe-private' and app_private.storage_image_allowed(name, false));

update storage.buckets set public = false, file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg','image/png','image/webp']
where id = 'wardrobe-private';

-- Explicit least-privilege grants, independent of hosted/local default grants.
revoke all on table public.profiles, public.categories, public.wardrobe_items,
  public.item_images, public.outfits, public.outfit_items, public.wear_events,
  public.wear_event_items, public.import_jobs, public.item_wear_stats from anon, authenticated;
grant select on public.categories to anon, authenticated;
grant select on public.profiles, public.wardrobe_items, public.item_images,
  public.outfits, public.outfit_items, public.wear_events, public.wear_event_items,
  public.import_jobs, public.item_wear_stats to authenticated;
grant update (display_name, theme, default_currency) on public.profiles to authenticated;
grant insert, update on public.wardrobe_items to authenticated;
-- Preserve timestamps/owner/id on edits even if a caller bypasses the UI.
revoke update on public.wardrobe_items from authenticated;
grant update (name, brand_name, category_slug, color_name, color_hex, size_label,
  material, seasons, tags, purchase_price, currency, purchased_on, purchase_url,
  notes, is_favorite, lifecycle_status, deleted_at) on public.wardrobe_items to authenticated;
grant insert, delete on public.item_images to authenticated;
grant update (image_order) on public.item_images to authenticated;
grant insert on public.import_jobs to authenticated;
grant all on public.profiles, public.categories, public.wardrobe_items, public.item_images,
  public.outfits, public.outfit_items, public.wear_events, public.wear_event_items,
  public.import_jobs, public.item_wear_stats to service_role;

revoke execute on function public.handle_new_user(), public.set_updated_at() from public, anon, authenticated;
revoke all on all functions in schema app_private from public, anon, authenticated;
grant execute on function app_private.valid_tags(text[]), app_private.valid_image_path(uuid, uuid, text),
  app_private.storage_image_allowed(text, boolean) to authenticated, service_role;

comment on table public.outfits is 'Writes closed to authenticated until ownership-validating atomic RPC is introduced.';
comment on table public.wear_events is 'Writes closed to authenticated until snapshot RPC is introduced.';
