-- ─────────────────────────────────────────────────────────────────────────────
-- Fecha o acesso público às tabelas do portal (Row Level Security).
--
-- O QUE ISTO RESOLVE
-- A chave anon vai compilada dentro do JavaScript do site: qualquer visitante
-- consegue lê-la. Sem RLS efetivo, essa chave dá leitura E escrita em tudo —
-- dá para inserir, alterar e apagar registros com um `curl`, sem nunca ter
-- feito login. Foi assim que isto foi demonstrado, duas vezes.
--
-- POR QUE A PRIMEIRA VERSÃO NÃO BASTOU
-- Ligar o RLS e criar uma política não fecha nada se já existirem políticas
-- permissivas na tabela: no Postgres as políticas se somam, e basta UMA que
-- libere para o acesso passar. Estas tabelas tinham políticas antigas —
-- provavelmente os modelos "Enable access for all users" do painel — que
-- estavam dormentes só porque o RLS estava desligado. Ao ligar o RLS elas
-- acordaram e a proteção continuou valendo zero.
-- O bloco de limpeza abaixo remove exatamente essas.
--
-- O QUE ISTO **NÃO** RESOLVE
-- Todo usuário logado continua vendo e alterando tudo. Não há dono por linha
-- (as tabelas não têm coluna de usuário), então isto é uma fronteira entre
-- "de fora" e "de dentro", não entre pessoas de dentro.
--
-- EFEITO COLATERAL ESPERADO
-- As versões antigas publicadas (welcome-boost-manager, pickem-dashboard,
-- sportbook-x-tipster) falam com estas tabelas usando só a chave, sem login.
-- Depois deste script elas param de carregar dados. É o esperado: quem passa
-- a atender é o portal.
--
-- ORDEM DE APLICAÇÃO
-- O código do portal que assina as requisições com o token do usuário já está
-- publicado. Pode rodar.
--
-- COMO APLICAR
--   Supabase → SQL Editor → cole este arquivo inteiro → Run.
--   O resultado final lista as 5 tabelas; cada uma deve terminar com
--   `politicas = 1` e `rls_ligado = true`.
--
-- SE ALGO QUEBRAR
--   O bloco de emergência no fim devolve o comportamento anterior em segundos.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Remove as políticas que liberam acesso sem login ─────────────────────────
-- Só as que alcançam `anon` ou `public`; políticas restritas a `authenticated`
-- ou `service_role` não abrem nada e ficam onde estão.
do $$
declare
  r record;
begin
  for r in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('welcome_boosts','boost_relatorios','boost_days',
                        'pickem_eventos','pickem_entradas')
      and policyname <> 'portal: usuarios autenticados'
      and (roles && array['anon','public']::name[])
  loop
    raise notice 'removendo politica permissiva: %.%', r.tablename, r.policyname;
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- 2. Liga o RLS e deixa uma única política: usuário logado ────────────────────

alter table public.welcome_boosts enable row level security;
drop policy if exists "portal: usuarios autenticados" on public.welcome_boosts;
create policy "portal: usuarios autenticados" on public.welcome_boosts
  for all to authenticated using (true) with check (true);

alter table public.boost_relatorios enable row level security;
drop policy if exists "portal: usuarios autenticados" on public.boost_relatorios;
create policy "portal: usuarios autenticados" on public.boost_relatorios
  for all to authenticated using (true) with check (true);

alter table public.boost_days enable row level security;
drop policy if exists "portal: usuarios autenticados" on public.boost_days;
create policy "portal: usuarios autenticados" on public.boost_days
  for all to authenticated using (true) with check (true);

alter table public.pickem_eventos enable row level security;
drop policy if exists "portal: usuarios autenticados" on public.pickem_eventos;
create policy "portal: usuarios autenticados" on public.pickem_eventos
  for all to authenticated using (true) with check (true);

alter table public.pickem_entradas enable row level security;
drop policy if exists "portal: usuarios autenticados" on public.pickem_entradas;
create policy "portal: usuarios autenticados" on public.pickem_entradas
  for all to authenticated using (true) with check (true);

-- 3. Conferência ──────────────────────────────────────────────────────────────
-- Esperado: as 5 tabelas com rls_ligado = true, politicas = 1 e
-- politicas_abertas = 0. Qualquer linha com politicas_abertas > 0 significa
-- que ainda há caminho sem login.
select
  c.relname as tabela,
  c.relrowsecurity as rls_ligado,
  (select count(*) from pg_policies p
     where p.schemaname = 'public' and p.tablename = c.relname) as politicas,
  (select count(*) from pg_policies p
     where p.schemaname = 'public' and p.tablename = c.relname
       and (p.roles && array['anon','public']::name[])) as politicas_abertas
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('welcome_boosts','boost_relatorios','boost_days',
                    'pickem_eventos','pickem_entradas')
order by c.relname;

-- ─────────────────────────────────────────────────────────────────────────────
-- EMERGÊNCIA — só rode se alguma tela do portal ficar vazia. Reabre o acesso
-- público às tabelas, ou seja, desfaz a proteção inteira.
--
-- alter table public.welcome_boosts    disable row level security;
-- alter table public.boost_relatorios  disable row level security;
-- alter table public.boost_days        disable row level security;
-- alter table public.pickem_eventos    disable row level security;
-- alter table public.pickem_entradas   disable row level security;
-- ─────────────────────────────────────────────────────────────────────────────
