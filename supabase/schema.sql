create table if not exists public.map_favorites (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  payload jsonb,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.map_favorites enable row level security;

create policy "Users can read their own map favorites"
on public.map_favorites
for select
using (auth.uid() = user_id);

create policy "Users can insert their own map favorites"
on public.map_favorites
for insert
with check (auth.uid() = user_id);

create policy "Users can update their own map favorites"
on public.map_favorites
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create or replace function public.keep_newest_map_favorite()
returns trigger
language plpgsql
as $$
begin
  if old.updated_at > new.updated_at then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists keep_newest_map_favorite_trigger on public.map_favorites;
create trigger keep_newest_map_favorite_trigger
before update on public.map_favorites
for each row execute function public.keep_newest_map_favorite();
