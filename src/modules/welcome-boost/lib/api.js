import { dedupLatestByBoost } from "./analysis";

// Credenciais vindas do ambiente (.env / painel da Vercel). Os valores que
// estavam fixos aqui seguem como reserva para nao quebrar quem rodar sem .env
// configurado — sao a chave publica (anon), a mesma que o navegador ja
// enviava em toda requisicao.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://lfuhmhubafgjqzuueyzw.supabase.co";
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmdWhtaHViYWZnanF6dXVleXp3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4MjE2NjQsImV4cCI6MjA5NjM5NzY2NH0.99TD4fo6FiOWE61onuY6UHpBurZC6qUZEE55ZrATJ8U";

export const api = async (method, path, body, extraHeaders = {}) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
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
