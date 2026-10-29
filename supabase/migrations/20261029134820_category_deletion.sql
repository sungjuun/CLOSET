-- Retain deleted custom IDs so creation retries cannot resurrect a category.
create table public.category_deletions (
  category_slug text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  parent_slug text not null,
  target_slug text not null,
  moved_items integer not null check (moved_items >= 0),
  deleted_at timestamptz not null default clock_timestamp()
);
create index category_deletions_owner_idx on public.category_deletions(user_id);
alter table public.category_deletions enable row level security;
create policy own_category_deletions on public.category_deletions for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.category_deletions from public, anon, authenticated;
grant select on public.category_deletions to authenticated;
grant all on public.category_deletions to service_role;

create function public.delete_member_category(p_slug text, p_expected timestamptz, p_target text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  source public.categories%rowtype;
  target public.categories%rowtype;
  removed public.category_deletions%rowtype;
  wanted_target text := nullif(p_target, '');
  current_version timestamptz;
  moved integer;
begin
  if actor is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_slug is null or length(p_slug) > 80 or p_expected is null then raise exception 'Invalid category' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('member-categories:' || actor::text, 0));
  select * into removed from public.category_deletions where category_slug = p_slug;
  if found then
    if removed.user_id <> actor then raise exception 'Category unavailable' using errcode = '42501'; end if;
    if removed.target_slug is distinct from coalesce(wanted_target, removed.parent_slug) then raise exception 'Category deletion changed' using errcode = '40001'; end if;
    return to_jsonb(removed);
  end if;
  -- Refuse a busy category/item rather than wait for the reverse FK lock order.
  select * into source from public.categories where slug = p_slug for update nowait;
  if not found or source.user_id is distinct from actor or source.parent_slug is null then
    raise exception 'Only own custom leaves can be deleted' using errcode = '42501';
  end if;
  select coalesce(p.updated_at, 'epoch'::timestamptz) into current_version
    from public.categories c left join public.category_preferences p on p.category_slug = c.slug and p.user_id = actor where c.slug = p_slug;
  if current_version is distinct from p_expected then raise exception 'Category changed' using errcode = '40001'; end if;
  wanted_target := coalesce(wanted_target, source.parent_slug);
  select * into target from public.categories where slug = wanted_target for key share;
  if not found or target.slug = source.slug or (target.user_id is not null and target.user_id <> actor)
    or not (target.slug = source.parent_slug or target.parent_slug is not distinct from source.parent_slug) then
    raise exception 'Invalid destination category' using errcode = '22023';
  end if;
  if exists (select 1 from public.wardrobe_items where category_slug = source.slug and user_id <> actor) then
    raise exception 'Category ownership mismatch' using errcode = '42501';
  end if;
  perform i.id from public.wardrobe_items i where i.category_slug = source.slug and i.user_id = actor order by i.id for update nowait;
  -- Preserve garments, photos, outfits and wear snapshots. The canonical root
  -- remains the same, so existing outfit slot/category contracts remain valid.
  update public.wardrobe_items set category_slug = target.slug where category_slug = source.slug and user_id = actor;
  get diagnostics moved = row_count;
  insert into public.category_deletions(category_slug, user_id, parent_slug, target_slug, moved_items)
    values (source.slug, actor, source.parent_slug, target.slug, moved) returning * into removed;
  delete from public.categories where slug = source.slug and user_id = actor;
  return to_jsonb(removed);
end $$;
revoke all on function public.delete_member_category(text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.delete_member_category(text,timestamptz,text) to authenticated,service_role;

create or replace function public.save_member_category(p_slug text,p_label text,p_active boolean,p_parent text default null,p_expected timestamptz default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  existing public.categories%rowtype;
  pref public.category_preferences%rowtype;
  wanted_parent text := nullif(p_parent,'');
  title text := btrim(p_label);
  target_parent text;
  next_position integer;
begin
  if actor is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_slug is null or length(p_slug) > 80 or title is null or length(title) not between 1 and 80 or p_active is null then
    raise exception 'Invalid category' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('member-categories:' || actor::text,0));
  if exists (select 1 from public.category_deletions where category_slug = p_slug) then
    raise exception 'Category was deleted' using errcode = 'P0002';
  end if;
  select c.* into existing from public.categories c where c.slug = p_slug;
  if p_expected is null then
    if p_slug !~ '^u_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Invalid custom category identifier' using errcode = '22023';
    end if;
    if existing.slug is not null then
      if existing.user_id = actor and existing.parent_slug = wanted_parent and exists (
        select 1 from public.member_categories(actor) c where c.slug = p_slug and c.label_ko = title and c.is_active = p_active
      ) then return (select to_jsonb(c) from public.member_categories(actor) c where c.slug = p_slug); end if;
      raise exception 'Category creation conflict' using errcode = '40001';
    end if;
    if not exists (select 1 from public.categories c where c.slug = wanted_parent and c.parent_slug is null and c.user_id is null and c.is_active
      and c.slug in ('outerwear','tops','bottoms','onepiece','shoes','bags','accessories')) then
      raise exception 'Invalid parent category' using errcode = '22023';
    end if;
    target_parent := wanted_parent;
  else
    if existing.slug is null or (existing.user_id is not null and existing.user_id <> actor) then
      raise exception 'Category unavailable' using errcode = '42501';
    end if;
    if existing.parent_slug is distinct from wanted_parent then raise exception 'Category parent cannot change' using errcode = '22023'; end if;
    target_parent := existing.parent_slug;
    select p.* into pref from public.category_preferences p where p.user_id = actor and p.category_slug = p_slug for update;
    if coalesce(pref.updated_at,'epoch'::timestamptz) is distinct from p_expected then
      if pref.label_ko = title and pref.is_active = p_active then
        return (select to_jsonb(c) from public.member_categories(actor) c where c.slug = p_slug);
      end if;
      raise exception 'Category changed' using errcode = '40001';
    end if;
  end if;
  if exists (select 1 from public.member_categories(actor) c where c.slug <> p_slug and c.parent_slug is not distinct from target_parent and lower(c.label_ko) = lower(title)) then
    raise exception 'Duplicate category name' using errcode = '23505';
  end if;
  if existing.slug is null then
    select coalesce(max(c.position),0) + 10 into next_position from public.member_categories(actor) c where c.parent_slug = target_parent;
    insert into public.categories(slug,parent_slug,label_ko,position,user_id) values(p_slug,target_parent,title,next_position,actor);
  end if;
  insert into public.category_preferences(user_id,category_slug,label_ko,is_active) values(actor,p_slug,title,p_active)
  on conflict (user_id,category_slug) do update set label_ko = excluded.label_ko,is_active = excluded.is_active,
    updated_at = greatest(clock_timestamp(),public.category_preferences.updated_at + interval '1 microsecond');
  return (select to_jsonb(c) from public.member_categories(actor) c where c.slug = p_slug);
end $$;
