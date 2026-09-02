// Ícones da navegação, em SVG inline — um arquivo só de componente para o
// Fast Refresh continuar funcionando (ver eslint react-refresh).
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
    casa: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5.5 9.5V20h13V9.5" /></>,
    bola: <><circle cx="12" cy="12" r="9" /><path d="m12 7 4.2 3-1.6 5h-5.2L7.8 10z" /></>,
    raio: <path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12z" />,
    trofeu: <><path d="M7 4h10v5a5 5 0 0 1-10 0z" /><path d="M7 5H4v2a3 3 0 0 0 3 3M17 5h3v2a3 3 0 0 1-3 3" /><path d="M12 14v4M9 21h6" /></>,
    planilha: <><rect x="3.5" y="4" width="17" height="16" rx="2" /><path d="M3.5 9.5h17M9.5 9.5V20M15 9.5V20" /></>,
    sair: <><path d="M15 17v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v2" /><path d="M20 12H9m11 0-3.5-3.5M20 12l-3.5 3.5" /></>,
    lupa: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></>,
    seta: <path d="m9 5 7 7-7 7" />,
    externo: <><path d="M14 4h6v6" /><path d="M20 4 11 13" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></>,
  }
  return <svg {...comum}>{caminhos[nome] ?? caminhos.bola}</svg>
}
