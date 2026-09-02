// ─── STYLES ──────────────────────────────────────────────────────────────────
export const v = (name) => `var(--${name})`;
export const S = {
  app: {
    minHeight: "100%",
    background: v("bg"),
    color: v("t1"),
    fontFamily: "var(--font)",
    position: "relative",
  },
  main: { position: "relative", zIndex: 1, maxWidth: 1240, margin: "0 auto", padding: "0 30px 60px" },
  // shell com sidebar (inspirado no layout do shadcn-admin)
  shell: { display: "flex", alignItems: "flex-start", minHeight: "100%" },
  sidebar: {
    width: 240, flexShrink: 0, background: v("surface"), borderRight: `1px solid ${v("line")}`,
    padding: "22px 14px", display: "flex", flexDirection: "column", gap: 2,
    position: "sticky", top: 0, height: "100vh", boxSizing: "border-box",
  },
  sidebarLogo: { display: "flex", alignItems: "center", gap: 11, padding: "4px 10px", marginBottom: 22 },
  sidebarNavLabel: {
    fontFamily: "var(--mono)", fontSize: 9.5, color: v("t3"), textTransform: "uppercase",
    letterSpacing: "0.12em", padding: "16px 12px 7px", fontWeight: 500,
  },
  sidebarNavItem: (active) => ({
    display: "flex", alignItems: "center", gap: 11, padding: "9px 12px", borderRadius: "var(--r-sm)",
    fontSize: 13.5, fontWeight: active ? 700 : 500,
    color: active ? v("acc") : v("t2"),
    background: active ? v("acc-soft") : "transparent",
    border: `1px solid ${active ? v("acc-line") : "transparent"}`,
    cursor: "pointer", transition: "background .12s, border-color .12s, color .12s",
    width: "100%", textAlign: "left", fontFamily: "var(--font)",
  }),
  contentArea: { flex: 1, minWidth: 0, padding: "30px 36px 60px" },
  // cabecalho da pagina: titulo a esquerda, acao primaria a direita (a barra
  // lateral do modulo deu lugar a do portal, ver App.jsx)
  pageCabecalho: {
    display: "flex", alignItems: "flex-start", justifyContent: "space-between",
    gap: 16, flexWrap: "wrap",
  },
  pageTitle: { fontSize: 20, fontWeight: 800, letterSpacing: -0.4, color: v("t1"), marginBottom: 2 },
  pageSub: { fontFamily: "var(--mono)", fontSize: 11.5, color: v("t3"), marginBottom: 24 },
  header: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "26px 0", borderBottom: `1px solid ${v("line")}`,
    marginBottom: 28, position: "sticky", top: 0, background: v("bg"), zIndex: 5,
  },
  logo: { display: "flex", alignItems: "center", gap: 12 },
  logoMark: {
    width: 38, height: 38, borderRadius: 10,
    background: "#ffffff", border: `1px solid ${v("line-2")}`,
    display: "flex", alignItems: "center", justifyContent: "center",
    fontFamily: "var(--mono)", fontSize: 16, fontWeight: 800, color: v("t1"), letterSpacing: -0.5,
    boxShadow: "0 1px 2px rgba(27,24,20,0.12), inset 0 1px 0 rgba(255,255,255,0.6)",
  },
  logoText: { fontSize: 18, fontWeight: 800, letterSpacing: -0.4, color: v("t1") },
  logoSub: { fontFamily: "var(--mono)", fontSize: 10.5, color: v("t3"), letterSpacing: "0.12em", textTransform: "uppercase" },
  btnPrimary: {
    display: "flex", alignItems: "center", gap: 8,
    background: "#ffffff", border: `1px solid ${v("line-2")}`,
    color: v("t1"), borderRadius: "var(--r-sm)",
    padding: "10px 17px", fontSize: 14.5, fontWeight: 600,
    cursor: "pointer", transition: "background .12s, border-color .12s",
    boxShadow: "0 1px 2px rgba(27,24,20,0.10), inset 0 1px 0 rgba(255,255,255,0.6)",
    fontFamily: "var(--font)",
  },
  tabs: { display: "flex", gap: 6, marginBottom: 28 },
  tab: (active) => ({
    display: "inline-flex", alignItems: "center", gap: 7,
    padding: "9px 18px", borderRadius: "var(--r-sm)", cursor: "pointer",
    fontSize: 13.5, fontWeight: active ? 700 : 500,
    background: active ? v("acc-soft") : "transparent",
    color: active ? v("acc") : v("t2"),
    border: `1px solid ${active ? v("acc-line") : "transparent"}`,
    transition: "all 0.12s", fontFamily: "var(--font)",
  }),
  filterBar: {
    display: "flex", gap: 12, marginBottom: 24, alignItems: "center", flexWrap: "wrap",
  },
  input: {
    background: v("surface"), border: `1px solid ${v("line-2")}`,
    borderRadius: "var(--r-sm)", padding: "10px 14px", color: v("t1"), fontSize: 13.5,
    outline: "none", transition: "border-color .12s, box-shadow .12s",
    fontFamily: "var(--font)",
  },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(376px, 1fr))", gap: 16 },
  card: {
    background: v("surface"), border: `1px solid ${v("line")}`,
    borderRadius: "var(--r-lg)", padding: 22, position: "relative", overflow: "hidden",
    transition: "border-color 0.15s, box-shadow 0.15s",
    boxShadow: "var(--shadow)",
    cursor: "default",
  },
  cardAccent: (color) => ({
    position: "absolute", top: 0, left: 0, right: 0, height: 3,
    background: color,
  }),
  cardHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, gap: 14 },
  matchup: { display: "flex", alignItems: "center", gap: 14, flex: 1, minWidth: 0 },
  avatar: (color) => ({
    width: 44, height: 44, borderRadius: 13, flexShrink: 0,
    background: `${color}1F`, border: `1px solid ${color}40`,
    display: "flex", alignItems: "center", justifyContent: "center",
    fontFamily: "var(--mono)", fontSize: 13, fontWeight: 700, color, letterSpacing: 0,
  }),
  matchupCenter: { minWidth: 0 },
  confronto: {
    fontSize: 16, fontWeight: 700, letterSpacing: -0.3, color: v("t1"), lineHeight: 1.3,
    overflowWrap: "anywhere", wordBreak: "break-word",
  },
  confrontoVs: { color: v("acc") },
  idJogo: { fontFamily: "var(--mono)", fontSize: 11, color: v("t3"), marginTop: 3 },
  // faixa de destaque (odd antiga -> nova)
  oddRow: {
    display: "flex", alignItems: "center", gap: 10, marginBottom: 16,
    padding: "12px 14px", background: v("surface-2"), borderRadius: "var(--r-md)",
    border: `1px solid ${v("line")}`,
  },
  oddOld: { fontFamily: "var(--mono)", fontSize: 13, color: v("t3"), textDecoration: "line-through" },
  oddArrow: { fontSize: 13, color: v("acc"), fontWeight: 700 },
  oddNew: { fontFamily: "var(--mono)", fontSize: 18, fontWeight: 800, color: v("acc"), letterSpacing: "-0.02em" },
  maxStake: { fontFamily: "var(--mono)", fontSize: 12, marginLeft: "auto", color: v("t2"), fontWeight: 600 },
  // grade de info 2-col com ícones
  metaRow: { display: "flex", flexWrap: "wrap", gap: "10px 24px", marginBottom: 16 },
  metaRowItem: { display: "flex", alignItems: "center", gap: 9 },
  metaRowIconWrap: {
    width: 26, height: 26, borderRadius: 8, flexShrink: 0,
    background: v("surface-2"), color: v("t3"), border: `1px solid ${v("line")}`,
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  metaRowText: { display: "flex", flexDirection: "column", gap: 1 },
  metaRowLabel: { fontFamily: "var(--mono)", fontSize: 9.5, color: v("t3"), textTransform: "uppercase", letterSpacing: "0.1em" },
  metaRowValue: { fontFamily: "var(--mono)", fontSize: 12.5, fontWeight: 600, color: v("t1") },
  marketTag: {
    display: "inline-flex", alignItems: "center", gap: 6,
    padding: "5px 11px", borderRadius: 8, fontSize: 12, fontWeight: 600,
    background: v("info-soft"), color: v("info"),
    border: "1px solid transparent",
  },
  badge: (color, bg) => ({
    display: "inline-flex", alignItems: "center", gap: 7,
    padding: "5px 11px", borderRadius: 8, fontSize: 11.5, fontWeight: 700,
    color, background: bg, letterSpacing: "0.04em", textTransform: "uppercase",
    whiteSpace: "nowrap",
  }),
  cardActions: { display: "flex", gap: 8, marginTop: 4 },
  btnReport: {
    flex: 1, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 7,
    background: v("surface-2"), border: `1px solid ${v("line")}`,
    color: v("acc"), borderRadius: "var(--r-sm)", padding: "12px 16px", fontSize: 13.5,
    fontWeight: 700, cursor: "pointer", transition: "background .12s, border-color .12s",
    fontFamily: "var(--font)",
  },
  btnReportLeft: { display: "flex", alignItems: "center", gap: 8 },
  // bloco "Mercado" em destaque
  marketBox: {
    display: "flex", alignItems: "center", gap: 13, marginBottom: 16,
    padding: "12px 14px", background: v("surface-2"), borderRadius: "var(--r-md)",
    border: `1px solid ${v("line")}`,
  },
  marketBoxIcon: {
    width: 38, height: 38, borderRadius: 11, flexShrink: 0,
    background: v("info-soft"), color: v("info"),
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  marketBoxLabel: { fontFamily: "var(--mono)", fontSize: 9.5, color: v("t3"), textTransform: "uppercase", letterSpacing: "0.1em" },
  marketBoxValue: { fontSize: 15, fontWeight: 700, color: v("t1"), marginTop: 2 },
  // estatística do bloco de resultado: ícone + label + valor + barrinha de destaque
  resultStat: { display: "flex", flexDirection: "column", gap: 9 },
  resultStatLabel: { fontFamily: "var(--mono)", fontSize: 9.5, color: v("t3"), textTransform: "uppercase", letterSpacing: "0.1em" },
  resultStatValue: { fontFamily: "var(--mono)", fontSize: 16, fontWeight: 800, letterSpacing: "-0.02em", color: v("t1") },
  resultStatBar: (color) => ({ width: 26, height: 3, borderRadius: 2, background: color }),
  btnDelete: {
    display: "flex", alignItems: "center", justifyContent: "center",
    background: v("down-soft"), border: "1px solid transparent",
    color: v("down"), borderRadius: "var(--r-sm)", padding: "9px 12px", fontSize: 12,
    fontWeight: 600, cursor: "pointer", transition: "all 0.12s",
    fontFamily: "var(--font)",
  },
  empty: {
    textAlign: "center", padding: "80px 20px", color: v("t3"),
  },
  emptyTitle: { fontSize: 18, fontWeight: 700, color: v("t2"), marginBottom: 8 },
  // MODAL
  overlay: {
    position: "fixed", inset: 0, background: "rgba(27,24,20,0.45)", zIndex: 100,
    display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    backdropFilter: "blur(3px)",
  },
  modal: {
    background: v("surface"), border: `1px solid ${v("line")}`,
    borderRadius: "var(--r-lg)", width: "100%", maxWidth: 540, maxHeight: "90vh",
    overflowY: "auto", position: "relative", boxShadow: "0 20px 60px -20px rgba(40,32,20,0.35)",
  },
  modalHeader: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "24px 28px 0",
  },
  modalTitle: { fontSize: 18, fontWeight: 800, letterSpacing: -0.3, color: v("t1") },
  modalBody: { padding: "24px 28px 28px" },
  formGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 },
  formGroup: { display: "flex", flexDirection: "column", gap: 6 },
  formGroupFull: { display: "flex", flexDirection: "column", gap: 6, gridColumn: "1 / -1" },
  label: { fontFamily: "var(--mono)", fontSize: 10, color: v("t3"), textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 500 },
  select: {
    background: v("surface"), border: `1px solid ${v("line-2")}`,
    borderRadius: "var(--r-sm)", padding: "10px 14px", color: v("t1"), fontSize: 13.5,
    outline: "none", fontFamily: "var(--font)",
    appearance: "none",
  },
  btnSubmit: {
    width: "100%", padding: "13px", borderRadius: "var(--r-sm)", border: `1px solid ${v("line-2")}`,
    background: "#ffffff",
    color: v("t1"), fontSize: 15, fontWeight: 700, cursor: "pointer",
    marginTop: 8, letterSpacing: -0.2,
    boxShadow: "0 1px 2px rgba(27,24,20,0.10), inset 0 1px 0 rgba(255,255,255,0.6)",
    fontFamily: "var(--font)",
  },
  // RELATÓRIO
  reportPage: {
    // Era `position: fixed; inset: 0; zIndex: 200`. No app solto isso cobria
    // a lista de boosts, que era o que se queria. Dentro do portal cobria
    // também a barra lateral e o topo: Resumo Mensal, Relatórios Gerais, Ids
    // Repetidos e o relatório de uma boost tomavam a tela inteira e o menu
    // sumia — parecia que a tela tinha aberto fora do portal. Agora ela ocupa
    // só a área de conteúdo, e quem rola é o portal.
    background: v("bg"),
    minHeight: "100%",
  },
  reportHeader: {
    background: v("surface"), borderBottom: `1px solid ${v("line")}`,
    padding: "18px 32px", display: "flex", alignItems: "center", gap: 16,
  },
  btnBack: {
    display: "flex", alignItems: "center", gap: 7,
    background: v("surface"), border: `1px solid ${v("line-2")}`,
    color: v("t2"), borderRadius: "var(--r-sm)", padding: "9px 15px", fontSize: 13,
    cursor: "pointer", fontFamily: "var(--font)", fontWeight: 600,
  },
  reportContent: { maxWidth: 980, margin: "0 auto", padding: "36px 24px" },
  reportTitle: { fontSize: 22, fontWeight: 800, letterSpacing: -0.4, marginBottom: 4, color: v("t1") },
  reportSub: { fontSize: 13.5, color: v("t3"), marginBottom: 28 },
  uploadZone: {
    border: `1.5px dashed ${v("line-2")}`, borderRadius: "var(--r-lg)",
    padding: "48px 32px", textAlign: "center", cursor: "pointer",
    transition: "all 0.15s", marginBottom: 28,
    background: v("surface"),
  },
  uploadTitle: { fontSize: 15, fontWeight: 700, color: v("t1"), marginBottom: 6 },
  uploadSub: { fontSize: 13, color: v("t3") },
  // KPI compactos — ícone no canto, número grande, contexto pequeno embaixo (estilo shadcn-admin)
  statsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14, marginBottom: 28 },
  statCard: {
    background: v("surface"), border: `1px solid ${v("line")}`, borderRadius: "var(--r-lg)",
    padding: "18px 20px", boxShadow: "var(--shadow)", position: "relative",
  },
  statCardTop: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 },
  statIconWrap: (color) => ({
    width: 30, height: 30, borderRadius: 9, flexShrink: 0,
    background: `${color}1F`, color,
    display: "flex", alignItems: "center", justifyContent: "center",
  }),
  statLabel: { fontFamily: "var(--mono)", fontSize: 10, color: v("t3"), textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 500 },
  statValue: { fontFamily: "var(--mono)", fontSize: 22, fontWeight: 800, letterSpacing: "-0.03em", color: v("t1"), lineHeight: 1 },
  statSub: { fontSize: 11.5, color: v("t3"), marginTop: 7 },
  tableWrap: {
    background: v("surface"), border: `1px solid ${v("line")}`,
    borderRadius: "var(--r-lg)", overflow: "hidden", boxShadow: "var(--shadow)",
  },
  tableHeader: { padding: "16px 20px", borderBottom: `1px solid ${v("line")}`, fontSize: 13.5, fontWeight: 700, color: v("t1") },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 12.5 },
  th: { padding: "10px 18px", textAlign: "left", color: v("t3"), fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", borderBottom: `1px solid ${v("line")}`, fontWeight: 500 },
  td: { padding: "10px 18px", borderBottom: `1px solid ${v("line")}`, color: v("t2") },
  btnSecondary: {
    display: "flex", alignItems: "center", gap: 8,
    background: v("surface"), border: `1px solid ${v("line-2")}`,
    color: v("t1"), borderRadius: "var(--r-sm)", padding: "10px 18px", fontSize: 13.5,
    fontWeight: 600, cursor: "pointer", transition: "background .12s",
    fontFamily: "var(--font)",
  },
  reportBox: {
    marginTop: 14, padding: "14px 16px", borderRadius: "var(--r-md)",
    background: v("up-soft"), border: "1px solid transparent",
  },
  reportBoxTitle: {
    fontFamily: "var(--mono)", fontSize: 10, color: v("up"), textTransform: "uppercase",
    letterSpacing: "0.1em", fontWeight: 600, marginBottom: 12,
    display: "flex", alignItems: "center", gap: 7,
  },
  reportBoxGrid: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 },
  reportBoxItem: { display: "flex", flexDirection: "column", gap: 3 },
  reportBoxLabel: { fontFamily: "var(--mono)", fontSize: 9, color: v("t3"), textTransform: "uppercase", letterSpacing: "0.08em" },
  reportBoxValue: { fontFamily: "var(--mono)", fontSize: 14, fontWeight: 700, color: v("t1") },
  barRow: { marginBottom: 14 },
  barTrack: { height: 8, borderRadius: 6, background: v("surface-2"), overflow: "hidden", border: `1px solid ${v("line")}` },
  btnSaveReport: {
    display: "flex", alignItems: "center", gap: 8,
    background: "#ffffff", border: `1px solid ${v("line-2")}`,
    color: v("t1"), borderRadius: "var(--r-sm)",
    padding: "10px 18px", fontSize: 13.5, fontWeight: 600,
    cursor: "pointer", marginBottom: 20,
    boxShadow: "0 1px 2px rgba(27,24,20,0.10), inset 0 1px 0 rgba(255,255,255,0.6)",
    fontFamily: "var(--font)",
  },
};
