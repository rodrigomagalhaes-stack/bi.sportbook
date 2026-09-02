import { S } from "../styles";
import { toISODate } from "../lib/format";

// Atalhos de período relativos a hoje. Cada um devolve [from, to] em YYYY-MM-DD local.
const PRESETS = [
  {
    label: "Hoje",
    range: () => { const t = new Date(); const d = toISODate(t); return [d, d]; },
  },
  {
    label: "Últimos 7 dias",
    range: () => {
      const t = new Date();
      const f = new Date(); f.setDate(t.getDate() - 6);
      return [toISODate(f), toISODate(t)];
    },
  },
  {
    label: "Este mês",
    range: () => {
      const t = new Date();
      return [toISODate(new Date(t.getFullYear(), t.getMonth(), 1)), toISODate(new Date(t.getFullYear(), t.getMonth() + 1, 0))];
    },
  },
  {
    label: "Mês passado",
    range: () => {
      const t = new Date();
      return [toISODate(new Date(t.getFullYear(), t.getMonth() - 1, 1)), toISODate(new Date(t.getFullYear(), t.getMonth(), 0))];
    },
  },
];

// Barra de filtro por data compartilhada entre "Relatórios Gerais" e "Ids Repetidos".
// O estado do período vive no App, então a seleção acompanha o usuário entre as telas.
export default function PeriodFilter({ label, from, to, onChange, children }) {
  const isActive = (p) => {
    const [f, t] = p.range();
    return from === f && to === t;
  };
  return (
    <div style={S.filterBar} className="filter-bar">
      <div style={{ fontSize: 12, color: "var(--t3)", marginRight: 4 }}>{label}</div>
      <input type="date" style={S.input} value={from} onChange={(e) => onChange(e.target.value, to)} />
      <span style={{ color: "var(--t3)", fontSize: 13 }}>até</span>
      <input type="date" style={S.input} value={to} onChange={(e) => onChange(from, e.target.value)} />
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {PRESETS.map((p) => {
          const active = isActive(p);
          return (
            <button
              key={p.label}
              onClick={() => onChange(...p.range())}
              style={{
                padding: "8px 13px", fontSize: 12, fontWeight: active ? 700 : 600,
                borderRadius: 99, cursor: "pointer", fontFamily: "var(--font)",
                background: active ? "var(--acc-soft)" : "var(--surface)",
                color: active ? "var(--acc)" : "var(--t2)",
                border: `1px solid ${active ? "var(--acc-line)" : "var(--line-2)"}`,
                transition: "all .12s",
              }}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      {(from || to) && (
        <button style={{ ...S.btnDelete, padding: "8px 14px", fontSize: 12 }} onClick={() => onChange("", "")}>
          Limpar
        </button>
      )}
      {children}
    </div>
  );
}
