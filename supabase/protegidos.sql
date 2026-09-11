-- ─────────────────────────────────────────────────────────────────────────────
-- Bingos Protegidos: o bilhete que o tipster publicou, e o reembolso pago a
-- quem seguiu a dica.
--
-- O CICLO
--   1. O tipster entra com a conta dele no formulário (URL separada, fora do
--      BI) e envia o bilhete. Ele nasce `pendente`.
--   2. A equipe abre a caixa "Solicitações" do BI e aprova ou recusa. A recusa
--      leva motivo, e o tipster lê esse motivo na lista dele.
--   3. Aprovado, o bilhete vai para "A pagar" — mas enquanto o último confronto
--      não terminou, ainda não há o que pagar.
--   4. Ao abrir o cartão, sobe o CSV da base reembolsada e ele vira "Paga".
--
-- POR QUE O VALOR A PAGAR NÃO EXISTE NESTA TABELA
-- O reembolso é dos apostadores, não do tipster: o que sai do caixa é a soma
-- do que CADA seguidor apostou, e isso só se sabe quando a base é gerada. A
-- `stake` aqui é a do bilhete que o tipster publicou — referência, não previsão
-- de caixa. Guardar um "valor estimado a pagar" ao lado dela criaria um número
-- que o financeiro depois não reconcilia com nada.
--
-- A ORDEM DAS SEÇÕES IMPORTA
-- A seção 3 ajusta uma tabela que já exista, e ela vem ANTES do índice e da
-- função que usam `tipster_chave`. Numa base que já tem a tabela, o
-- `create table if not exists` da seção 2 é pulado inteiro e a coluna não nasce
-- ali — foi assim que uma versão anterior deste arquivo quebrou com
-- "column tipster_chave does not exist". O corpo de uma função `language sql`
-- também é validado na hora de criar, então ela não pode vir antes tampouco.
--
-- COMO APLICAR
--   Supabase → SQL Editor → cole este arquivo inteiro → Run.
--   Roda numa base limpa e também por cima de qualquer versão anterior dele.
-- ─────────────────────────────────────────────────────────────────────────────


-- 1. A chave do link ─────────────────────────────────────────────────────────
-- O mesmo bilhete cadastrado duas vezes é reembolso pago duas vezes. O índice
-- único mais abaixo é a trava; esta função é o que faz duas grafias do mesmo
-- endereço colidirem.
--
-- O QUE ELA NORMALIZA, E O QUE ELA DEIXA EM PAZ
-- Tira o protocolo, o `www.` e a barra final — as diferenças que o navegador
-- inventa ao copiar. Baixa a caixa APENAS do domínio.
--
-- O caminho e a query ficam intactos de propósito: o código do bilhete costuma
-- ser alfanumérico sensível à caixa, e `aBc12` e `abc12` são bilhetes
-- diferentes. Baixar a caixa do endereço inteiro faria o segundo ser recusado
-- como duplicado do primeiro — e esse erro cai no lado ruim, o de bloquear um
-- reembolso legítimo com uma mensagem que não faz sentido para quem cadastra.
-- Pelo mesmo motivo a query não é descartada: em muita casa o identificador do
-- bilhete vive nela (`?bet=99`), e jogá-la fora colapsaria bilhetes distintos
-- num só.

create or replace function public.protegidos_link_chave(link text)
returns text
language plpgsql
immutable
as $$
declare
  limpo   text;
  dominio text;
begin
  limpo := btrim(coalesce(link, ''));
  limpo := regexp_replace(limpo, '^https?://', '', 'i');   -- protocolo
  limpo := regexp_replace(limpo, '^www\.', '', 'i');       -- www
  limpo := regexp_replace(limpo, '/+$', '');               -- barra final
  if limpo = '' then
    return '';
  end if;

  -- Domínio é tudo até a primeira barra, interrogação ou cerquilha.
  dominio := split_part(split_part(split_part(limpo, '/', 1), '?', 1), '#', 1);
  return lower(dominio) || substr(limpo, length(dominio) + 1);
end;
$$;


-- 2. Contas e bilhetes ───────────────────────────────────────────────────────
-- Numa base que já tem estas tabelas, tudo aqui é pulado e quem alinha as
-- diferenças é a seção 3.

-- A conta do tipster no formulário. NÃO é usuário do Supabase Auth, de
-- propósito: todo usuário do Auth é `authenticated`, e as políticas do BI
-- (supabase/rls.sql e a seção 8 daqui) liberam tudo para esse papel. Um tipster
-- com conta no Auth leria o BI inteiro. Esta tabela só é lida pelas funções do
-- formulário, com a chave de serviço.
--
-- O `nome` é de quem entra, não do tipster: uma conta pode mandar bilhetes de
-- mais de um tipster, e o nome dele é digitado em cada solicitação.

create table if not exists public.protegidos_contas (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null check (btrim(nome) <> ''),
  email       text not null check (position('@' in email) > 1),
  email_chave text generated always as (lower(btrim(email))) stored,
  -- `scrypt$sal$hash`, gerado em api/_sessao.js do formulário. Nunca a senha.
  senha_hash  text not null,
  criada_em   timestamptz not null default now(),

  -- A trava de tentativas (função logo abaixo). Função serverless não guarda
  -- memória entre uma chamada e outra, então a contagem mora aqui.
  tentativas  integer not null default 0,
  travada_ate timestamptz
);

create unique index if not exists protegidos_contas_email_uk
  on public.protegidos_contas (email_chave);
-- A versão anterior travava o nome da conta como único, quando ele ainda virava
-- o nome do tipster em cada bilhete. Deixou de virar, e a trava sai: duas
-- pessoas chamadas João podem ter conta. A coluna da chave sai junto.
drop index if exists public.protegidos_contas_nome_uk;
alter table public.protegidos_contas drop column if exists nome_chave;

-- A trava de tentativas, numa instrução só.
--
-- A tentativa é contada ANTES de a senha ser conferida, e dentro de um único
-- UPDATE. As duas coisas juntas são o que impede a trava de ser contornada com
-- pedidos em paralelo: se o formulário lesse o contador, conferisse a senha e
-- só então somasse, mil pedidos simultâneos leriam todos "zero tentativas" e
-- mil senhas seriam testadas antes de a primeira falha ser gravada. No UPDATE,
-- o Postgres enfileira os pedidos na linha da conta e cada um enxerga o
-- contador deixado pelo anterior.
--
-- Cinco tentativas passam; a sexta sem acerto trava a conta por quinze minutos.
-- O acerto zera o contador (api/sessao.js). Devolve nulo quando a senha pode
-- ser conferida, ou o momento em que a trava vence.
--
-- Os SETs leem os valores de ANTES da atualização, os dois; o RETURNING lê os
-- de depois.

create or replace function public.protegidos_reservar_tentativa(conta uuid)
returns timestamptz
language sql
as $$
  update public.protegidos_contas
     set travada_ate = case
                         when travada_ate > now() then travada_ate
                         when tentativas >= 5     then now() + interval '15 minutes'
                         else travada_ate
                       end,
         tentativas  = case
                         when travada_ate > now() then tentativas
                         when tentativas >= 5     then 0
                         else tentativas + 1
                       end
   where id = conta
  returning case when travada_ate > now() then travada_ate end;
$$;

-- Só a chave de serviço chama. Um usuário do BI com acesso a esta função
-- conseguiria travar a conta de qualquer tipster.
revoke execute on function public.protegidos_reservar_tentativa(uuid) from public, anon, authenticated;
grant execute on function public.protegidos_reservar_tentativa(uuid) to service_role;

create table if not exists public.protegidos_bilhetes (
  id           uuid primary key default gen_random_uuid(),

  -- ── o que vem do formulário ───────────────────────────────────────────────
  -- O nome do tipster é digitado a cada solicitação — quem entra com uma conta
  -- pode mandar bilhetes de mais de um. `tipster_chave` é o agrupamento: sem ela,
  -- "Rodrigo", "rodrigo" e "Rodrigo " seriam três tipsters em toda soma e todo
  -- filtro — e depois de gravados não haveria como saber que eram o mesmo.
  --
  -- Ela junta caixa, espaço sobrando e acento. O acento sai por `translate`, e
  -- não pela extensão `unaccent`: `unaccent()` é STABLE, não IMMUTABLE, porque
  -- depende de um dicionário que pode mudar — e coluna gerada só aceita função
  -- imutável. O `translate` cobre o que o português usa e nunca deixa de ser
  -- imutável.
  tipster_nome  text not null check (btrim(tipster_nome) <> ''),
  tipster_chave text generated always as (
    translate(
      lower(btrim(regexp_replace(tipster_nome, '\s+', ' ', 'g'))),
      'áàâãäéèêëíìîïóòôõöúùûüçñ',
      'aaaaaeeeeiiiiooooouuuucn'
    )
  ) stored,

  stake        numeric(12,2) not null check (stake > 0),
  link_bilhete text not null check (btrim(link_bilhete) <> ''),
  link_chave   text generated always as (public.protegidos_link_chave(link_bilhete)) stored,

  -- Um bilhete pode ter jogos em dias diferentes. Guardar as datas todas é o
  -- que a tela mostra; `confronto_fim` é o que o sistema usa, e vem do gatilho
  -- da seção 4 — é a data do ÚLTIMO jogo, porque é ela que decide a partir de
  -- quando o bilhete pode ser pago.
  datas_confrontos date[] not null check (cardinality(datas_confrontos) > 0),
  confronto_fim    date,

  observacao   text,
  enviado_em   timestamptz not null default now(),
  enviado_por  text,             -- o e-mail da conta que enviou
  -- Nulo nos bilhetes de antes do login, que não têm dono. Sem cascata: apagar
  -- uma conta não pode levar junto bilhete que já virou pagamento.
  conta_id     uuid references public.protegidos_contas(id),

  -- ── o que a operação decide ───────────────────────────────────────────────
  -- Só existem aqui os estados que são decisão de gente — `pendente` é o
  -- "ninguém decidiu ainda". "Aguardando confronto" e "liberado para pagar" NÃO
  -- são status: eles saem da comparação entre `confronto_fim` e a data de hoje,
  -- e por isso nunca ficam desatualizados nem dependem de alguém lembrar de
  -- arrastar um card.
  status        text not null default 'pendente'
                check (status in ('pendente', 'a_pagar', 'pago', 'recusado')),
  aprovado_em   timestamptz,
  aprovado_por  text,
  recusado_em   timestamptz,
  recusado_por  text,
  pago_em       timestamptz,
  pago_por      text,
  motivo_recusa text,

  constraint protegidos_pago_tem_data
    check (status <> 'pago' or pago_em is not null)
);


-- 3. Alinhando uma tabela que já exista ──────────────────────────────────────
-- Precisa vir aqui, e não no fim: o índice da seção 4 e a função da seção 7
-- usam `tipster_chave`, e o Postgres recusa as duas se a coluna ainda não
-- existir.
--
-- A primeira versão deste arquivo tinha uma tabela `protegidos_tipsters` e um
-- `tipster_id` obrigatório no bilhete, porque o formulário oferecia lista
-- suspensa em vez de campo de texto. O nome passou a ser digitado, então as
-- duas coisas saem.
--
-- `tipster_chave` é DERRUBADA E REFEITA, e não acrescentada com `if not
-- exists`. A expressão de uma coluna gerada não se altera no lugar: uma versão
-- anterior criou a chave sem tirar acento, e um `add column if not exists` a
-- encontraria já existente e deixaria a fórmula velha em pé — o agrupamento
-- continuaria separando "joao" de "joão" sem erro nenhum aparecer. Refazer é
-- barato: a coluna é calculada a partir de `tipster_nome`, nada se perde.

drop index if exists public.protegidos_bilhetes_tipster_ix;
alter table public.protegidos_bilhetes drop column if exists tipster_chave;

alter table public.protegidos_bilhetes
  add column tipster_chave text generated always as (
    translate(
      lower(btrim(regexp_replace(tipster_nome, '\s+', ' ', 'g'))),
      'áàâãäéèêëíìîïóòôõöúùûüçñ',
      'aaaaaeeeeiiiiooooouuuucn'
    )
  ) stored;

-- A ordem aqui também importa: a coluna aponta para a tabela pela chave
-- estrangeira, então ela sai antes da tabela.
alter table public.protegidos_bilhetes drop column if exists tipster_id;
drop table if exists public.protegidos_tipsters;

-- A versão com login e análise. Aqui `add column if not exists` serve, ao
-- contrário de `tipster_chave`: nenhuma destas é coluna gerada, então não há
-- fórmula velha que possa ficar em pé.
--
-- Os bilhetes que já estão em `a_pagar` continuam lá e contam como aprovados:
-- entraram quando não havia análise. Muda só o padrão, para o que chega de
-- agora em diante.
--
-- A regra do status é trocada pelo nome. Ela nasceu na linha da coluna, e o
-- Postgres batiza essas regras de `<tabela>_<coluna>_check`.

alter table public.protegidos_bilhetes
  add column if not exists conta_id     uuid references public.protegidos_contas(id),
  add column if not exists aprovado_em  timestamptz,
  add column if not exists aprovado_por text,
  add column if not exists recusado_em  timestamptz,
  add column if not exists recusado_por text;

alter table public.protegidos_bilhetes
  drop constraint if exists protegidos_bilhetes_status_check;
alter table public.protegidos_bilhetes
  add constraint protegidos_bilhetes_status_check
  check (status in ('pendente', 'a_pagar', 'pago', 'recusado'));
alter table public.protegidos_bilhetes
  alter column status set default 'pendente';


-- 4. O gatilho das datas, e os índices ───────────────────────────────────────
-- `confronto_fim` seria uma coluna gerada se desse: coluna gerada exige função
-- imutável e sem subconsulta, e tirar o máximo de um array precisa de `unnest`.
-- O gatilho faz o mesmo serviço e ainda ordena e tira as repetidas do array,
-- então a tela nunca recebe "12/03, 11/03, 12/03" para exibir.

create or replace function public.protegidos_datas()
returns trigger
language plpgsql
as $$
begin
  select array_agg(distinct d order by d) into new.datas_confrontos
  from unnest(new.datas_confrontos) as d;

  new.confronto_fim := new.datas_confrontos[cardinality(new.datas_confrontos)];
  return new;
end;
$$;

drop trigger if exists protegidos_datas_tg on public.protegidos_bilhetes;
create trigger protegidos_datas_tg
  before insert or update of datas_confrontos on public.protegidos_bilhetes
  for each row execute function public.protegidos_datas();

-- A trava do duplicado ignora os recusados: um bilhete recusado por erro de
-- digitação precisa poder ser cadastrado de novo, e sem o `where` ele ficaria
-- bloqueado para sempre pelo próprio registro descartado.
create unique index if not exists protegidos_bilhetes_link_uk
  on public.protegidos_bilhetes (link_chave)
  where status <> 'recusado';

create index if not exists protegidos_bilhetes_fim_ix
  on public.protegidos_bilhetes (confronto_fim desc);
create index if not exists protegidos_bilhetes_status_ix
  on public.protegidos_bilhetes (status);
create index if not exists protegidos_bilhetes_tipster_ix
  on public.protegidos_bilhetes (tipster_chave);
-- "Minhas solicitações": os bilhetes de uma conta, do mais recente para trás.
create index if not exists protegidos_bilhetes_conta_ix
  on public.protegidos_bilhetes (conta_id, enviado_em desc);


-- 5. As bases pagas ──────────────────────────────────────────────────────────
-- Um envio de CSV. O arquivo vai para o Storage (auditoria) e os totais ficam
-- aqui, para as caixas somarem sem precisar ler linha nenhuma.

create table if not exists public.protegidos_bases (
  id              uuid primary key default gen_random_uuid(),
  bilhete_id      uuid not null references public.protegidos_bilhetes(id) on delete cascade,
  arquivo_nome    text not null,
  arquivo_caminho text,          -- no bucket `protegidos-bases`; nulo = só as linhas
  linhas          integer not null default 0,
  usuarios        integer not null default 0,   -- distintos
  valor_total     numeric(14,2) not null default 0,
  col_usuario     text,          -- que coluna do arquivo virou usuário
  col_valor       text,
  enviado_em      timestamptz not null default now(),
  enviado_por     text
);

-- Um bilhete aceita mais de uma base (reembolso em lotes) e os totais somam
-- todas. O que isso abre é o duplo envio por engano — o mesmo arquivo subindo
-- duas vezes dobraria o valor pago sem ninguém notar. O índice fecha esse caso
-- específico: mesmo nome de arquivo no mesmo bilhete é recusado.
create unique index if not exists protegidos_bases_arquivo_uk
  on public.protegidos_bases (bilhete_id, arquivo_nome);

create index if not exists protegidos_bases_bilhete_ix
  on public.protegidos_bases (bilhete_id);


-- 6. As linhas da base ───────────────────────────────────────────────────────
-- Uma linha por usuário reembolsado. É o que permite ver o mesmo ID sendo
-- reembolsado em bilhetes de tipsters diferentes — sem elas esse cruzamento não
-- existe e o abuso fica invisível.

create table if not exists public.protegidos_base_linhas (
  id         bigserial primary key,
  base_id    uuid not null references public.protegidos_bases(id) on delete cascade,
  -- Repetido da base de propósito: o cruzamento agrupa por bilhete, e sem esta
  -- coluna toda consulta de abuso pagaria um join a mais.
  bilhete_id uuid not null references public.protegidos_bilhetes(id) on delete cascade,
  usuario    text not null,
  -- Normalizado no banco, e não no navegador, porque quem escreve aqui são dois
  -- programas diferentes (o BI e o formulário). Chave calculada em dois lugares
  -- é chave que um dia diverge, e aí o cruzamento passa a errar em silêncio.
  chave      text generated always as (lower(btrim(usuario))) stored,
  valor      numeric(12,2),
  linha      integer          -- posição no arquivo, para achar no original
);

create index if not exists protegidos_linhas_chave_ix
  on public.protegidos_base_linhas (chave);
create index if not exists protegidos_linhas_base_ix
  on public.protegidos_base_linhas (base_id);
create index if not exists protegidos_linhas_bilhete_ix
  on public.protegidos_base_linhas (bilhete_id);


-- 7. O cruzamento de IDs ─────────────────────────────────────────────────────
-- Roda no banco, e não no navegador, por tamanho: um bilhete popular reembolsa
-- milhares de pessoas, e trazer todas as linhas de um mês para o front só para
-- agrupá-las lá seriam dezenas de MB por carregamento de tela.
--
-- Uma view não serviria: o agrupamento aconteceria ANTES do filtro de período
-- que o PostgREST aplicaria por cima, e a contagem sairia do histórico inteiro
-- em vez do período pedido. Por isso é função com as datas como argumento.
--
-- SECURITY INVOKER (o padrão): o RLS das tabelas continua valendo para quem
-- chama. Sem login, não devolve nada.

drop function if exists public.protegidos_ids_repetidos(date, date);

create function public.protegidos_ids_repetidos(de date, ate date)
returns table (
  usuario    text,
  bilhetes   integer,
  tipsters   integer,
  reembolsos integer,
  total      numeric,
  ultimo     date
)
language sql
stable
as $$
  select
    min(l.usuario)                        as usuario,   -- a grafia original
    count(distinct l.bilhete_id)::int     as bilhetes,
    count(distinct b.tipster_chave)::int  as tipsters,
    count(*)::int                         as reembolsos,
    coalesce(sum(l.valor), 0)             as total,
    max(b.confronto_fim)                  as ultimo
  from public.protegidos_base_linhas l
  join public.protegidos_bilhetes b on b.id = l.bilhete_id
  where b.confronto_fim between de and ate
  group by l.chave
  having count(distinct l.bilhete_id) > 1
  order by count(distinct l.bilhete_id) desc, coalesce(sum(l.valor), 0) desc
  limit 500;
$$;


-- 8. RLS ─────────────────────────────────────────────────────────────────────
-- Mesmo molde de supabase/rls.sql: a chave publicável vai compilada no
-- JavaScript do site, então ela sozinha não pode enxergar nada. Quem assina é a
-- pessoa logada.
--
-- O formulário de cadastro (URL separada) NÃO passa por aqui: ele escreve pela
-- função serverless, com a service role, que ignora RLS por definição. É por
-- isso que a chave de serviço mora só nas variáveis daquele projeto e nunca
-- chega ao navegador.

alter table public.protegidos_bilhetes    enable row level security;
alter table public.protegidos_bases       enable row level security;
alter table public.protegidos_base_linhas enable row level security;

-- As contas ligam o RLS e NÃO ganham política nenhuma: nem o BI logado as lê.
-- Quem lê é só a função do formulário, com a chave de serviço, que ignora o
-- RLS. O BI não precisa delas — o nome do tipster já vem copiado no bilhete — e
-- assim o hash das senhas não chega a navegador nenhum.
alter table public.protegidos_contas enable row level security;

drop policy if exists "portal: usuarios autenticados" on public.protegidos_bilhetes;
create policy "portal: usuarios autenticados" on public.protegidos_bilhetes
  for all to authenticated using (true) with check (true);

drop policy if exists "portal: usuarios autenticados" on public.protegidos_bases;
create policy "portal: usuarios autenticados" on public.protegidos_bases
  for all to authenticated using (true) with check (true);

drop policy if exists "portal: usuarios autenticados" on public.protegidos_base_linhas;
create policy "portal: usuarios autenticados" on public.protegidos_base_linhas
  for all to authenticated using (true) with check (true);


-- 9. O bucket do arquivo original ────────────────────────────────────────────
-- Privado: o CSV da base tem identificador de jogador e valor pago, e um bucket
-- público seria esse arquivo aberto a quem descobrisse a URL.
--
-- As linhas já estão na tabela e é delas que saem todos os números. O arquivo
-- fica pelo motivo de sempre em pagamento: poder mostrar depois exatamente o
-- que foi enviado, com as colunas que o parceiro mandou.
--
-- SE ESTE BLOCO FALHAR com "must be owner of table objects", crie o bucket pelo
-- painel (Storage → New bucket → `protegidos-bases`, privado) e as duas
-- políticas em Storage → Policies. O resto do arquivo já terá rodado, e a tela
-- funciona sem isto: sem bucket, `arquivo_caminho` fica nulo e o pagamento é
-- gravado do mesmo jeito — perde-se a via de conferência, não os números.

insert into storage.buckets (id, name, public)
values ('protegidos-bases', 'protegidos-bases', false)
on conflict (id) do nothing;

drop policy if exists "protegidos: leitura autenticada"  on storage.objects;
create policy "protegidos: leitura autenticada" on storage.objects
  for select to authenticated using (bucket_id = 'protegidos-bases');

drop policy if exists "protegidos: envio autenticado" on storage.objects;
create policy "protegidos: envio autenticado" on storage.objects
  for insert to authenticated with check (bucket_id = 'protegidos-bases');


-- 10. Conferência ────────────────────────────────────────────────────────────
-- Esperado: as 3 tabelas de bilhete com rls_ligado = true, politicas = 1 e
-- politicas_abertas = 0; `protegidos_contas` com rls_ligado = true e
-- politicas = 0. Qualquer linha com politicas_abertas > 0 significa que ainda
-- há caminho sem login — e qualquer política em `protegidos_contas` põe o hash
-- das senhas ao alcance do BI.

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
  and c.relname in ('protegidos_bilhetes', 'protegidos_bases', 'protegidos_base_linhas',
                    'protegidos_contas')
order by c.relname;

-- As colunas que a versão nova precisa ter: `tipster_chave`, `conta_id`,
-- `aprovado_em` e `recusado_em` presentes, e `tipster_id` ausente.
select column_name, is_generated
from information_schema.columns
where table_schema = 'public'
  and table_name = 'protegidos_bilhetes'
  and column_name in ('tipster_nome', 'tipster_chave', 'tipster_id', 'link_chave',
                      'conta_id', 'aprovado_em', 'recusado_em')
order by column_name;
