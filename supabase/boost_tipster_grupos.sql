-- ─────────────────────────────────────────────────────────────────────────────
-- Grupos de tipster do Controle de Boost.
--
-- PARA QUE SERVE
-- A vertente Tipster continua sendo uma só — `cat: 'tipster'` em cada linha de
-- `boost_days`, que é o que o Histórico, a Análise e o Recomendador leem. Dentro
-- dela, cada linha ganha `grupo` (o nome de quem mandou a dica: Mansão Green,
-- Tropa...), e a aba Tipsters soma por ele.
--
-- O nome do grupo fica gravado NA LINHA, dentro do jsonb de `boost_days`. Esta
-- tabela é só a lista que alimenta a caixa de escolha: sem ela, um grupo novo
-- precisaria ser digitado de novo em cada linha, e "Tropa" e "tropa" virariam
-- dois grupos em toda soma.
--
-- POR QUE `chave`
-- Mesma normalização do `tipster_chave` dos Bingos Protegidos: caixa, espaço
-- sobrando e acento não separam. O índice único nela é o que impede cadastrar
-- "Mansao Green" por cima de "Mansão Green". A tela aplica a mesma regra antes
-- de mandar, então a recusa aqui só aparece em cadastro simultâneo.
--
-- SEM ESTA TABELA
-- A tela continua funcionando: a lista cai no localStorage de cada navegador,
-- com os dois grupos de partida, e avisa na aba Tipsters. Grupos já usados em
-- dias salvos aparecem para todo mundo de qualquer jeito, porque também são
-- lidos das próprias linhas.
--
-- COMO APLICAR
--   Supabase → SQL Editor → cole este arquivo inteiro → Run.
--   Rodar de novo não duplica nada. Ele devolve os dois grupos de partida se
--   alguém os tiver removido da lista.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.boost_tipster_grupos (
  id        uuid primary key default gen_random_uuid(),
  nome      text not null check (btrim(nome) <> ''),
  -- `translate` e não `unaccent`: coluna gerada só aceita função IMMUTABLE, e
  -- `unaccent()` é STABLE. Ver o mesmo comentário em protegidos.sql.
  chave     text generated always as (
    translate(
      lower(btrim(regexp_replace(nome, '\s+', ' ', 'g'))),
      'áàâãäéèêëíìîïóòôõöúùûüçñ',
      'aaaaaeeeeiiiiooooouuuucn'
    )
  ) stored,
  criado_em timestamptz not null default now()
);

create unique index if not exists boost_tipster_grupos_chave
  on public.boost_tipster_grupos (chave);

-- Os grupos de partida.
insert into public.boost_tipster_grupos (nome)
values ('Mansão Green'), ('Tropa')
on conflict (chave) do nothing;

-- ── RLS, no mesmo modelo de supabase/rls.sql ─────────────────────────────────
-- Nada de política para `anon`: a chave anon vai compilada no JavaScript do
-- site e qualquer visitante a lê. Quem enxerga e cadastra é usuário logado.
alter table public.boost_tipster_grupos enable row level security;
drop policy if exists "portal: usuarios autenticados" on public.boost_tipster_grupos;
create policy "portal: usuarios autenticados" on public.boost_tipster_grupos
  for all to authenticated using (true) with check (true);

-- ── Conferência ──────────────────────────────────────────────────────────────
-- Esperado: Mansão Green e Tropa listados, cada um com a sua chave.
select nome, chave, criado_em from public.boost_tipster_grupos order by nome;
