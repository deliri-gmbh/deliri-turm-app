-- Deliri Turm-App: Baustellen mit Adresse und Stempeluhr mit Anreise/Abreise
-- Nach 04_kollektivvertrag.sql im SQL Editor ausführen. Kann gefahrlos mehrmals ausgeführt werden.

-- Baustellen: Türme (mit Checkliste) oder sonstige Baustellen (tower_type = 'baustelle')
alter table public.towers add column if not exists address text default '';

-- Stempeluhr: laufende An- oder Abreise (Startzeit HH:MM)
alter table public.time_entries add column if not exists travel_started text;
