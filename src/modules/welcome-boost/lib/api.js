import { dedupLatestByBoost } from "./analysis";
import { supabase } from "../../../lib/supabase";

// Credenciais vindas do ambiente (.env / painel da Vercel). Os valores que
// estavam fixos aqui seguem como reserva para nao quebrar quem rodar sem .env
// configurado — sao a chave publica (anon), a mesma que o navegador ja
// enviava em toda requisicao.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://lfuhmhubafgjqzuueyzw.supabase.co";
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmdWhtaHViYWZnanF6dXVleXp3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4MjE2NjQsImV4cCI6MjA5NjM5NzY2NH0.99TD4fo6FiOWE61onuY6UHpBurZC6qUZEE55ZrATJ8U";

// Token do usuário logado, quando existe. Este módulo fala com a API REST na
// mão, sem o cliente do supabase-js, então mandava a chave anon no
// Authorization — e para o Postgres isso é o papel `anon`, não uma pessoa.
// Com RLS ligado, `anon` não enxerga nada; quem precisa assinar as requisições
// é o usuário. A chave anon continua no header `apikey`, que é o que
// identifica o projeto.
const tokenDoUsuario = async () => {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
};

export const api = async (method, path, body, extraHeaders = {}) => {
  const token = await tokenDoUsuario();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${token ?? SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: method === "POST" ? "return=representation" : "",
      ...extraHeaders,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }
  if (res.status === 204) return null;
  return res.json();
};

// Busca todos os relatórios (com dados da boost) já deduplicados pelo mais recente de cada boost.
// Compartilhado por "Relatórios Gerais" e "Ids Repetidos" para garantir que ambos somem
// exatamente o mesmo conjunto de dados.
export const fetchLatestReports = () =>
  api("GET", "boost_relatorios?select=*,welcome_boosts(confronto,data_evento,mercado)&order=created_at.desc")
    .then(dedupLatestByBoost);
