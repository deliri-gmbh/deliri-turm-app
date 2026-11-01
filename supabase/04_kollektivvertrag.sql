-- Deliri Turm-App: Abwesenheitsarten, Genehmigung, Eintritt und Firmenwagen
-- Nach 03_reisen_zulagen.sql im SQL Editor ausführen. Kann gefahrlos mehrmals ausgeführt werden.

alter table public.time_entries drop constraint if exists time_entries_kind_check;
alter table public.time_entries add constraint time_entries_kind_check
  check (kind in ('arbeit','schulung','urlaub','krank','za','pflege','sonder','arzt'));

-- Urlaub und Zeitausgleich brauchen eine Genehmigung
alter table public.time_entries add column if not exists status text not null default 'genehmigt';
alter table public.time_entries drop constraint if exists time_entries_status_check;
alter table public.time_entries add constraint time_entries_status_check check (status in ('beantragt','genehmigt'));

create or replace function public.enforce_request_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    if new.kind in ('urlaub','za') then new.status := 'beantragt'; else new.status := 'genehmigt'; end if;
  end if;
  return new;
end $$;
drop trigger if exists time_entries_status_trg on public.time_entries;
create trigger time_entries_status_trg before insert or update on public.time_entries
  for each row execute function public.enforce_request_status();

-- Mitarbeiter: Eintritt und Firmenwagen
alter table public.profiles add column if not exists entry_date date;
alter table public.profiles add column if not exists company_car boolean not null default true;
