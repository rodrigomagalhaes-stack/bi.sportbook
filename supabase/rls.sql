-- ─────────────────────────────────────────────────────────────────────────────
-- Fecha o acesso público às tabelas do portal (Row Level Security).
--
-- O QUE ISTO RESOLVE
-- A chave anon vai compilada dentro do JavaScript do site: qualquer visitante
-- consegue lê-la. Sem RLS, essa chave dá leitura E escrita em tudo — dá para
-- inserir, alterar e apagar registros com um `curl`, sem nunca ter feito login.
-- Foi exatamente assim que isso foi demonstrado antes de escrever este arquivo.
--
-- Com as políticas abaixo, o papel `anon` (chave sozinha, sem login) deixa de
-- enxergar qualquer linha. Só requisições assinadas por um usuário logado
-- passam — e o cadastro só aceita @esportiva.bet, então "logado" quer dizer
-- alguém da empresa.
--
-- O QUE ISTO **NÃO** RESOLVE
-- Todo usuário logado continua vendo e alterando tudo. Não há dono por linha
-- (as tabelas não têm coluna de usuário), então isto é uma fronteira entre
-- "de fora" e "de dentro", não entre pessoas de dentro.
--
-- ORDEM DE APLICAÇÃO — IMPORTANTE
-- O código do portal que assina as requisições com o token do usuário precisa
-- estar publicado ANTES deste SQL rodar. Na ordem inversa, todas as telas
-- ficam vazias até o deploy sair.
--
-- COMO APLICAR
--   Supabase → SQL Editor → cole este arquivo inteiro → Run.
--   Depois, entre no portal e confira Welcome Boost, Quiz e Boost Dashboard.
--
-- SE ALGO QUEBRAR
--   O bloco de emergência no fim do arquivo desliga tudo e devolve o
--   comportamento anterior em segundos. Está comentado de propósito.
-- ─────────────────────────────────────────────────────────────────────────────

-- Welcome Boost ───────────────────────────────────────────────────────────────
alter table public.welcome_boosts enable row level security;
drop policy if exists "portal: usuarios autenticados" on public.welcome_boosts;
create policy "portal: usuarios autenticados" on public.welcome_boosts
  for all to authenticated using (true) with check (true);

alter table public.boost_relatorios enable row level security;
drop policy if exists "portal: usuarios autenticados" on public.boost_relatorios;
create policy "portal: usuarios autenticados" on public.boost_relatorios
  for all to authenticated using (true) with check (true);

-- Boost Dashboard ─────────────────────────────────────────────────────────────
alter table public.boost_days enable row level security;
drop policy if exists "portal: usuarios autenticados" on public.boost_days;
create policy "portal: usuarios autenticados" on public.boost_days
  for all to authenticated using (true) with check (true);

-- Quiz ────────────────────────────────────────────────────────────────────────
alter table public.pickem_eventos enable row level security;
drop policy if exists "portal: usuarios autenticados" on public.pickem_eventos;
create policy "portal: usuarios autenticados" on public.pickem_eventos
  for all to authenticated using (true) with check (true);

alter table public.pickem_entradas enable row level security;
drop policy if exists "portal: usuarios autenticados" on public.pickem_entradas;
create policy "portal: usuarios autenticados" on public.pickem_entradas
  for all to authenticated using (true) with check (true);

-- Conferência: as cinco devem aparecer com rls = t e uma política cada.
select
  c.relname                                     as tabela,
  c.relrowsecurity                              as rls_ligado,
  (select count(*) from pg_policies p
    where p.schemaname = 'public' and p.tablename = c.relname) as politicas
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('welcome_boosts','boost_relatorios','boost_days',
                    'pickem_eventos','pickem_entradas')
order by c.relname;

-- ─────────────────────────────────────────────────────────────────────────────
-- EMERGÊNCIA — só rode se alguma tela ficar vazia e for preciso voltar atrás.
-- Isto reabre o acesso público às tabelas, ou seja, desfaz a proteção inteira.
--
-- alter table public.welcome_boosts    disable row level security;
-- alter table public.boost_relatorios  disable row level security;
-- alter table public.boost_days        disable row level security;
-- alter table public.pickem_eventos    disable row level security;
-- alter table public.pickem_entradas   disable row level security;
-- ─────────────────────────────────────────────────────────────────────────────
