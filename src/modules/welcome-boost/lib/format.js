// Helpers de formatação, datas e download compartilhados entre as telas.

export const fmt = (n) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

export const fmtR = (v) => {
  if (v === undefined || v === null || isNaN(v)) return "R$ 0,00";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
};

export const fmtDate = (d) =>
  new Date(d).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

// Converte uma data ISO (UTC) para o valor que um <input type="datetime-local"> espera
// (YYYY-MM-DDTHH:mm em horário LOCAL). Usado para pré-preencher o formulário ao editar.
export const toLocalInput = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// Data local no formato YYYY-MM-DD que um <input type="date"> espera (usado nos presets de período).
export const toISODate = (d) => {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const computeStatus = (boost) => {
  const now = new Date();
  const evento = new Date(boost.data_evento);
  if (now >= evento) return "encerrado";
  return "ativo";
};

export const statusConfig = {
  ativo: { label: "Ativo", color: "var(--up)", bg: "var(--up-soft)" },
  encerrado: { label: "Encerrado", color: "var(--t3)", bg: "var(--surface-2)" },
};

export const AVATAR_COLORS = ["#e8540f", "#11874c", "#4a52c9", "#b8770a", "#2f6f9e", "#a8456b", "#3a8a55", "#a85f8e"];

export const splitConfronto = (confronto) => {
  const parts = (confronto || "").split(/\s+vs\.?\s+/i);
  return parts.length === 2 ? parts : [confronto || "", ""];
};

export const initials = (name) =>
  (name || "").trim().replace(/[^a-zA-ZÀ-ÿ\s]/g, "").slice(0, 2).toUpperCase() || "?";

export const colorFor = (seed) => {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
};

// Gera e baixa um .csv com uma lista de IDs de jogadores
export const downloadIdsCsv = (ids, filename) => {
  if (!ids || !ids.length) return;
  const lines = ["ID do Jogador", ...ids.map((id) => String(id))];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

// Gera e baixa um .csv com a lista de IDs de jogadores processados em um relatório
export const downloadIds = (ids, boost) => {
  const slug = (boost?.id_jogo || boost?.confronto || "relatorio").toString().replace(/[^a-zA-Z0-9_-]+/g, "_");
  downloadIdsCsv(ids, `ids_processados_${slug}.csv`);
};
