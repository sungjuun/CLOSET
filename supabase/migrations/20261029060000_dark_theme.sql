-- Replace the retired Brown preference without touching other account settings.
alter table public.profiles drop constraint profiles_theme_check;
update public.profiles set theme = 'dark' where theme = 'brown';
alter table public.profiles add constraint profiles_theme_check
  check (theme in ('white', 'beige', 'dark'));
