-- ─────────────────────────────────────────────────────────────────────────────
-- Restringe o cadastro no portal a domínios de e-mail autorizados.
--
-- Esta é a parte que REALMENTE bloqueia. A tela de login também confere o
-- domínio, mas só para avisar a pessoa na hora: quem chamar a API do Supabase
-- direto passa por cima da validação do navegador. Quem impede de verdade é o
-- hook abaixo, que roda dentro do Supabase antes de o usuário ser criado.
--
-- COMO APLICAR
--   1. Supabase → SQL Editor → cole este arquivo inteiro → Run.
--   2. Supabase → Authentication → Hooks → "Before User Created"
--      → escolha "Postgres" e a função `public.hook_restringir_dominio`
--      → Enable.
--
-- Para autorizar outro domínio depois, basta um insert:
--   insert into public.dominios_de_cadastro (dominio) values ('outrodominio.com');
-- (e acrescente o mesmo domínio em VITE_DOMINIOS_PERMITIDOS, para a tela
--  avisar antes de enviar em vez de deixar o servidor recusar)
-- ─────────────────────────────────────────────────────────────────────────────

-- Lista de domínios liberados. Tabela, e não uma constante dentro da função,
-- para acrescentar um domínio novo sem reescrever a função.
create table if not exists public.dominios_de_cadastro (
  dominio text primary key,
  criado_em timestamptz not null default now()
);

insert into public.dominios_de_cadastro (dominio)
values ('esportiva.bet')
on conflict (dominio) do nothing;

-- O hook recebe { "user": { "email": "..." }, ... } e devolve:
--   {}                                  → cadastro liberado
--   { "error": { "message": …, … } }    → cadastro recusado, com a mensagem
create or replace function public.hook_restringir_dominio(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  email_informado text;
  dominio text;
  liberado boolean;
begin
  email_informado := event -> 'user' ->> 'email';

  -- Sem e-mail no evento não há o que validar (ex.: provedores que não o
  -- entregam). Recusar aqui bloquearia cadastros legítimos por engano.
  if email_informado is null or email_informado = '' then
    return '{}'::jsonb;
  end if;

  dominio := lower(split_part(email_informado, '@', 2));

  select exists (
    select 1 from public.dominios_de_cadastro d
    where lower(d.dominio) = dominio
  ) into liberado;

  if liberado then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'error', jsonb_build_object(
      'message', 'Cadastro permitido apenas para e-mails corporativos autorizados.',
      'http_code', 403
    )
  );
end;
$$;

-- Só o serviço de autenticação executa o hook. Sem o revoke, qualquer visitante
-- com a chave anon poderia chamar a função pela API — não daria para criar
-- conta com isso, mas revelaria a lista de domínios da empresa.
grant usage on schema public to supabase_auth_admin;

grant execute on function public.hook_restringir_dominio to supabase_auth_admin;
revoke execute on function public.hook_restringir_dominio from authenticated, anon, public;

grant select on table public.dominios_de_cadastro to supabase_auth_admin;
revoke all on table public.dominios_de_cadastro from authenticated, anon, public;

alter table public.dominios_de_cadastro enable row level security;
