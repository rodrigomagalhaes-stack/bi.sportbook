-- ─────────────────────────────────────────────────────────────────────────────
-- Placar do Recomendador de Boosts: as dicas que viraram boost de verdade.
--
-- PARA QUE SERVE
-- A tela do Recomendador estima duas coisas — a margem (que sai da odd, e é
-- firme) e o volume (que sai da mediana de `boost_days`, e nunca foi conferido
-- contra a realidade). Esta tabela é o que fecha esse ciclo: quando uma dica
-- vira boost no site, a previsão dela fica gravada aqui; quando o dia é
-- importado no Sportbook Vs. Tipster, o realizado chega em `boost_days` e os
-- dois se encontram.
--
-- POR QUE A PREVISÃO É GRAVADA, E NÃO RECALCULADA DEPOIS
-- Recalcular na hora da comparação avaliaria o modelo de hoje contra o
-- resultado de ontem — o modelo sempre pareceria certo, porque a mediana de
-- volume já teria absorvido aquele mesmo jogo. Os campos `prev_*` guardam o que
-- a tela dizia NO MOMENTO em que a boost foi escolhida, e não mudam mais.
--
-- COMO APLICAR
--   Supabase → SQL Editor → cole este arquivo inteiro → Run.
--   Depois confira que a tabela ficou com RLS ligado e uma política só:
--   select tablename, rowsecurity from pg_tables where tablename = 'boost_dicas';
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.boost_dicas (
  id uuid primary key default gen_random_uuid(),

  -- ── o jogo ────────────────────────────────────────────────────────────────
  -- `event_name` é redundante com `event_id`, mas é ele que casa com a coluna
  -- "Event name" da planilha de bilhetes na hora da comparação: o `boost_days`
  -- não guarda id de evento, só o nome.
  event_id bigint not null,
  event_name text not null,
  champ_name text,
  event_start timestamptz,

  -- ── o que foi escolhido ───────────────────────────────────────────────────
  vertente text not null check (vertente in ('single', 'betbuilder')),
  familia text not null,
  mercado text not null,
  selecao text not null,
  item_id bigint,                       -- id da boost no Altenar, se já estava no ar
  no_ar boolean not null default false, -- era dica de "subir" ou já estava publicada

  -- ── a previsão, congelada ─────────────────────────────────────────────────
  odd_base numeric not null,
  odd_boost numeric not null,
  prev_volume numeric,          -- stake esperado, em R$ (nulo = família sem histórico)
  prev_margem numeric not null, -- margem final por real apostado
  prev_custo numeric not null,  -- margem entregue ao apostador, por real
  prev_resultado numeric,       -- prev_margem × prev_volume, em R$
  prev_amostra integer not null default 0, -- boosts da família no histórico
  prev_fator numeric,           -- porte do confronto usado na estimativa
  margem_estimada boolean not null default false,
  posicao integer,              -- em que lugar do ranking a dica estava

  marcado_em timestamptz not null default now(),
  marcado_por text
);

-- Uma marca por seleção por jogo. Marcar de novo substitui em vez de duplicar,
-- e desmarcar é um delete.
create unique index if not exists boost_dicas_unica
  on public.boost_dicas (event_id, mercado, selecao);

-- Comparação e listagem sempre entram por jogo ou por data.
create index if not exists boost_dicas_evento on public.boost_dicas (event_id);
create index if not exists boost_dicas_data on public.boost_dicas (marcado_em desc);

-- ── RLS, no mesmo modelo de supabase/rls.sql ─────────────────────────────────
-- Nada de política para `anon`: a chave anon vai compilada no JavaScript do
-- site e qualquer visitante a lê. Quem enxerga é usuário logado.
alter table public.boost_dicas enable row level security;
drop policy if exists "portal: usuarios autenticados" on public.boost_dicas;
create policy "portal: usuarios autenticados" on public.boost_dicas
  for all to authenticated using (true) with check (true);
