-- Deliri Turm-App: Fahrten, Kilometergeld, Diäten und Zulagen
-- Nach 02_zeiterfassung.sql im SQL Editor ausführen. Kann gefahrlos mehrmals ausgeführt werden.

-- Fahrt und Zulagen je Arbeitseintrag
alter table public.time_entries add column if not exists from_place text default '';
alter table public.time_entries add column if not exists to_place text default '';
alter table public.time_entries add column if not exists to_country text default 'AT';   -- ISO Ländercode des Zielorts
alter table public.time_entries add column if not exists km numeric default 0;
alter table public.time_entries add column if not exists vehicle text default 'firma';   -- firma | privat | mitfahrer | keins
alter table public.time_entries add column if not exists trip boolean not null default false; -- Dienstreise, Diäten berechnen
alter table public.time_entries add column if not exists allowances jsonb not null default '{}'::jsonb; -- {zulagenId: Stunden oder 1}

-- Sätze und Zulagenarten (eine Zeile)
create table if not exists public.app_settings (
  id int primary key default 1 check (id = 1),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
insert into public.app_settings (id) values (1) on conflict (id) do nothing;

alter table public.app_settings enable row level security;
drop policy if exists settings_read on public.app_settings;
drop policy if exists settings_admin on public.app_settings;
create policy settings_read  on public.app_settings for select to authenticated using (true);
create policy settings_admin on public.app_settings for update to authenticated using (public.is_admin()) with check (public.is_admin());
