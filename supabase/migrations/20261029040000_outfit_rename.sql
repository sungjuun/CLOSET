-- Inline card edits change only the name, even if a garment is now unavailable.
create function public.rename_outfit(p_id uuid, p_expected timestamptz, p_name text)
returns public.outfits language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  result public.outfits;
  wanted_name text := btrim(p_name);
begin
  if actor is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_id is null or p_expected is null or wanted_name is null or length(wanted_name) not between 1 and 160 then
    raise exception 'Invalid outfit name' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('closet.outfit.' || p_id::text, 0));
  select * into result from public.outfits where id = p_id and user_id = actor and deleted_at is null for update;
  if not found then raise exception 'Outfit unavailable' using errcode = 'P0002'; end if;
  if result.updated_at <> p_expected and result.name <> wanted_name then
    raise exception 'Outfit conflict' using errcode = '40001';
  end if;
  -- Safe retry after a lost response; never restore stale metadata or slots.
  if result.name = wanted_name then return result; end if;
  update public.outfits set name = wanted_name where id = p_id returning * into result;
  return result;
end;
$$;

revoke all on function public.rename_outfit(uuid,timestamptz,text) from public,anon,authenticated;
grant execute on function public.rename_outfit(uuid,timestamptz,text) to authenticated;
