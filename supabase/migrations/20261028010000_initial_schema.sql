-- CLOSET schema v1.0 (Supabase PostgreSQL)
-- 신규 Supabase 프로젝트의 SQL Editor/마이그레이션에서 1회 실행.
-- 배포 전 로컬/스테이징에서 실행 및 테스트 필수.
-- 기본 원칙: 개인정보·옷장 데이터 비공개, 소유자 이외 접근 거부.

create extension if not exists pgcrypto;

-- 회원 프로필 (계정 인증은 Supabase auth.users가 담당)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  theme text not null default 'white' check (theme in ('white','beige','brown')),
  default_currency text not null default 'KRW',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 전역 분류. 초기에는 관리자가 마이그레이션으로만 편집.
create table public.categories (
  slug text primary key,
  parent_slug text references public.categories(slug) on delete restrict,
  label_ko text not null,
  position int not null default 0,
  is_active boolean not null default true
);

insert into public.categories(slug,parent_slug,label_ko,position) values
('outerwear',null,'아우터',10),
('tops',null,'상의',20),
('bottoms',null,'하의',30),
('onepiece',null,'원피스·셋업',40),
('shoes',null,'신발',50),
('bags',null,'가방',60),
('accessories',null,'액세서리',70),
('jacket','outerwear','재킷',11),
('jumper','outerwear','점퍼·블루종',12),
('coat','outerwear','코트',13),
('padding','outerwear','패딩',14),
('cardigan','tops','가디건',21),
('shirt','tops','셔츠',22),
('tshirt','tops','티셔츠',23),
('knit','tops','니트',24),
('denim','bottoms','데님',31),
('slacks','bottoms','슬랙스',32),
('shorts','bottoms','반바지',33),
('sneakers','shoes','스니커즈',51),
('leather_shoes','shoes','구두',52)
on conflict (slug) do nothing;

-- 회원 소유 의류. 삭제는 기본적으로 deleted_at을 채우는 소프트 삭제.
create table public.wardrobe_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 200),
  brand_name text,
  category_slug text not null references public.categories(slug),
  color_name text,
  color_hex text,
  size_label text,
  material text,
  seasons text[] not null default '{}'::text[],
  tags text[] not null default '{}'::text[],
  purchase_price numeric(12,2) check (purchase_price is null or purchase_price >= 0),
  currency text not null default 'KRW',
  purchased_on date,
  purchase_url text,
  notes text,
  is_favorite boolean not null default false,
  lifecycle_status text not null default 'active'
     check (lifecycle_status in ('active','archived','sold','donated')),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

-- 사진은 퍼블릭 URL이 아니라 private Storage object path로 저장.
create table public.item_images (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id uuid not null,
  storage_path text not null,
  image_order int not null default 0 check (image_order >= 0),
  source_kind text not null default 'user_upload'
     check (source_kind in ('user_upload','authorized_import')),
  created_at timestamptz not null default now(),
  foreign key (item_id,user_id) references public.wardrobe_items(id,user_id) on delete cascade,
  unique (user_id, storage_path)
);

-- 저장된 코디
create table public.outfits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 160),
  memo text,
  seasons text[] not null default '{}'::text[],
  tags text[] not null default '{}'::text[],
  occasion text,
  is_favorite boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,user_id)
);

-- 코디 슬롯 및 상품. 1개의 코디가 여러 의류를 참조 (M:N)
create table public.outfit_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  outfit_id uuid not null,
  item_id uuid not null,
  slot text not null check(slot in
    ('outerwear','top','bottom','onepiece','shoes','bag','accessory')),
  position int not null default 0 check(position >= 0),
  created_at timestamptz not null default now(),
  foreign key(outfit_id,user_id) references public.outfits(id,user_id) on delete cascade,
  foreign key(item_id,user_id) references public.wardrobe_items(id,user_id) on delete restrict,
  unique(outfit_id,item_id),
  unique(outfit_id,slot,position)
);

-- 착용 기록: 한 날짜에 여러 개의 기록 가능. 어느 코디를 참조했는지 선택 사항.
create table public.wear_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  worn_on date not null,
  outfit_id uuid,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id,user_id),
  foreign key (outfit_id,user_id) references public.outfits(id,user_id)
    on delete set null (outfit_id)
);

-- 착용 당시의 아이템 목록을 복사해 코디 수정 후에도 착용 기록을 보존.
create table public.wear_event_items (
  wear_event_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id uuid not null,
  created_at timestamptz not null default now(),
  primary key(wear_event_id,item_id),
  foreign key(wear_event_id,user_id) references public.wear_events(id,user_id) on delete cascade,
  foreign key(item_id,user_id) references public.wardrobe_items(id,user_id) on delete restrict
);

-- 향후 링크 자동 등록을 위한 작업 기록.
create table public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_url text not null,
  status text not null default 'pending' check(status in
    ('pending','processing','needs_review','completed','failed')),
  extracted_data jsonb not null default '{}'::jsonb,
  error_message text,
  item_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(item_id,user_id) references public.wardrobe_items(id,user_id)
    on delete set null (item_id)
);

create index wardrobe_items_owner_recent_idx on public.wardrobe_items(user_id, created_at desc);
create index wardrobe_items_owner_category_idx on public.wardrobe_items(user_id, category_slug);
create index wardrobe_items_owner_brand_idx on public.wardrobe_items(user_id, brand_name);
create index wardrobe_items_seasons_gin_idx on public.wardrobe_items using gin(seasons);
create index item_images_item_order_idx on public.item_images(item_id, image_order);
create index outfits_owner_recent_idx on public.outfits(user_id, created_at desc);
create index outfit_items_outfit_idx on public.outfit_items(outfit_id, position);
create index wear_events_user_date_idx on public.wear_events(user_id, worn_on desc);
create index wear_event_items_owner_item_idx on public.wear_event_items(user_id,item_id);
create index import_jobs_owner_recent_idx on public.import_jobs(user_id,created_at desc);

-- 수정 시간 자동화
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger wardrobe_items_updated_at before update on public.wardrobe_items
for each row execute function public.set_updated_at();
create trigger outfits_updated_at before update on public.outfits
for each row execute function public.set_updated_at();
create trigger wear_events_updated_at before update on public.wear_events
for each row execute function public.set_updated_at();
create trigger import_jobs_updated_at before update on public.import_jobs
for each row execute function public.set_updated_at();

-- 회원가입 시 프로필 자동 생성
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, display_name)
  values(new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- RLS: 모든 개인 데이터는 사용자 자신만 읽고 수정할 수 있음.
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.wardrobe_items enable row level security;
alter table public.item_images enable row level security;
alter table public.outfits enable row level security;
alter table public.outfit_items enable row level security;
alter table public.wear_events enable row level security;
alter table public.wear_event_items enable row level security;
alter table public.import_jobs enable row level security;

create policy profiles_owner on public.profiles for all to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy categories_read on public.categories for select to anon, authenticated
  using(true);
-- category INSERT/UPDATE/DELETE 정책 없음: 일반 회원이 전역 카테고리를 바꿀 수 없음.

create policy wardrobe_items_owner on public.wardrobe_items for all to authenticated
  using(user_id = (select auth.uid())) with check(user_id = (select auth.uid()));
create policy item_images_owner on public.item_images for all to authenticated
  using(user_id = (select auth.uid())) with check(user_id = (select auth.uid()));
create policy outfits_owner on public.outfits for all to authenticated
  using(user_id = (select auth.uid())) with check(user_id = (select auth.uid()));
create policy outfit_items_owner on public.outfit_items for all to authenticated
  using(user_id = (select auth.uid())) with check(user_id = (select auth.uid()));
create policy wear_events_owner on public.wear_events for all to authenticated
  using(user_id = (select auth.uid())) with check(user_id = (select auth.uid()));
create policy wear_event_items_owner on public.wear_event_items for all to authenticated
  using(user_id = (select auth.uid())) with check(user_id = (select auth.uid()));

-- 링크 처리 결과는 서버만 변경. 회원은 자신의 작업만 요청·조회.
create policy import_jobs_owner_read on public.import_jobs for select to authenticated
  using(user_id = (select auth.uid()));
create policy import_jobs_owner_insert on public.import_jobs for insert to authenticated
  with check(user_id = (select auth.uid()) and status='pending' and
             extracted_data = '{}'::jsonb and item_id is null and error_message is null);
-- Backend는 서버 전용 key + 별도 입력 검증/사용자 권한 검증을 사용.

-- 사용자별 비공개 이미지 버킷
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values('wardrobe-private', 'wardrobe-private', false, 5242880,
  array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- 경로 = {user_id}/items/{item_id}/{filename}; 클라이언트는 auth.uid() 경로만 사용.
create policy wardrobe_storage_read on storage.objects for select to authenticated
  using(bucket_id = 'wardrobe-private' and
        (storage.foldername(name))[1] = (select auth.uid())::text);
create policy wardrobe_storage_insert on storage.objects for insert to authenticated
  with check(bucket_id = 'wardrobe-private' and
             (storage.foldername(name))[1] = (select auth.uid())::text);
create policy wardrobe_storage_update on storage.objects for update to authenticated
  using(bucket_id = 'wardrobe-private' and
        (storage.foldername(name))[1] = (select auth.uid())::text)
  with check(bucket_id = 'wardrobe-private' and
             (storage.foldername(name))[1] = (select auth.uid())::text);
create policy wardrobe_storage_delete on storage.objects for delete to authenticated
  using(bucket_id = 'wardrobe-private' and
        (storage.foldername(name))[1] = (select auth.uid())::text);

-- 착용 횟수 집계: underlying RLS 적용되는 security_invoker view.
create view public.item_wear_stats with (security_invoker = true) as
select
  wi.id as item_id,
  wi.user_id,
  count(wei.item_id)::bigint as wear_count,
  max(we.worn_on) as last_worn_on,
  case when count(wei.item_id) > 0 and wi.purchase_price is not null
    then round(wi.purchase_price / count(wei.item_id)::numeric, 2)
    else null end as cost_per_wear
from public.wardrobe_items wi
left join public.wear_event_items wei on wei.item_id=wi.id and wei.user_id=wi.user_id
left join public.wear_events we on we.id=wei.wear_event_id and we.user_id=wi.user_id
group by wi.id,wi.user_id,wi.purchase_price;

-- 중요: 회원 탈퇴 시 Storage 오브젝트는 DB CASCADE로 자동 정리되는 것이
-- 아니므로, 서버 측 탈퇴 작업에서 사용자의 파일 삭제를 먼저 처리할 것.
-- 중요: SELECT/UPDATE/DELETE RLS 외에도 교차 회원 FK 무결성과 이미지 권한을 테스트할 것.
