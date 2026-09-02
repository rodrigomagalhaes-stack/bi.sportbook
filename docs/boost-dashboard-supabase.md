# Configuracao do Supabase

## 1. Criar a tabela

No SQL Editor do projeto Supabase, execute:

```sql
create table if not exists public.boost_days (
  date text primary key,
  saved_at timestamptz not null default now(),
  boosts jsonb not null default '[]'::jsonb,
  campaign jsonb
);

alter table public.boost_days enable row level security;

create policy "boost days public read"
on public.boost_days for select
using (true);

create policy "boost days public insert"
on public.boost_days for insert
with check (true);

create policy "boost days public update"
on public.boost_days for update
using (true)
with check (true);

create policy "boost days public delete"
on public.boost_days for delete
using (true);
```

## 1b. Migracao — coluna `campaign` (tabela ja existente)

Se a tabela foi criada antes da campanha de aumento de ganhos, rode:

```sql
alter table public.boost_days add column if not exists campaign jsonb;
```

Essa coluna guarda os totais da campanha de aumento de ganhos de cada dia
(participacoes, usuarios, stake, win, net e custo do aumento). Sem ela o
dashboard continua salvando os boosts normalmente, mas avisa que os dados da
campanha nao foram gravados.

## 2. Informar as credenciais

No inicio do bloco JavaScript de `boost-dashboard.html`, substitua:

```js
const SUPABASE_URL = 'https://SEU-PROJETO.supabase.co';
const SUPABASE_ANON_KEY = 'SUA-CHAVE-ANON';
```

Use a URL do projeto e a chave publica `anon` em **Project Settings > API**. Nunca coloque a `service_role` no HTML.

## 3. Comportamento

- Com as credenciais preenchidas, o historico e salvo, carregado, excluido e limpo no Supabase.
- Sem as credenciais, o dashboard continua funcionando com `localStorage` como fallback local.
- A chave `anon` fica visivel no navegador por design. As politicas acima deixam os dados publicos; para dados privados, adicione autenticacao Supabase e restrinja as policies por usuario.
