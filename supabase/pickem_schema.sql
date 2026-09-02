-- Pick'em Dashboard – schema
-- Execute no SQL Editor do Supabase

-- ── Tabela de eventos ──────────────────────────────────────────────────────
create table if not exists pickem_eventos (
  id              uuid primary key default gen_random_uuid(),
  nome            text not null,
  periodo_inicio  timestamptz,
  periodo_fim     timestamptz,
  periodo_label   text,
  total_entradas  int  default 0,
  usuarios_unicos int  default 0,
  ganhadores      int  default 0,
  payout          numeric(14,2) default 0,
  media_acertos   numeric(6,3)  default 0,
  win_threshold   int,
  premio_max      numeric(14,2) default 0,
  dist            jsonb,          -- [{acertos: 0, count: 12}, ...]
  pago            boolean default false,
  sem_vencedor    boolean default false,
  criado_em       timestamptz not null default now()
);

alter table pickem_eventos enable row level security;

create policy "anon_all_eventos" on pickem_eventos
  for all to anon using (true) with check (true);

-- ── Tabela de entradas individuais ────────────────────────────────────────
create table if not exists pickem_entradas (
  id               uuid primary key default gen_random_uuid(),
  evento_id        uuid not null references pickem_eventos(id) on delete cascade,
  data_aposta      timestamptz,
  user_external_id text not null,
  is_test          boolean default false,
  is_restricted    boolean default false,
  status           text,          -- WON | LOST | PENDING
  acertos          int,           -- null quando PENDING
  premio           numeric(14,2) default 0,
  constraint uq_entrada unique (evento_id, user_external_id)
);

alter table pickem_entradas enable row level security;

create policy "anon_all_entradas" on pickem_entradas
  for all to anon using (true) with check (true);

-- índice pra queries por evento
create index if not exists idx_entradas_evento on pickem_entradas(evento_id);

-- ── Migração: marcar evento como pago (rodar se a tabela já existir) ──────
alter table pickem_eventos add column if not exists pago boolean default false;

-- ── Migração: marcar evento como sem vencedor (rodar se a tabela já existir) ──
alter table pickem_eventos add column if not exists sem_vencedor boolean default false;
