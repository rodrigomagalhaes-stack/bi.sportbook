-- ─────────────────────────────────────────────────────────────────────────────
-- Restringe o cadastro no portal a domínios de e-mail autorizados.
--
-- Esta é a parte que REALMENTE bloqueia. A tela de login também confere o
-- domínio, mas só para avisar a pessoa na hora: quem chamar a API do Supabase
-- direto passa por cima da validação do navegador.
--
-- COMO APLICAR
--   1. Supabase → SQL Editor → cole este arquivo inteiro → Run.
--   2. Supabase → Authentication → Hooks → "Before User Created"
--      → Postgres → função `public.hook_restringir_dominio` → Enable.
--
-- Para autorizar outro domínio: acrescente na lista `dominios` abaixo e rode
-- o arquivo de novo (o `create or replace` cuida do resto). Acrescente também
-- em VITE_DOMINIOS_PERMITIDOS, para a tela avisar antes de enviar.
--
-- POR QUE NÃO HÁ TABELA DE DOMÍNIOS AQUI
-- A primeira versão guardava os domínios numa tabela, e o hook quebrava com
-- "Error running hook URI ... unexpected_failure" — um 500 que travava TODO
-- cadastro, não só os de domínio errado. Ler uma tabela obriga o papel
-- `supabase_auth_admin` a ter acesso ao schema, à tabela e a atravessar o RLS
-- dela; cada um desses é um ponto de falha invisível daqui. Com a lista dentro
-- da própria função, o hook não depende de mais nada.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.hook_restringir_dominio(event jsonb)
returns jsonb
language plpgsql
as $$
declare
  -- Domínios autorizados. Sempre em minúsculas.
  dominios text[] := array['esportiva.bet'];
  email_informado text;
  dominio text;
begin
  email_informado := lower(coalesce(event -> 'user' ->> 'email', ''));

  -- Sem e-mail no evento não há o que validar. Recusar aqui bloquearia
  -- cadastros legítimos por engano.
  if email_informado = '' then
    return '{}'::jsonb;
  end if;

  dominio := split_part(email_informado, '@', 2);

  if dominio = any (dominios) then
    return '{}'::jsonb;   -- liberado
  end if;

  return jsonb_build_object(
    'error', jsonb_build_object(
      'message', 'Cadastro permitido apenas para e-mails @esportiva.bet.',
      'http_code', 403
    )
  );

exception when others then
  -- Uma exceção aqui vira HTTP 500 e derruba o cadastro inteiro — inclusive o
  -- de quem tem o domínio certo. Melhor recusar com uma mensagem legível do
  -- que deixar a tela de cadastro fora do ar sem ninguém entender por quê.
  return jsonb_build_object(
    'error', jsonb_build_object(
      'message', 'Não foi possível validar o e-mail. Avise o administrador do portal.',
      'http_code', 403
    )
  );
end;
$$;

-- Só o serviço de autenticação executa o hook. O revoke evita que qualquer
-- visitante com a chave anon chame a função pela API REST.
grant usage on schema public to supabase_auth_admin;
grant execute on function public.hook_restringir_dominio(jsonb) to supabase_auth_admin;
revoke execute on function public.hook_restringir_dominio(jsonb) from authenticated, anon, public;

-- A tabela da versão anterior não é mais usada por ninguém. Guardava uma única
-- linha de configuração ('esportiva.bet'), nenhum dado de usuário.
drop table if exists public.dominios_de_cadastro;
