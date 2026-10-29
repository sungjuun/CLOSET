alter table public.profiles
  add column wardrobe_sort text not null default 'recent' check (wardrobe_sort in ('recent','oldest','name','brand','price_asc','price_desc')),
  add column outfit_sort text not null default 'recent' check (outfit_sort in ('recent','updated','oldest','name')),
  add column card_density text not null default 'standard' check (card_density in ('compact','standard','roomy'));

-- Compare only edited fields: a concurrent theme change never blocks a rename.
create function public.save_account_preferences(p_patch jsonb, p_expected jsonb)
returns public.profiles language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); result public.profiles; field text; value jsonb; current_values jsonb;
begin
  if actor is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_patch is null or p_expected is null or jsonb_typeof(p_patch) <> 'object' or jsonb_typeof(p_expected) <> 'object'
    or p_patch = '{}'::jsonb then raise exception 'Invalid preferences' using errcode = '22023'; end if;
  if (select array_agg(k order by k) from jsonb_object_keys(p_patch) k)
    is distinct from (select array_agg(k order by k) from jsonb_object_keys(p_expected) k) then
    raise exception 'Invalid expected fields' using errcode = '22023';
  end if;
  for field,value in select * from jsonb_each(p_patch) loop
    if field not in ('display_name','wardrobe_sort','outfit_sort','card_density') then
      raise exception 'Invalid preference field' using errcode = '22023';
    end if;
    if field = 'display_name' then
      if jsonb_typeof(value) not in ('string','null') or length(btrim(value #>> '{}')) > 80 then
        raise exception 'Invalid display name' using errcode = '22023';
      end if;
    elsif jsonb_typeof(value) <> 'string'
      or (field = 'wardrobe_sort' and value #>> '{}' not in ('recent','oldest','name','brand','price_asc','price_desc'))
      or (field = 'outfit_sort' and value #>> '{}' not in ('recent','updated','oldest','name'))
      or (field = 'card_density' and value #>> '{}' not in ('compact','standard','roomy')) then
      raise exception 'Invalid preference value' using errcode = '22023';
    end if;
  end loop;
  select * into result from public.profiles where id = actor for update;
  if not found then raise exception 'Profile unavailable' using errcode = 'P0002'; end if;
  current_values := to_jsonb(result);
  for field,value in select * from jsonb_each(p_patch) loop
    if current_values->field is distinct from p_expected->field and current_values->field is distinct from value then
      raise exception 'Preference conflict' using errcode = '40001';
    end if;
  end loop;
  update public.profiles set
    display_name = case when p_patch ? 'display_name' then nullif(btrim(p_patch->>'display_name'),'') else result.display_name end,
    wardrobe_sort = coalesce(p_patch->>'wardrobe_sort',result.wardrobe_sort),
    outfit_sort = coalesce(p_patch->>'outfit_sort',result.outfit_sort),
    card_density = coalesce(p_patch->>'card_density',result.card_density)
    where id = actor returning * into result;
  return result;
end;
$$;

revoke all on function public.save_account_preferences(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.save_account_preferences(jsonb,jsonb) to authenticated;
