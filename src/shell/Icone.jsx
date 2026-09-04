// Ícones do portal, em SVG inline traçado (viewBox 24, stroke 1.8, pontas
// redondas) — um arquivo só de componente para o Fast Refresh continuar
// funcionando (ver eslint react-refresh).
//
// Cada ferramenta tem o seu: é o que sustenta a barra lateral recolhida, que
// antes mostrava só bolinhas iguais e não dizia qual item era qual.
export default function Icone({ nome, size = 17 }) {
  const comum = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  }
  const caminhos = {
    // grupos
    casa: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5.5 9.5V20h13V9.5" /></>,
    bola: <><circle cx="12" cy="12" r="9" /><path d="m12 7 4.2 3-1.6 5h-5.2L7.8 10z" /></>,
    raio: <path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12z" />,
    trofeu: <><path d="M7 4h10v5a5 5 0 0 1-10 0z" /><path d="M7 5H4v2a3 3 0 0 0 3 3M17 5h3v2a3 3 0 0 1-3 3" /><path d="M12 14v4M9 21h6" /></>,
    planilha: <><rect x="3.5" y="4" width="17" height="16" rx="2" /><path d="M3.5 9.5h17M9.5 9.5V20M15 9.5V20" /></>,

    // ferramentas
    grade: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.6" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.6" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.6" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.6" /></>,
    colunas: <><path d="M4 20V11M10 20V4M16 20v-6M22 20H2" /></>,
    calculadora: <><rect x="4.5" y="2.5" width="15" height="19" rx="2.5" /><path d="M8 6.5h8" /><path d="M8.5 11h.01M12 11h.01M15.5 11h.01M8.5 14.5h.01M12 14.5h.01M15.5 14.5h.01M8.5 18h.01M12 18h.01M15.5 18h.01" /></>,
    pulso: <><path d="M2.5 12h4l2.5-6.5 4 13L15.5 12h6" /></>,
    calendario: <><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 10h17M8.5 3v4M15.5 3v4" /></>,
    documento: <><path d="M13.5 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5z" /><path d="M13.5 3v5.5H19" /><path d="M8.5 13h7M8.5 16.5h4.5" /></>,
    copias: <><rect x="8.5" y="8.5" width="12" height="12" rx="2.2" /><path d="M15.5 5.5a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2" /></>,
    lista: <><path d="M9 6.5h11M9 12h11M9 17.5h11" /><path d="M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" /></>,
    ranking: <><path d="M3.5 20.5h17" /><rect x="4.5" y="12" width="4.5" height="8.5" rx="1.2" /><rect x="10" y="7" width="4.5" height="13.5" rx="1.2" /><rect x="15.5" y="15" width="4.5" height="5.5" rx="1.2" /></>,
    etiqueta: <><path d="M3.5 11.2V5a1.5 1.5 0 0 1 1.5-1.5h6.2a2 2 0 0 1 1.4.6l7.3 7.3a2 2 0 0 1 0 2.8l-6.2 6.2a2 2 0 0 1-2.8 0L4.1 13.1a2 2 0 0 1-.6-1.4Z" /><path d="M8 8h.01" /></>,
    presente: <><rect x="3" y="8" width="18" height="4.5" rx="1.5" /><path d="M4.5 12.5V19a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-6.5M12 8v13" /><path d="M12 8S10.5 3.5 8 3.5a2.2 2.2 0 0 0 0 4.5M12 8s1.5-4.5 4-4.5a2.2 2.2 0 0 1 0 4.5" /></>,

    // controles
    sair: <><path d="M15 17v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v2" /><path d="M20 12H9m11 0-3.5-3.5M20 12l-3.5 3.5" /></>,
    lupa: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></>,
    seta: <path d="m9 5 7 7-7 7" />,
    externo: <><path d="M14 4h6v6" /><path d="M20 4 11 13" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></>,
    sol: <><circle cx="12" cy="12" r="4.5" /><path d="M12 2.5v3M12 18.5v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2.5 12h3M18.5 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></>,
    lua: <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z" />,
  }
  return <svg {...comum}>{caminhos[nome] ?? caminhos.grade}</svg>
}
