-- Mi Jardín — esquema inicial (MJ-15). Pegar completo en Supabase → SQL Editor → Run.
-- Modelo: cada usuario pertenece a un "jardín"; plantas y registros se guardan por registro (jsonb)
-- con updated_at para sincronizar (gana la última edición). Fotos en Storage privado.

create extension if not exists pgcrypto;

create table if not exists public.gardens (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Mi Jardín',
  owner uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.garden_members (
  garden_id uuid not null references public.gardens(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text,
  role text not null default 'colaborador' check (role in ('dueno','colaborador')),
  created_at timestamptz not null default now(),
  primary key (garden_id, user_id)
);

create table if not exists public.garden_invites (
  garden_id uuid not null references public.gardens(id) on delete cascade,
  email text not null,
  invited_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (garden_id, email)
);

create table if not exists public.plants (
  id text not null,
  garden_id uuid not null references public.gardens(id) on delete cascade,
  data jsonb not null,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  primary key (garden_id, id)
);

create table if not exists public.events (
  id text not null,
  garden_id uuid not null references public.gardens(id) on delete cascade,
  plant_id text,
  data jsonb not null,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  primary key (garden_id, id)
);

create index if not exists plants_sync on public.plants (garden_id, updated_at);
create index if not exists events_sync on public.events (garden_id, updated_at);

-- ¿Es miembro? (security definer para evitar recursión en RLS)
create or replace function public.is_member(g uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.garden_members m where m.garden_id = g and m.user_id = auth.uid());
$$;

-- Crear mi jardín (si no tengo) o unirme a los que me invitaron. Devuelve el id del jardín.
create or replace function public.mi_jardin() returns uuid
language plpgsql security definer set search_path = public as $$
declare g uuid; mail text;
begin
  if auth.uid() is null then raise exception 'sin sesión'; end if;
  select email into mail from auth.users where id = auth.uid();
  insert into public.garden_members (garden_id, user_id, email, role)
    select i.garden_id, auth.uid(), mail, 'colaborador' from public.garden_invites i
    where lower(i.email) = lower(mail)
  on conflict do nothing;
  delete from public.garden_invites where lower(email) = lower(mail);
  select garden_id into g from public.garden_members where user_id = auth.uid()
    order by (role = 'dueno') desc, created_at limit 1;
  if g is null then
    insert into public.gardens (owner) values (auth.uid()) returning id into g;
    insert into public.garden_members (garden_id, user_id, email, role) values (g, auth.uid(), mail, 'dueno');
  end if;
  return g;
end $$;

-- Sello de tiempo y autor en cada cambio
create or replace function public.touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); new.updated_by := auth.uid(); return new; end $$;
drop trigger if exists plants_touch on public.plants;
create trigger plants_touch before insert or update on public.plants for each row execute function public.touch();
drop trigger if exists events_touch on public.events;
create trigger events_touch before insert or update on public.events for each row execute function public.touch();

-- Seguridad: solo los miembros del jardín ven y cambian sus datos
alter table public.gardens enable row level security;
alter table public.garden_members enable row level security;
alter table public.garden_invites enable row level security;
alter table public.plants enable row level security;
alter table public.events enable row level security;

drop policy if exists g_sel on public.gardens;
create policy g_sel on public.gardens for select using (public.is_member(id));
drop policy if exists m_sel on public.garden_members;
create policy m_sel on public.garden_members for select using (public.is_member(garden_id));
drop policy if exists m_del on public.garden_members;
create policy m_del on public.garden_members for delete using (
  exists (select 1 from public.gardens g where g.id = garden_id and g.owner = auth.uid()) and user_id <> auth.uid());
drop policy if exists i_all on public.garden_invites;
create policy i_all on public.garden_invites for all using (public.is_member(garden_id)) with check (public.is_member(garden_id));
drop policy if exists p_all on public.plants;
create policy p_all on public.plants for all using (public.is_member(garden_id)) with check (public.is_member(garden_id));
drop policy if exists e_all on public.events;
create policy e_all on public.events for all using (public.is_member(garden_id)) with check (public.is_member(garden_id));

-- Tiempo real para que el otro teléfono vea los cambios al instante
alter publication supabase_realtime add table public.plants;
alter publication supabase_realtime add table public.events;

-- Fotos: bucket privado; la carpeta raíz de cada foto es el id del jardín
insert into storage.buckets (id, name, public) values ('fotos', 'fotos', false) on conflict (id) do nothing;
drop policy if exists fotos_rw on storage.objects;
create policy fotos_rw on storage.objects for all
  using (bucket_id = 'fotos' and public.is_member(((storage.foldername(name))[1])::uuid))
  with check (bucket_id = 'fotos' and public.is_member(((storage.foldername(name))[1])::uuid));
