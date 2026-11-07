alter table public.member_body_measurements
  add column shoe_fit jsonb check (
    shoe_fit is null or (
      jsonb_typeof(shoe_fit) = 'object'
      and octet_length(shoe_fit::text) <= 4096
      and not jsonb_path_exists(shoe_fit, 'strict $.* ? (@.type() != "string" && @.type() != "number")')
    )
  );

grant insert (shoe_fit), update (shoe_fit) on public.member_body_measurements to authenticated;
