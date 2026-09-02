create table if not exists boost_relatorios (
  id uuid primary key default gen_random_uuid(),
  boost_id uuid not null references welcome_boosts(id),
  total_stake numeric not null,
  ggr numeric not null,
  ids_unicos integer not null,
  ticket_medio numeric not null,
  qtd_apostas integer not null,
  wins integer not null,
  lost integer not null,
  cashout integer not null,
  created_at timestamptz not null default now()
);

alter table boost_relatorios enable row level security;

create policy "Allow anon read" on boost_relatorios
  for select using (true);

create policy "Allow anon insert" on boost_relatorios
  for insert with check (true);
