-- Keep a tombstone so delayed uploads/saves cannot recreate a deleted brand.
alter table public.brands add column deleted_at timestamptz;
alter table public.brands drop constraint brands_user_id_name_key;
create unique index brands_active_name on public.brands(user_id,name) where deleted_at is null;
alter policy own_brands on public.brands using (user_id = (select auth.uid()) and deleted_at is null);

create or replace function app_private.sync_item_brand() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.brand_id is not null then
    select b.name into new.brand_name from public.brands b
    where b.id = new.brand_id and b.user_id = new.user_id and b.deleted_at is null for share;
    if not found then raise exception 'Invalid brand' using errcode = '23503'; end if;
  elsif tg_op = 'UPDATE' and old.brand_id is not null then
    new.brand_name := null;
  end if;
  return new;
end;
$$;

create or replace function public.save_brand(p_id uuid,p_name text,p_expected timestamptz default null)
returns public.brands language plpgsql security definer set search_path = '' as $$
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
    if p_expected is null or b.updated_at <> p_expected then raise exception 'Brand conflict' using errcode = '40001'; end if;
    -- Writers on wardrobe rows acquire a brand SHARE lock. Refuse a busy row
    -- rather than wait for the opposite lock order while holding this brand.
    perform i.id from public.wardrobe_items i where i.user_id = owner and i.brand_id = b.id order by i.id for update nowait;
    update public.brands set name = title,updated_at = greatest(clock_timestamp(),b.updated_at + interval '1 microsecond') where id = b.id returning * into b;
    update public.wardrobe_items set brand_name = b.name where user_id = owner and brand_id = b.id;
  else
    if p_expected is not null then raise exception 'Brand conflict' using errcode = '40001'; end if;
    insert into public.brands(id,user_id,name) values(p_id,owner,title) returning * into b;
  end if;
  return b;
end;
$$;

create or replace function public.set_brand_image(p_id uuid,p_path text,p_expected timestamptz)
returns public.brands language plpgsql security definer set search_path = '' as $$
declare b public.brands; meta jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('brand:' || p_id::text,0));
  select * into b from public.brands where id = p_id and user_id = auth.uid() for update;
  if not found then raise exception 'Access denied' using errcode = '42501'; end if;
  if b.deleted_at is not null then raise exception 'Brand deleted' using errcode = 'P0002'; end if;
  if b.image_path is not distinct from p_path then return b; end if;
  if p_expected is null or b.updated_at <> p_expected then raise exception 'Brand conflict' using errcode = '40001'; end if;
  if p_path is not null then
    if p_path !~ ('^' || b.user_id::text || '/brands/' || b.id::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$') then raise exception 'Invalid image path' using errcode = '22023'; end if;
    select metadata into meta from storage.objects where bucket_id = 'brand-private' and name = p_path for share;
    if not found or meta is null or coalesce((meta->>'size')::bigint,0) not between 1 and 5242880
      or coalesce(meta->>'mimetype','') not in ('image/jpeg','image/png','image/webp') then raise exception 'Image not uploaded' using errcode = '23514'; end if;
  end if;
  update public.brands set image_path = p_path,updated_at = greatest(clock_timestamp(),b.updated_at + interval '1 microsecond') where id = b.id returning * into b;
  return b;
end;
$$;

create function public.delete_brand(p_id uuid,p_expected timestamptz)
returns public.brands language plpgsql security definer set search_path = '' as $$
declare b public.brands; owner uuid := auth.uid();
begin
  if owner is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('brand:' || p_id::text,0));
  select * into b from public.brands where id = p_id and user_id = owner for update;
  if not found then raise exception 'Access denied' using errcode = '42501'; end if;
  if b.deleted_at is not null then return b; end if;
  if p_expected is null or b.updated_at <> p_expected then raise exception 'Brand conflict' using errcode = '40001'; end if;
  perform i.id from public.wardrobe_items i where i.user_id = owner and i.brand_id = b.id order by i.id for update nowait;
  update public.wardrobe_items set brand_id = null,brand_name = null where user_id = owner and brand_id = b.id;
  update public.brands set deleted_at = clock_timestamp(),updated_at = greatest(clock_timestamp(),b.updated_at + interval '1 microsecond') where id = b.id returning * into b;
  return b;
end;
$$;
revoke all on function public.delete_brand(uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.delete_brand(uuid,timestamptz) to authenticated,service_role;

create or replace function app_private.brand_object_allowed(object_name text,operation text) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare b public.brands;
begin
  if auth.uid() is null or object_name !~ ('^' || auth.uid()::text || '/brands/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$') then return false; end if;
  select * into b from public.brands where user_id = auth.uid() and id::text = split_part(object_name,'/',3) for share;
  if not found then return false; end if;
  -- Own deleted objects remain readable for Storage's delete selection, and
  -- retryable cleanup; new uploads to a deleted brand are always denied.
  if b.deleted_at is not null then return operation in ('read','delete'); end if;
  return operation <> 'delete' or b.image_path is distinct from object_name;
end;
$$;
