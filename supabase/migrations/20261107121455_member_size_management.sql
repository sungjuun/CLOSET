create table public.member_body_measurements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  height_cm numeric check (height_cm between 1 and 300 and height_cm = round(height_cm, 1)),
  chest_cm numeric check (chest_cm between 1 and 300 and chest_cm = round(chest_cm, 1)),
  waist_cm numeric check (waist_cm between 1 and 300 and waist_cm = round(waist_cm, 1)),
  foot_length_mm integer check (foot_length_mm between 1 and 500),
  revision integer not null default 1
);

create table public.member_brand_sizes (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  brand_name text not null check (char_length(btrim(brand_name)) between 1 and 120),
  garment_type text not null check (char_length(btrim(garment_type)) between 1 and 80),
  size_label text not null check (char_length(btrim(size_label)) between 1 and 60),
  fit_note text check (char_length(fit_note) <= 200),
  revision integer not null default 1
);

create index member_brand_sizes_owner_order_idx on public.member_brand_sizes (user_id, brand_name, id);

create function app_private.advance_member_size_revision()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.revision := old.revision + 1;
  return new;
end;
$$;
revoke all on function app_private.advance_member_size_revision() from public, anon, authenticated;

create trigger member_body_measurements_revision before update on public.member_body_measurements
for each row execute function app_private.advance_member_size_revision();
create trigger member_brand_sizes_revision before update on public.member_brand_sizes
for each row execute function app_private.advance_member_size_revision();

alter table public.member_body_measurements enable row level security;
alter table public.member_brand_sizes enable row level security;

create policy own_body_measurements on public.member_body_measurements
for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own_brand_sizes on public.member_brand_sizes
for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.member_body_measurements, public.member_brand_sizes from public, anon, authenticated;
grant select on public.member_body_measurements to authenticated;
grant insert (user_id, height_cm, chest_cm, waist_cm, foot_length_mm),
  update (height_cm, chest_cm, waist_cm, foot_length_mm) on public.member_body_measurements to authenticated;
grant select, delete on public.member_brand_sizes to authenticated;
grant insert (id, user_id, brand_name, garment_type, size_label, fit_note),
  update (brand_name, garment_type, size_label, fit_note) on public.member_brand_sizes to authenticated;
