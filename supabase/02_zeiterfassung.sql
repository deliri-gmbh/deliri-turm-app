-- Deliri Turm-App: Mitarbeiter und Arbeitszeitaufzeichnung
-- Nach schema.sql im SQL Editor ausführen. Kann gefahrlos mehrmals ausgeführt werden.

-- Mitarbeiter (auch Personen ohne Login, z.B. Subunternehmer)
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  email text default '',
  name text not null,
  kind text not null default 'angestellt' check (kind in ('angestellt','sub')),
  role text not null default 'mitarbeiter' check (role in ('admin','mitarbeiter')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create or replace function public.my_profile_id() returns uuid
language sql stable security definer set search_path = public as
$$ select id from public.profiles where user_id = auth.uid() limit 1 $$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin' and active) $$;

-- Beim ersten Login: Profil mit gleicher E-Mail verknüpfen oder neu anlegen.
-- Der allererste Benutzer wird automatisch Admin.
create or replace function public.claim_profile(p_name text default null) returns public.profiles
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if auth.uid() is null then return null; end if;
  select * into p from public.profiles where user_id = auth.uid();
  if found then return p; end if;
  if v_email <> '' then
    update public.profiles set user_id = auth.uid()
      where id = (select id from public.profiles where user_id is null and lower(email) = v_email limit 1)
      returning * into p;
    if found then return p; end if;
  end if;
  if coalesce(trim(p_name), '') = '' then return null; end if;
  insert into public.profiles (user_id, email, name, role)
    values (auth.uid(), v_email, trim(p_name),
            case when exists (select 1 from public.profiles where role = 'admin') then 'mitarbeiter' else 'admin' end)
    returning * into p;
  return p;
end $$;

-- Wer war am Turm dabei (Profil-IDs)
alter table public.workdays add column if not exists crew uuid[] not null default '{}';

-- Arbeitszeit je Person
create table if not exists public.time_entries (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  work_date date not null,
  start_time text not null,           -- HH:MM
  end_time text,                      -- leer = läuft noch (gestempelt)
  pause_min int not null default 0,
  pause_started text,                 -- HH:MM, wenn Pause gerade läuft
  travel_min int not null default 0,  -- Fahrzeit
  tower_id uuid references public.towers(id) on delete set null,
  location text default '',
  overnight boolean not null default false,
  note text default '',
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);
create index if not exists time_entries_idx on public.time_entries (profile_id, work_date);

-- Art des Eintrags: Arbeit, Schulung oder Abwesenheit (ganztägig, mit Stunden)
alter table public.time_entries add column if not exists kind text not null default 'arbeit';
alter table public.time_entries add column if not exists hours numeric;   -- bei Urlaub, Krankenstand, ZA: gutgeschriebene Stunden
alter table public.time_entries alter column start_time drop not null;
alter table public.time_entries drop constraint if exists time_entries_kind_check;
alter table public.time_entries add constraint time_entries_kind_check check (kind in ('arbeit','schulung','urlaub','krank','za'));

-- Arbeitszeitmodell und Startwerte beim Umstieg (Stichtag)
alter table public.profiles add column if not exists weekly_hours numeric not null default 40;
alter table public.profiles add column if not exists vacation_per_year numeric not null default 25;  -- Arbeitstage
alter table public.profiles add column if not exists balance_date date;                              -- ab hier rechnet die App
alter table public.profiles add column if not exists vacation_start numeric not null default 0;     -- Resturlaub zum Stichtag
alter table public.profiles add column if not exists saldo_start_min int not null default 0;        -- Gleitzeitsaldo zum Stichtag

-- Monatsbestätigung durch den Mitarbeiter
create table if not exists public.month_signoffs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  month text not null,                -- YYYY-MM
  total_min int not null default 0,
  name text not null,
  signed_at timestamptz not null default now(),
  signed_by uuid default auth.uid(),
  unique (profile_id, month)
);

create or replace function public.month_locked(p_profile uuid, p_date date) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.month_signoffs where profile_id = p_profile and month = to_char(p_date, 'YYYY-MM')) $$;

-- Änderungsprotokoll: jede Änderung an Arbeitszeiten wird festgehalten
create table if not exists public.time_entries_log (
  id bigint generated always as identity primary key,
  entry_id uuid not null,
  profile_id uuid,
  work_date date,
  action text not null,
  old_row jsonb,
  new_row jsonb,
  changed_by uuid default auth.uid(),
  changed_by_name text,
  changed_at timestamptz not null default now()
);

create or replace function public.log_time_entry() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_name text := (select name from public.profiles where user_id = auth.uid() limit 1);
begin
  if tg_op = 'UPDATE' then new.updated_at := now(); new.updated_by := auth.uid(); end if;
  insert into public.time_entries_log (entry_id, profile_id, work_date, action, old_row, new_row, changed_by_name)
  values (coalesce(new.id, old.id), coalesce(new.profile_id, old.profile_id), coalesce(new.work_date, old.work_date),
          lower(tg_op), case when tg_op <> 'INSERT' then to_jsonb(old) end, case when tg_op <> 'DELETE' then to_jsonb(new) end, v_name);
  return coalesce(new, old);
end $$;

drop trigger if exists time_entries_log_trg on public.time_entries;
create trigger time_entries_log_trg before insert or update or delete on public.time_entries
  for each row execute function public.log_time_entry();

-- Zugriffsregeln
alter table public.profiles enable row level security;
alter table public.time_entries enable row level security;
alter table public.month_signoffs enable row level security;
alter table public.time_entries_log enable row level security;

drop policy if exists profiles_read on public.profiles;
drop policy if exists profiles_admin on public.profiles;
create policy profiles_read  on public.profiles for select to authenticated using (true);
create policy profiles_admin on public.profiles for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Arbeitszeit: jeder nur seine eigene, Admin alle. Nach Monatsbestätigung nur noch Admin.
drop policy if exists time_read on public.time_entries;
drop policy if exists time_write on public.time_entries;
create policy time_read  on public.time_entries for select to authenticated
  using (public.is_admin() or profile_id = public.my_profile_id());
create policy time_write on public.time_entries for all to authenticated
  using (public.is_admin() or (profile_id = public.my_profile_id() and not public.month_locked(profile_id, work_date)))
  with check (public.is_admin() or (profile_id = public.my_profile_id() and not public.month_locked(profile_id, work_date)));

drop policy if exists month_read on public.month_signoffs;
drop policy if exists month_insert on public.month_signoffs;
drop policy if exists month_admin_delete on public.month_signoffs;
create policy month_read   on public.month_signoffs for select to authenticated using (public.is_admin() or profile_id = public.my_profile_id());
create policy month_insert on public.month_signoffs for insert to authenticated with check (public.is_admin() or profile_id = public.my_profile_id());
create policy month_admin_delete on public.month_signoffs for delete to authenticated using (public.is_admin());

-- Protokoll: nur Admin lesen, niemand ändern
drop policy if exists log_read on public.time_entries_log;
create policy log_read on public.time_entries_log for select to authenticated using (public.is_admin());

grant execute on function public.claim_profile(text) to authenticated;
