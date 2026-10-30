-- Reviewed additive recommendation/rendering schema; preserve explicit grants and private bucket policies.
begin;
create function app_private.valid_secondary_colors(v text[]) returns boolean language sql immutable set search_path='' as $$
 select v is not null and cardinality(v)<=3 and array_position(v,null) is null and not exists(select 1 from unnest(v) c where c !~ '^#[0-9A-Fa-f]{6}$');
$$;
revoke all on function app_private.valid_secondary_colors(text[]) from public,anon;
grant execute on function app_private.valid_secondary_colors(text[]) to authenticated,service_role;
alter table public.wardrobe_items add column secondary_color_hexes text[] not null default '{}', add constraint wardrobe_secondary_colors check(app_private.valid_secondary_colors(secondary_color_hexes));
grant update(secondary_color_hexes) on public.wardrobe_items to authenticated;

create function public.recommendation_candidates(p_season text default '',p_seed text default '0',p_locked uuid[] default '{}')
returns table(id uuid,user_id uuid,slot text,name text,brand_name text,color_name text,color_hex text,secondary_color_hexes text[],material text,seasons text[],tags text[],updated_at timestamptz,lifecycle_status text,deleted_at timestamptz,available_count bigint)
language plpgsql stable security invoker set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_season is null or p_season<>all(array['','spring','summer','autumn','winter']) or p_seed is null or length(p_seed)>80 or p_locked is null or cardinality(p_locked)>6 or array_position(p_locked,null) is not null then raise exception 'Invalid recommendation options' using errcode='22023'; end if;
 if exists(select 1 from unnest(p_locked) locked where not exists(select 1 from public.wardrobe_items w where w.id=locked and w.user_id=auth.uid() and w.deleted_at is null and w.lifecycle_status='active' and (p_season='' or cardinality(w.seasons)=0 or p_season=any(w.seasons)))) then raise exception 'Fixed garment unavailable' using errcode='P0003'; end if;
 return query
 with recursive tree as (
  select c.slug,c.parent_slug,c.slug as root,array[c.slug] as path from public.categories c where c.parent_slug is null and c.slug=any(array['outerwear','tops','bottoms','shoes','bags','accessories'])
  union all select c.slug,c.parent_slug,t.root,t.path||c.slug from public.categories c join tree t on c.parent_slug=t.slug where not c.slug=any(t.path) and cardinality(t.path)<16
 ), ranked as (
  select w.*,case t.root when 'tops' then 'top' when 'bottoms' then 'bottom' when 'bags' then 'bag' when 'accessories' then 'accessory' else t.root end as root_slot,
   row_number() over(partition by t.root order by (w.id=any(p_locked)) desc,md5(w.id::text||p_seed),w.id) as rn,count(*) over(partition by t.root) as total
  from public.wardrobe_items w join tree t on t.slug=w.category_slug
  where w.user_id=auth.uid() and w.deleted_at is null and w.lifecycle_status='active' and (p_season='' or cardinality(w.seasons)=0 or p_season=any(w.seasons))
 ) select r.id,r.user_id,r.root_slot,r.name,r.brand_name,r.color_name,r.color_hex,r.secondary_color_hexes,r.material,r.seasons,r.tags,r.updated_at,r.lifecycle_status,r.deleted_at,r.total from ranked r where rn<=32 order by r.root_slot,r.rn;
end;
$$;
revoke all on function public.recommendation_candidates(text,text,uuid[]) from public,anon;
grant execute on function public.recommendation_candidates(text,text,uuid[]) to authenticated;

create table public.outfit_render_assets (
 id uuid primary key,user_id uuid not null references auth.users(id) on delete cascade,outfit_id uuid not null,
 outfit_version timestamptz not null,requested_mode text not null check(requested_mode in ('items','mannequin')),
 body_preset text not null check(body_preset in ('slim','regular','broad')),
 render_kind text not null check(render_kind in ('item-board','mannequin-sample')),
 storage_path text not null unique,status text not null default 'pending' check(status in ('pending','ready')),
 created_at timestamptz not null default now(),
 foreign key(outfit_id,user_id) references public.outfits(id,user_id) on delete cascade,
 unique(id,user_id,outfit_id),check(storage_path=user_id::text||'/'||outfit_id::text||'/'||id::text||'.png'),
 check(requested_mode='mannequin' or render_kind='item-board')
);
create index outfit_render_assets_owner_outfit on public.outfit_render_assets(user_id,outfit_id,created_at desc);
create table public.outfit_presentations (
 outfit_id uuid primary key,user_id uuid not null references auth.users(id) on delete cascade,
 view_mode text not null default 'items' check(view_mode in ('items','mannequin')),
 body_preset text not null default 'regular' check(body_preset in ('slim','regular','broad')),
 render_id uuid,updated_at timestamptz not null default now(),
 foreign key(outfit_id,user_id) references public.outfits(id,user_id) on delete cascade,
 foreign key(render_id,user_id,outfit_id) references public.outfit_render_assets(id,user_id,outfit_id) on delete set null(render_id)
);
create index outfit_presentations_owner on public.outfit_presentations(user_id);
create index outfit_presentations_render on public.outfit_presentations(render_id,user_id,outfit_id);
alter table public.outfit_render_assets enable row level security;
alter table public.outfit_presentations enable row level security;
revoke all on public.outfit_render_assets,public.outfit_presentations from public,anon,authenticated;
grant select on public.outfit_render_assets,public.outfit_presentations to authenticated;
grant all on public.outfit_render_assets,public.outfit_presentations to service_role;
create policy outfit_assets_own_select on public.outfit_render_assets for select to authenticated using((select auth.uid())=user_id);
create policy outfit_presentations_own_select on public.outfit_presentations for select to authenticated using((select auth.uid())=user_id);

create function public.set_outfit_presentation(p_outfit uuid,p_expected timestamptz,p_mode text,p_preset text)
returns public.outfit_presentations language plpgsql security definer set search_path='' as $$
declare o public.outfits; result public.outfit_presentations;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_mode is null or p_mode<>all(array['items','mannequin']) or p_preset is null or p_preset<>all(array['slim','regular','broad']) then raise exception 'Invalid presentation' using errcode='22023'; end if;
 select * into o from public.outfits where id=p_outfit and user_id=auth.uid() and deleted_at is null for share;
 if not found then raise exception 'Outfit unavailable' using errcode='P0002'; end if;
 if p_expected is null or o.updated_at<>p_expected then raise exception 'Outfit changed' using errcode='40001'; end if;
 insert into public.outfit_presentations(outfit_id,user_id,view_mode,body_preset) values(o.id,o.user_id,p_mode,p_preset)
 on conflict(outfit_id) do update set view_mode=excluded.view_mode,body_preset=excluded.body_preset,
  render_id=case when outfit_presentations.view_mode=excluded.view_mode and outfit_presentations.body_preset=excluded.body_preset then outfit_presentations.render_id else null end,
  updated_at=clock_timestamp()
 returning * into result;
 return result;
end;
$$;

-- Re-check category roots and lifecycle under the same garment locks used by outfit saves.
create function app_private.assert_render_garments(p_outfit uuid) returns void language plpgsql set search_path='' as $$
begin
 perform w.id from public.wardrobe_items w join public.outfit_items oi on oi.item_id=w.id and oi.user_id=w.user_id where oi.outfit_id=p_outfit order by w.id for share of w;
 if exists(with recursive tree as (
  select c.slug,c.slug as root,array[c.slug] as path from public.categories c where c.parent_slug is null and c.slug=any(array['outerwear','tops','bottoms','shoes','bags','accessories'])
  union all select c.slug,t.root,t.path||c.slug from public.categories c join tree t on c.parent_slug=t.slug where not c.slug=any(t.path) and cardinality(t.path)<16
 ) select 1 from public.outfit_items oi left join public.wardrobe_items w on w.id=oi.item_id and w.user_id=oi.user_id left join tree t on t.slug=w.category_slug
 where oi.outfit_id=p_outfit and (w.id is null or w.user_id<>auth.uid() or w.lifecycle_status<>'active' or w.deleted_at is not null or oi.position<>0 or t.root is distinct from case oi.slot when 'top' then 'tops' when 'bottom' then 'bottoms' when 'bag' then 'bags' when 'accessory' then 'accessories' when 'outerwear' then 'outerwear' when 'shoes' then 'shoes' end)) then raise exception 'Garment changed' using errcode='P0003'; end if;
end;
$$;
revoke all on function app_private.assert_render_garments(uuid) from public,anon,authenticated;

create function public.reserve_outfit_render(p_id uuid,p_outfit uuid,p_expected timestamptz,p_mode text,p_preset text,p_kind text)
returns public.outfit_render_assets language plpgsql security definer set search_path='' as $$
declare o public.outfits; result public.outfit_render_assets;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_id is null or p_kind is null or p_kind<>all(array['item-board','mannequin-sample']) or (p_mode='items' and p_kind<>'item-board') then raise exception 'Invalid renderer' using errcode='22023'; end if;
 select * into o from public.outfits where id=p_outfit and user_id=auth.uid() and deleted_at is null for share;
 if not found then raise exception 'Outfit unavailable' using errcode='P0002'; end if;
 if p_expected is null or o.updated_at<>p_expected then raise exception 'Outfit changed' using errcode='40001'; end if;
 if not exists(select 1 from public.outfit_presentations p where p.outfit_id=o.id and p.user_id=o.user_id and p.view_mode=p_mode and p.body_preset=p_preset) then raise exception 'Presentation changed' using errcode='40001'; end if;
 perform app_private.assert_render_garments(o.id);
 perform pg_advisory_xact_lock(hashtextextended('closet.render.'||p_id::text,0));
 select * into result from public.outfit_render_assets where id=p_id;
 if found then
  if result.user_id<>o.user_id or result.outfit_id<>o.id or result.outfit_version<>p_expected or result.requested_mode<>p_mode or result.body_preset<>p_preset or result.render_kind<>p_kind then raise exception 'Render identity mismatch' using errcode='22023'; end if;
  return result;
 end if;
 insert into public.outfit_render_assets(id,user_id,outfit_id,outfit_version,requested_mode,body_preset,render_kind,storage_path)
 values(p_id,o.user_id,o.id,p_expected,p_mode,p_preset,p_kind,o.user_id::text||'/'||o.id::text||'/'||p_id::text||'.png') returning * into result;
 return result;
end;
$$;

create function public.complete_outfit_render(p_id uuid) returns public.outfit_render_assets language plpgsql security definer set search_path='' as $$
declare result public.outfit_render_assets; o public.outfits; p public.outfit_presentations;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select * into result from public.outfit_render_assets where id=p_id and user_id=auth.uid() for update;
 if not found then raise exception 'Render unavailable' using errcode='P0002'; end if;
 select * into o from public.outfits where id=result.outfit_id and user_id=auth.uid() and deleted_at is null for share;
 if not found then raise exception 'Outfit unavailable' using errcode='P0002'; end if;
 if o.updated_at<>result.outfit_version then raise exception 'Outfit changed' using errcode='40001'; end if;
 perform app_private.assert_render_garments(o.id);
 select * into p from public.outfit_presentations where outfit_id=o.id and user_id=auth.uid() for update;
 if not found or p.view_mode<>result.requested_mode or p.body_preset<>result.body_preset then raise exception 'Presentation changed' using errcode='40001'; end if;
 if not exists(select 1 from storage.objects s where s.bucket_id='outfit-renders-private' and s.name=result.storage_path and s.metadata->>'mimetype'='image/png' and coalesce((s.metadata->>'size')::bigint,0) between 1 and 5242880) then raise exception 'Render file unavailable' using errcode='P0002'; end if;
 update public.outfit_render_assets set status='ready' where id=p_id returning * into result;
 update public.outfit_presentations set render_id=p_id,updated_at=clock_timestamp() where outfit_id=o.id and user_id=auth.uid();
 return result;
end;
$$;
revoke all on function public.set_outfit_presentation(uuid,timestamptz,text,text),public.reserve_outfit_render(uuid,uuid,timestamptz,text,text,text),public.complete_outfit_render(uuid) from public,anon;
grant execute on function public.set_outfit_presentation(uuid,timestamptz,text,text),public.reserve_outfit_render(uuid,uuid,timestamptz,text,text,text),public.complete_outfit_render(uuid) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('outfit-renders-private','outfit-renders-private',false,5242880,array['image/png']);
create policy outfit_render_upload on storage.objects for insert to authenticated with check(bucket_id='outfit-renders-private' and exists(select 1 from public.outfit_render_assets a join public.outfits o on o.id=a.outfit_id and o.user_id=a.user_id where a.user_id=(select auth.uid()) and a.storage_path=storage.objects.name and a.status='pending' and o.deleted_at is null and o.updated_at=a.outfit_version));
create policy outfit_render_read on storage.objects for select to authenticated using(bucket_id='outfit-renders-private' and exists(select 1 from public.outfit_render_assets a where a.user_id=(select auth.uid()) and a.storage_path=storage.objects.name));
create policy outfit_render_delete on storage.objects for delete to authenticated using(bucket_id='outfit-renders-private' and exists(select 1 from public.outfit_render_assets a where a.user_id=(select auth.uid()) and a.storage_path=storage.objects.name));
commit;
