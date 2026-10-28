-- Private reusable brand directory. Keep brand_name as the search/display cache
-- for existing outfit/insight RPCs and older clients.
create table public.brands (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (name = btrim(name) and length(name) between 1 and 120),
  image_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, name),
  check (image_path is null or image_path ~ ('^' || user_id::text || '/brands/' || id::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$'))
);
alter table public.brands enable row level security;
create policy own_brands on public.brands for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.brands from public, anon, authenticated;
grant select on public.brands to authenticated;
grant all on public.brands to service_role;

alter table public.wardrobe_items add column brand_id uuid;
alter table public.wardrobe_items add constraint wardrobe_brand_owner_fk
  foreign key (brand_id, user_id) references public.brands(id, user_id) on delete restrict;
create index wardrobe_brand_idx on public.wardrobe_items(user_id, brand_id);
grant update (brand_id) on public.wardrobe_items to authenticated;

insert into public.brands(user_id, name)
select distinct user_id, btrim(brand_name) from public.wardrobe_items
where nullif(btrim(brand_name), '') is not null;
update public.wardrobe_items i set brand_id = b.id, brand_name = b.name
from public.brands b where b.user_id = i.user_id and b.name = btrim(i.brand_name);

create function app_private.sync_item_brand() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.brand_id is not null then
    select b.name into new.brand_name from public.brands b
    where b.id = new.brand_id and b.user_id = new.user_id for share;
    if not found then raise exception 'Invalid brand' using errcode = '23503'; end if;
  elsif tg_op = 'UPDATE' and old.brand_id is not null then
    new.brand_name := null;
  end if;
  return new;
end;
$$;
create trigger wardrobe_sync_brand before insert or update of brand_id, brand_name on public.wardrobe_items
for each row execute function app_private.sync_item_brand();
revoke all on function app_private.sync_item_brand() from public, anon, authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('brand-private', 'brand-private', false, 5242880, array['image/jpeg','image/png','image/webp']);

create function app_private.brand_object_allowed(object_name text, operation text) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare b public.brands;
begin
  if auth.uid() is null or object_name !~ ('^' || auth.uid()::text || '/brands/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$') then return false; end if;
  select * into b from public.brands where user_id = auth.uid()
    and id::text = split_part(object_name, '/', 3) for share;
  if not found then return false; end if;
  -- Never remove a logo still referenced by a brand. First detach/replace it.
  return operation <> 'delete' or b.image_path is distinct from object_name;
end;
$$;
revoke all on function app_private.brand_object_allowed(text, text) from public, anon, authenticated;
grant execute on function app_private.brand_object_allowed(text, text) to authenticated, service_role;
create policy brand_object_read on storage.objects for select to authenticated
  using (bucket_id = 'brand-private' and app_private.brand_object_allowed(name, 'read'));
create policy brand_object_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'brand-private' and app_private.brand_object_allowed(name, 'insert'));
create policy brand_object_delete on storage.objects for delete to authenticated
  using (bucket_id = 'brand-private' and app_private.brand_object_allowed(name, 'delete'));
-- No overwrite, rename, move or public serving policy.

create function public.save_brand(p_id uuid, p_name text, p_expected timestamptz default null)
returns public.brands language plpgsql security definer set search_path = '' as $$
declare b public.brands; owner uuid := auth.uid(); title text := btrim(p_name);
begin
  if owner is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_id is null or title is null or length(title) not between 1 and 120 then
    raise exception 'Invalid brand' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('brand:' || p_id::text, 0));
  select * into b from public.brands where id = p_id for update;
  if found then
    if b.user_id <> owner then raise exception 'Access denied' using errcode = '42501'; end if;
    if b.name = title then return b; end if;
    if p_expected is null or b.updated_at <> p_expected then raise exception 'Brand conflict' using errcode = '40001'; end if;
    update public.brands set name = title, updated_at = greatest(clock_timestamp(), b.updated_at + interval '1 microsecond') where id = b.id returning * into b;
    update public.wardrobe_items set brand_name = b.name where user_id = owner and brand_id = b.id;
  else
    if p_expected is not null then raise exception 'Brand conflict' using errcode = '40001'; end if;
    insert into public.brands(id, user_id, name) values (p_id, owner, title) returning * into b;
  end if;
  return b;
end;
$$;

create function public.set_brand_image(p_id uuid, p_path text, p_expected timestamptz)
returns public.brands language plpgsql security definer set search_path = '' as $$
declare b public.brands; meta jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('brand:' || p_id::text, 0));
  select * into b from public.brands where id = p_id and user_id = auth.uid() for update;
  if not found then raise exception 'Access denied' using errcode = '42501'; end if;
  if b.image_path is not distinct from p_path then return b; end if;
  if p_expected is null or b.updated_at <> p_expected then raise exception 'Brand conflict' using errcode = '40001'; end if;
  if p_path is not null then
    if p_path !~ ('^' || b.user_id::text || '/brands/' || b.id::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$') then
      raise exception 'Invalid image path' using errcode = '22023';
    end if;
    select metadata into meta from storage.objects where bucket_id = 'brand-private' and name = p_path for share;
    if not found or meta is null or coalesce((meta->>'size')::bigint, 0) not between 1 and 5242880
      or coalesce(meta->>'mimetype','') not in ('image/jpeg','image/png','image/webp') then
      raise exception 'Image not uploaded' using errcode = '23514';
    end if;
  end if;
  update public.brands set image_path = p_path, updated_at = greatest(clock_timestamp(), b.updated_at + interval '1 microsecond') where id = b.id returning * into b;
  return b;
end;
$$;
revoke all on function public.save_brand(uuid,text,timestamptz), public.set_brand_image(uuid,text,timestamptz) from public, anon, authenticated;
grant execute on function public.save_brand(uuid,text,timestamptz), public.set_brand_image(uuid,text,timestamptz) to authenticated, service_role;
