-- Deliri Turm-App: Datenbank für Supabase
-- Einmal im Supabase Dashboard unter "SQL Editor" komplett ausführen.

create extension if not exists "pgcrypto";

-- Türme
create table if not exists public.towers (
  id uuid primary key default gen_random_uuid(),
  park text not null,                 -- z.B. Windpark Lavamünd
  name text not null,                 -- z.B. WEA 03
  tower_type text not null,           -- Vorlagen-ID, z.B. n23-s01
  customer text default 'Max Bögl',
  status text not null default 'offen' check (status in ('offen','abgeschlossen')),
  notes text default '',
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  created_by_name text default ''
);

-- Abgehakte Punkte (ein Eintrag je Punkt und Turm)
create table if not exists public.checks (
  tower_id uuid not null references public.towers(id) on delete cascade,
  phase text not null check (phase in ('wls','fin')),
  item_id text not null,
  done boolean not null default true,
  value text default '',             -- z.B. gemessenes Kontrollmaß
  done_by uuid default auth.uid(),
  done_by_name text default '',
  done_at timestamptz not null default now(),
  primary key (tower_id, phase, item_id)
);

-- Abschluss / Unterschrift je Phase
create table if not exists public.signoffs (
  id uuid primary key default gen_random_uuid(),
  tower_id uuid not null references public.towers(id) on delete cascade,
  phase text not null check (phase in ('wls','fin')),
  name text not null,
  note text default '',
  open_items int not null default 0,
  signed_at timestamptz not null default now(),
  user_id uuid default auth.uid()
);

-- Mängel
create table if not exists public.defects (
  id uuid primary key default gen_random_uuid(),
  tower_id uuid not null references public.towers(id) on delete cascade,
  title text not null,
  description text default '',
  location text default '',          -- z.B. Ring C14, Leiter, Plattform
  needs_part text default '',        -- benötigtes Ersatzteil
  status text not null default 'offen' check (status in ('offen','erledigt')),
  photo_path text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  created_by_name text default '',
  resolved_at timestamptz,
  resolved_by_name text default ''
);

-- Arbeitszeit je Turm und Tag (Gesamtzeit vor Ort)
create table if not exists public.workdays (
  id uuid primary key default gen_random_uuid(),
  tower_id uuid not null references public.towers(id) on delete cascade,
  work_date date not null,
  start_time text not null,          -- HH:MM
  end_time text not null,
  pause_min int not null default 0,
  persons int not null default 2,
  names text default '',
  activities text default '',        -- Tätigkeiten / Bemerkungen
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  created_by_name text default ''
);

-- Regiearbeiten (zusätzlich angeordnete Arbeiten, gesondert abzurechnen)
create table if not exists public.regie (
  id uuid primary key default gen_random_uuid(),
  tower_id uuid not null references public.towers(id) on delete cascade,
  work_date date not null,
  description text not null,
  ordered_by text default '',        -- angeordnet von (Name, Firma)
  start_time text not null,
  end_time text not null,
  persons int not null default 2,
  material text default '',
  photo_path text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  created_by_name text default ''
);

create index if not exists workdays_day_idx on public.workdays (work_date, tower_id);
create index if not exists regie_day_idx on public.regie (work_date, tower_id);
create index if not exists defects_open_idx on public.defects (status, tower_id);
create index if not exists checks_tower_idx on public.checks (tower_id);

-- Zugriff: nur angemeldete Teammitglieder.
-- Neue Mitglieder lädst du im Dashboard unter Authentication > Users ein.
alter table public.towers   enable row level security;
alter table public.checks   enable row level security;
alter table public.signoffs enable row level security;
alter table public.defects  enable row level security;
alter table public.workdays enable row level security;
alter table public.regie    enable row level security;

do $$
declare t text;
begin
  foreach t in array array['towers','checks','signoffs','defects','workdays','regie'] loop
    execute format('drop policy if exists team_all on public.%I', t);
    execute format('create policy team_all on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- Unterschriften dürfen nachträglich nicht geändert werden
drop policy if exists team_all on public.signoffs;
drop policy if exists signoffs_read on public.signoffs;
drop policy if exists signoffs_insert on public.signoffs;
create policy signoffs_read   on public.signoffs for select to authenticated using (true);
create policy signoffs_insert on public.signoffs for insert to authenticated with check (true);

-- Live-Aktualisierung, wenn mehrere gleichzeitig am selben Turm abhaken
do $$
declare t text;
begin
  foreach t in array array['checks','defects','workdays','regie'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Speicher für Mängelfotos (privat, nur für angemeldete Nutzer)
insert into storage.buckets (id, name, public)
values ('defects', 'defects', false)
on conflict (id) do nothing;

drop policy if exists defects_photos_read on storage.objects;
drop policy if exists defects_photos_write on storage.objects;
create policy defects_photos_read  on storage.objects for select to authenticated using (bucket_id = 'defects');
create policy defects_photos_write on storage.objects for insert to authenticated with check (bucket_id = 'defects');
