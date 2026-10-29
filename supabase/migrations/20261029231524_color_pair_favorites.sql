-- Reviewed generated migration: only the color-favorites table and its explicit grants.
begin;
create table public.color_pair_favorites (
 user_id uuid not null references auth.users(id) on delete cascade,
 top_color text not null check(top_color in ('white','cream','beige','lemon','lavender','mint','light-gray','light-blue','turquoise','light-pink','light-denim','mid-gray','sage','khaki','camel','orange','gray','green','red','cobalt','dark-brown','charcoal','dark-denim','chocolate','navy','black','ivory','off-white','sand','brown','olive','forest','burgundy','denim','peach','pink','yellow','sky-blue','lilac','taupe','teal','ecru')),
 bottom_color text not null check(bottom_color in ('white','cream','beige','lemon','lavender','mint','light-gray','light-blue','turquoise','light-pink','light-denim','mid-gray','sage','khaki','camel','orange','gray','green','red','cobalt','dark-brown','charcoal','dark-denim','chocolate','navy','black','ivory','off-white','sand','brown','olive','forest','burgundy','denim','peach','pink','yellow','sky-blue','lilac','taupe','teal','ecru')),
 created_at timestamptz not null default now(),
 primary key(user_id,top_color,bottom_color)
);
alter table public.color_pair_favorites enable row level security;
revoke all on public.color_pair_favorites from public, anon, authenticated;
grant select, delete on public.color_pair_favorites to authenticated;
grant insert(user_id,top_color,bottom_color) on public.color_pair_favorites to authenticated;
grant all on public.color_pair_favorites to service_role;
create policy color_favorites_select on public.color_pair_favorites for select to authenticated using((select auth.uid())=user_id);
create policy color_favorites_insert on public.color_pair_favorites for insert to authenticated with check((select auth.uid())=user_id);
create policy color_favorites_delete on public.color_pair_favorites for delete to authenticated using((select auth.uid())=user_id);
create index color_favorites_owner_created on public.color_pair_favorites(user_id,created_at desc,top_color,bottom_color);
commit;
