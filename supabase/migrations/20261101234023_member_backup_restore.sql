-- Member-scoped JSON/CSV/image backup and resumable restore.
create table "public"."backup_file_restores" (
    "user_id" uuid not null,
    "bucket" text not null,
    "path" text not null,
    "size" integer not null,
    "mime" text not null,
    "sha256" text not null,
    "expires_at" timestamp with time zone not null,
    "completed_at" timestamp with time zone
      );


alter table "public"."backup_file_restores" enable row level security;

CREATE UNIQUE INDEX backup_file_restores_pkey ON public.backup_file_restores USING btree (user_id, bucket, path);

alter table "public"."backup_file_restores" add constraint "backup_file_restores_pkey" PRIMARY KEY using index "backup_file_restores_pkey";

alter table "public"."backup_file_restores" add constraint "backup_file_restores_bucket_check" CHECK ((bucket = ANY (ARRAY['wardrobe-private'::text, 'brand-private'::text, 'outfit-renders-private'::text]))) not valid;

alter table "public"."backup_file_restores" validate constraint "backup_file_restores_bucket_check";

alter table "public"."backup_file_restores" add constraint "backup_file_restores_check" CHECK ((split_part(path, '/'::text, 1) = (user_id)::text)) not valid;

alter table "public"."backup_file_restores" validate constraint "backup_file_restores_check";

alter table "public"."backup_file_restores" add constraint "backup_file_restores_mime_check" CHECK ((mime = ANY (ARRAY['image/png'::text, 'image/jpeg'::text, 'image/webp'::text]))) not valid;

alter table "public"."backup_file_restores" validate constraint "backup_file_restores_mime_check";

alter table "public"."backup_file_restores" add constraint "backup_file_restores_sha256_check" CHECK ((sha256 ~ '^[a-f0-9]{64}$'::text)) not valid;

alter table "public"."backup_file_restores" validate constraint "backup_file_restores_sha256_check";

alter table "public"."backup_file_restores" add constraint "backup_file_restores_size_check" CHECK (((size >= 1) AND (size <= 5242880))) not valid;

alter table "public"."backup_file_restores" validate constraint "backup_file_restores_size_check";

alter table "public"."backup_file_restores" add constraint "backup_file_restores_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."backup_file_restores" validate constraint "backup_file_restores_user_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION app_private.backup_media_owned(p_bucket text, p_path text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select auth.uid() is not null and exists(select 1 from public.backup_file_restores r where r.user_id=auth.uid() and r.bucket=p_bucket and r.path=p_path and r.completed_at is null and r.expires_at>now()) and (
  (p_bucket='wardrobe-private' and exists(select 1 from public.item_images i where i.user_id=auth.uid() and i.storage_path=p_path and i.upload_status='ready')) or
  (p_bucket='outfit-renders-private' and exists(select 1 from public.outfit_render_assets a where a.user_id=auth.uid() and a.storage_path=p_path and a.status='ready'))
 );
$function$
;

CREATE OR REPLACE FUNCTION public.complete_backup_file(p_bucket text, p_path text, p_sha256 text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare permit public.backup_file_restores;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select * into permit from public.backup_file_restores where user_id=auth.uid() and bucket=p_bucket and path=p_path for update;
 if not found then return; end if;
 if permit.sha256 is distinct from p_sha256 or not exists(select 1 from storage.objects o where o.bucket_id=p_bucket and o.name=p_path and o.metadata->>'mimetype'=permit.mime and (o.metadata->>'size')::bigint=permit.size) then raise exception 'Backup file incomplete' using errcode='22023'; end if;
 update public.backup_file_restores set completed_at=now() where user_id=auth.uid() and bucket=p_bucket and path=p_path;
end $function$
;

CREATE OR REPLACE FUNCTION public.export_member_backup()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare actor uuid := auth.uid(); result jsonb := '{}'::jsonb; tab text; rows jsonb;
begin
 if actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
 foreach tab in array array['categories','category_preferences','category_deletions','brands','wardrobe_items','outfits','outfit_items','wear_events','wear_event_items','item_images','outfit_render_assets','outfit_presentations','color_pair_favorites'] loop
  execute format('select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),''[]''::jsonb) from public.%I t where user_id=$1 %s',tab,
    case when tab='item_images' then 'and upload_status=''ready''' when tab='outfit_render_assets' then 'and status=''ready''' else '' end) into rows using actor;
  if jsonb_array_length(rows)>10000 then raise exception 'Backup record limit exceeded' using errcode='54000'; end if;
  result := result || jsonb_build_object(tab,rows);
 end loop;
 -- Pending renders are not part of a completed backup.
 result := jsonb_set(result,'{outfit_presentations}',coalesce((select jsonb_agg(case when p->>'render_id' is not null and not exists(select 1 from jsonb_array_elements(result->'outfit_render_assets') a where a->>'id'=p->>'render_id') then p || '{"render_id":null}'::jsonb else p end) from jsonb_array_elements(result->'outfit_presentations') p),'[]'::jsonb));
 return jsonb_build_object('owner',actor,'profile',(select to_jsonb(p) from public.profiles p where id=actor),'tables',result);
end $function$
;

CREATE OR REPLACE FUNCTION public.restore_member_backup(p_payload jsonb, p_dry_run boolean DEFAULT true, p_restore_profile boolean DEFAULT false, p_profile_expected timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 actor uuid := auth.uid(); tab text; rows jsonb; row_value jsonb; columns_list text; identity_columns text; predicate text; key_columns text; file_value jsonb;
 allowed text[] := array['categories','category_preferences','category_deletions','brands','wardrobe_items','outfits','outfit_items','wear_events','wear_event_items','item_images','outfit_render_assets','outfit_presentations','color_pair_favorites'];
 conflicts boolean; other_owner boolean; added integer; summary jsonb := '{}'::jsonb; existing_profile public.profiles; wanted_profile public.profiles;
begin
 if actor is null or p_payload->>'owner' is distinct from actor::text then raise exception 'Backup owner mismatch' using errcode='42501'; end if;
 if p_dry_run is null or p_restore_profile is null or octet_length(p_payload::text)>16777216 or p_payload->>'format' is distinct from 'closet-backup' or p_payload->>'version' is distinct from '1' or coalesce(p_payload->>'kind','') not in ('data','full') or jsonb_typeof(p_payload->'tables') is distinct from 'object' then raise exception 'Invalid backup' using errcode='22023'; end if;
 if exists(select 1 from jsonb_object_keys(p_payload->'tables') k where not k=any(allowed)) then raise exception 'Unknown backup table' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('member-backup:'||actor::text,0));
 perform pg_advisory_xact_lock(hashtextextended('member-categories:'||actor::text,0));
 -- Only fixed allow-listed public row types are accepted, never auth/storage rows or SQL.
 foreach tab in array allowed loop
  rows := p_payload->'tables'->tab;
  if jsonb_typeof(rows) is distinct from 'array' or jsonb_array_length(rows)>10000 then raise exception 'Invalid backup rows' using errcode='22023'; end if;
  for row_value in select value from jsonb_array_elements(rows) loop
   if jsonb_typeof(row_value) is distinct from 'object' or row_value->>'user_id' is distinct from actor::text then raise exception 'Backup row owner mismatch' using errcode='42501'; end if;
   if exists(select 1 from jsonb_object_keys(row_value) k where not exists(select 1 from pg_attribute a where a.attrelid=format('public.%I',tab)::regclass and a.attname=k and a.attnum>0 and not a.attisdropped)) then raise exception 'Unknown backup column' using errcode='22023'; end if;
  end loop;
 end loop;
 if exists(select 1 from jsonb_array_elements(p_payload->'tables'->'categories') c where not exists(select 1 from public.categories root where root.slug=c->>'parent_slug' and root.parent_slug is null and root.user_id is null)) then raise exception 'Invalid custom category parent' using errcode='22023'; end if;
 if exists(select 1 from jsonb_array_elements(p_payload->'tables'->'category_preferences') p join public.categories c on c.slug=p->>'category_slug' where c.user_id is not null and c.user_id<>actor) then raise exception 'Category preference unavailable' using errcode='42501'; end if;
 if exists(select 1 from jsonb_array_elements(p_payload->'tables'->'category_deletions') d where not exists(select 1 from public.categories root where root.slug=d->>'parent_slug' and root.user_id is null and root.parent_slug is null) or exists(select 1 from public.categories c where c.slug=d->>'category_slug' and c.user_id is not null and c.user_id<>actor)) then raise exception 'Category deletion unavailable' using errcode='42501'; end if;
 if p_payload->>'kind'='data' and (jsonb_array_length(p_payload->'tables'->'item_images')<>0 or jsonb_array_length(p_payload->'tables'->'outfit_render_assets')<>0 or exists(select 1 from jsonb_array_elements(p_payload->'tables'->'brands') b where b->>'image_path' is not null) or exists(select 1 from jsonb_array_elements(p_payload->'tables'->'outfit_presentations') p where p->>'render_id' is not null)) then raise exception 'Data backup cannot contain file references' using errcode='22023'; end if;
 if jsonb_typeof(p_payload->'files') is distinct from 'array' or jsonb_array_length(p_payload->'files')>500 or (p_payload->>'kind'='data' and jsonb_array_length(p_payload->'files')<>0) then raise exception 'Invalid backup files' using errcode='22023'; end if;
 if exists(select 1 from jsonb_array_elements(p_payload->'tables'->'item_images') i where i->>'upload_status' is distinct from 'ready') or exists(select 1 from jsonb_array_elements(p_payload->'tables'->'outfit_render_assets') a where a->>'status' is distinct from 'ready') then raise exception 'Incomplete media rows' using errcode='22023'; end if;
 if p_restore_profile then
  select * into existing_profile from public.profiles where id=actor for update;
  if p_profile_expected is null or existing_profile.updated_at is distinct from p_profile_expected then raise exception 'Profile changed' using errcode='PT409'; end if;
  wanted_profile := jsonb_populate_record(null::public.profiles,p_payload->'profile');
  if wanted_profile.id is distinct from actor then raise exception 'Profile owner mismatch' using errcode='42501'; end if;
 end if;
 begin
  foreach tab in array allowed loop
   rows := p_payload->'tables'->tab;
   select string_agg(format('%I',a.attname),',' order by a.attnum) into columns_list from pg_attribute a where a.attrelid=format('public.%I',tab)::regclass and a.attnum>0 and not a.attisdropped;
   select string_agg(format('t.%1$I is not distinct from r.%1$I',a.attname),' and ' order by a.attnum) into predicate
    from pg_index i join pg_attribute a on a.attrelid=i.indrelid and a.attnum=any(i.indkey) where i.indrelid=format('public.%I',tab)::regclass and i.indisprimary;
   select string_agg(format('r.%I',a.attname),',' order by a.attnum) into key_columns from pg_index i join pg_attribute a on a.attrelid=i.indrelid and a.attnum=any(i.indkey) where i.indrelid=format('public.%I',tab)::regclass and i.indisprimary;
   execute format('select count(*)<>count(distinct row(%2$s)) from jsonb_populate_recordset(null::public.%1$I,$1) r',tab,key_columns) into conflicts using rows;
   if conflicts then raise exception 'Duplicate backup identity' using errcode='22023'; end if;
   execute format('select t.* from public.%1$I t join jsonb_populate_recordset(null::public.%1$I,$1) r on %2$s for update of t nowait',tab,predicate) using rows;
   -- Foreign IDs and differing existing records abort the complete metadata transaction.
   execute format('select exists(select 1 from public.%1$I t join jsonb_populate_recordset(null::public.%1$I,$1) r on %2$s where t.user_id<>$2)',tab,predicate) into other_owner using rows,actor;
   if other_owner then raise exception 'Backup identity unavailable' using errcode='42501'; end if;
   identity_columns := case when p_payload->>'kind'='data' and tab='brands' then 'image_path' when p_payload->>'kind'='data' and tab='outfit_presentations' then 'render_id' else '__no_column__' end;
   execute format('select exists(select 1 from public.%1$I t join jsonb_populate_recordset(null::public.%1$I,$1) r on %2$s where (to_jsonb(t)-$2) is distinct from (to_jsonb(r)-$2))',tab,predicate) into conflicts using rows,identity_columns;
   if conflicts then raise exception 'Existing backup records changed: %',tab using errcode='PT409'; end if;
   if tab='category_deletions' and exists(select 1 from public.wardrobe_items w join jsonb_array_elements(rows) d on d->>'category_slug'=w.category_slug where w.user_id=actor) then raise exception 'Category deletion conflicts with current garments' using errcode='PT409'; end if;
   execute format('insert into public.%1$I (%2$s) select %2$s from jsonb_populate_recordset(null::public.%1$I,$1) on conflict do nothing',tab,columns_list) using rows;
   get diagnostics added = row_count;
   -- A logical unique-key conflict with a different identity must not be silently skipped.
   execute format('select exists(select 1 from jsonb_populate_recordset(null::public.%1$I,$1) r where not exists(select 1 from public.%1$I t where %2$s and t.user_id=$2 and (to_jsonb(t)-$3)=(to_jsonb(r)-$3)))',tab,predicate) into conflicts using rows,actor,identity_columns;
   if conflicts then raise exception 'Backup unique identity conflict: %',tab using errcode='PT409'; end if;
   summary := summary || jsonb_build_object(tab,jsonb_build_object('added',added,'skipped',jsonb_array_length(rows)-added));
  end loop;
  for file_value in select value from jsonb_array_elements(p_payload->'files') loop
   if split_part(file_value->>'path','/',1) is distinct from actor::text or not (
    (file_value->>'bucket'='wardrobe-private' and exists(select 1 from public.item_images i where i.user_id=actor and i.storage_path=file_value->>'path' and i.upload_status='ready')) or
    (file_value->>'bucket'='brand-private' and exists(select 1 from public.brands b where b.user_id=actor and b.image_path=file_value->>'path')) or
    (file_value->>'bucket'='outfit-renders-private' and exists(select 1 from public.outfit_render_assets a where a.user_id=actor and a.storage_path=file_value->>'path' and a.status='ready'))
   ) then raise exception 'Backup file unavailable' using errcode='42501'; end if;
   if not exists(select 1 from storage.objects o where o.bucket_id=file_value->>'bucket' and o.name=file_value->>'path') then
    insert into public.backup_file_restores(user_id,bucket,path,size,mime,sha256,expires_at)
    values(actor,file_value->>'bucket',file_value->>'path',(file_value->>'size')::integer,file_value->>'mime',file_value->>'sha256',now()+interval '15 minutes')
    on conflict(user_id,bucket,path) do update set size=excluded.size,mime=excluded.mime,sha256=excluded.sha256,expires_at=excluded.expires_at,completed_at=null;
   end if;
  end loop;
  if p_restore_profile then update public.profiles set display_name=wanted_profile.display_name,theme=wanted_profile.theme,wardrobe_sort=wanted_profile.wardrobe_sort,outfit_sort=wanted_profile.outfit_sort,card_density=wanted_profile.card_density where id=actor; end if;
  if p_dry_run then raise exception 'Preview only' using errcode='P9000'; end if;
 exception when sqlstate 'P9000' then null;
 end;
 return jsonb_build_object('preview',p_dry_run,'tables',summary,'profileRestored',p_restore_profile);
end $function$
;































grant select on table "public"."backup_file_restores" to "authenticated";

grant delete on table "public"."backup_file_restores" to "service_role";

grant insert on table "public"."backup_file_restores" to "service_role";

grant references on table "public"."backup_file_restores" to "service_role";

grant select on table "public"."backup_file_restores" to "service_role";

grant trigger on table "public"."backup_file_restores" to "service_role";

grant truncate on table "public"."backup_file_restores" to "service_role";

grant update on table "public"."backup_file_restores" to "service_role";


  create policy "backup_file_restores_owner_read"
  on "public"."backup_file_restores"
  as permissive
  for select
  to authenticated
using ((( SELECT auth.uid() AS uid) = user_id));



  create policy "backup_missing_media_insert"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (app_private.backup_media_owned(bucket_id, name));




-- Explicit privileges: generated schema diffs omit function ACLs.
revoke all on public.backup_file_restores from public,anon,authenticated;
grant select on public.backup_file_restores to authenticated;
grant all on public.backup_file_restores to service_role;
revoke all on function public.export_member_backup(),public.restore_member_backup(jsonb,boolean,boolean,timestamptz),public.complete_backup_file(text,text,text),app_private.backup_media_owned(text,text) from public,anon,authenticated;
grant execute on function public.export_member_backup(),public.restore_member_backup(jsonb,boolean,boolean,timestamptz),public.complete_backup_file(text,text,text),app_private.backup_media_owned(text,text) to authenticated;
