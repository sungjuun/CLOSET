-- Per-member wardrobe and combined private-media quotas, enforced by triggers/RLS.
create table "app_private"."member_limits" (
    "user_id" uuid not null,
    "wardrobe_limit" integer not null default 300,
    "media_bytes_limit" bigint not null default 104857600,
    "media_files_limit" integer not null default 500
      );

alter table "app_private"."member_limits" enable row level security;

CREATE UNIQUE INDEX member_limits_pkey ON app_private.member_limits USING btree (user_id);

alter table "app_private"."member_limits" add constraint "member_limits_pkey" PRIMARY KEY using index "member_limits_pkey";

alter table "app_private"."member_limits" add constraint "member_limits_media_bytes_limit_check" CHECK (((media_bytes_limit >= 1) AND (media_bytes_limit <= '10737418240'::bigint))) not valid;

alter table "app_private"."member_limits" validate constraint "member_limits_media_bytes_limit_check";

alter table "app_private"."member_limits" add constraint "member_limits_media_files_limit_check" CHECK (((media_files_limit >= 1) AND (media_files_limit <= 10000))) not valid;

alter table "app_private"."member_limits" validate constraint "member_limits_media_files_limit_check";

alter table "app_private"."member_limits" add constraint "member_limits_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "app_private"."member_limits" validate constraint "member_limits_user_id_fkey";

alter table "app_private"."member_limits" add constraint "member_limits_wardrobe_limit_check" CHECK (((wardrobe_limit >= 1) AND (wardrobe_limit <= 10000))) not valid;

alter table "app_private"."member_limits" validate constraint "member_limits_wardrobe_limit_check";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION app_private.assert_member_upload_capacity(p_bucket text, p_path text, p_bytes bigint)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 if p_bytes is null or p_bytes not between 1 and 5242880 then raise exception 'Invalid upload size' using errcode='22023'; end if;
 if not app_private.media_quota_allowed(p_bucket,p_path,jsonb_build_object('size',p_bytes)) then raise exception 'media_quota_exceeded' using errcode='PT413'; end if;
end $function$
;

CREATE OR REPLACE FUNCTION app_private.check_wardrobe_quota()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare maximum integer;
begin
 perform pg_advisory_xact_lock(hashtextextended('closet-quota:'||new.user_id::text,0));
 select coalesce((select wardrobe_limit from app_private.member_limits where user_id=new.user_id),300) into maximum;
 -- Count trash too, so soft deletion cannot evade the storage budget.
 if (select count(*) from public.wardrobe_items where user_id=new.user_id)>=maximum then raise exception 'wardrobe_quota_exceeded' using errcode='PT413'; end if;
 return new;
end $function$
;

CREATE OR REPLACE FUNCTION app_private.media_quota_allowed(p_bucket text, p_path text, p_metadata jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid:=auth.uid(); limits app_private.member_limits; count_used bigint; bytes_used bigint; incoming bigint;
begin
 if actor is null or p_path is null or p_bucket is null or split_part(p_path,'/',1) is distinct from actor::text or p_bucket<>all(array['wardrobe-private','brand-private','outfit-renders-private']) then return false; end if;
 perform pg_advisory_xact_lock(hashtextextended('closet-quota:'||actor::text,0));
 select * into limits from app_private.member_limits where user_id=actor;
 select count(*),coalesce(sum(case when metadata->>'size' ~ '^[0-9]{1,12}$' then (metadata->>'size')::bigint else 5242880 end),0) into count_used,bytes_used
 from storage.objects where bucket_id=any(array['wardrobe-private','brand-private','outfit-renders-private']) and name like actor::text||'/%' and not(bucket_id=p_bucket and name=p_path);
 -- Storage probes contentLength before streaming and rechecks the final measured size
 -- when writing the object. Unknown length probes reserve no bytes; the final write
 -- still runs this policy under the same member lock with its actual size.
 if p_metadata ? 'size' then
  if p_metadata->>'size' !~ '^[0-9]{1,12}$' or p_metadata->>'size' is null then return false; end if;
  incoming:=(p_metadata->>'size')::bigint;
 elsif p_metadata->>'contentLength' ~ '^[0-9]{1,12}$' then incoming:=(p_metadata->>'contentLength')::bigint;
 else incoming:=0; end if;
 return incoming between 0 and 5242880 and count_used<coalesce(limits.media_files_limit,500) and bytes_used+incoming<=coalesce(limits.media_bytes_limit,104857600);
end $function$
;

CREATE OR REPLACE FUNCTION app_private.member_usage()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid:=auth.uid(); limits app_private.member_limits; clothes bigint; files bigint; bytes bigint;
begin
 if actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select * into limits from app_private.member_limits where user_id=actor;
 select count(*) into clothes from public.wardrobe_items where user_id=actor;
 select count(*),coalesce(sum(case when metadata->>'size' ~ '^[0-9]{1,12}$' then (metadata->>'size')::bigint else 5242880 end),0) into files,bytes
 from storage.objects where bucket_id=any(array['wardrobe-private','brand-private','outfit-renders-private']) and name like actor::text||'/%';
 return jsonb_build_object('user_id',actor,'wardrobe_count',clothes,'wardrobe_limit',coalesce(limits.wardrobe_limit,300),'media_files',files,'media_files_limit',coalesce(limits.media_files_limit,500),'media_bytes',bytes,'media_bytes_limit',coalesce(limits.media_bytes_limit,104857600));
end $function$
;

CREATE OR REPLACE FUNCTION public.assert_member_upload_capacity(p_bucket text, p_path text, p_bytes bigint)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$ select app_private.assert_member_upload_capacity(p_bucket,p_path,p_bytes) $function$
;

CREATE OR REPLACE FUNCTION public.member_usage()
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$ select app_private.member_usage() $function$
;

CREATE TRIGGER wardrobe_member_quota BEFORE INSERT ON public.wardrobe_items FOR EACH ROW EXECUTE FUNCTION app_private.check_wardrobe_quota();

  create policy "member_media_quota_insert"
  on "storage"."objects"
  as restrictive
  for insert
  to authenticated
with check (app_private.media_quota_allowed(bucket_id, name, metadata));

-- Schema diffs do not include function privileges. Keep helpers private and
-- expose only the two invoker RPCs to authenticated members.
revoke all on app_private.member_limits from public,anon,authenticated;
revoke all on function app_private.check_wardrobe_quota(),app_private.member_usage(),app_private.media_quota_allowed(text,text,jsonb),app_private.assert_member_upload_capacity(text,text,bigint),public.member_usage(),public.assert_member_upload_capacity(text,text,bigint) from public,anon,authenticated;
grant execute on function app_private.member_usage(),app_private.media_quota_allowed(text,text,jsonb),app_private.assert_member_upload_capacity(text,text,bigint),public.member_usage(),public.assert_member_upload_capacity(text,text,bigint) to authenticated;
