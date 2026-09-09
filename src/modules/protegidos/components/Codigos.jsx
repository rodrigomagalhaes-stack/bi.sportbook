/**
 * Os códigos de pagamento por faixa de stake.
 *
 * Ficam à vista, e não numa anotação ao lado do monitor, porque quem paga
 * precisa deles a cada bilhete — e código procurado fora da tela é onde nasce o
 * pagamento lançado na faixa errada.
 *
 * A lista é fixa no código de propósito: são quatro valores que mudam de raro
 * em raro, e uma tabela no banco para isso pediria uma tela de cadastro, uma
 * migração e um lugar a mais para estar desatualizado. Quando mudar, muda aqui.
 */
const CODIGOS = [
  { stake: 20, codigo: '83211' },
  { stake: 30, codigo: '83213' },
  { stake: 40, codigo: '84725' },
  { stake: 50, codigo: '83207' },
]

const moeda = (n) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function Codigos() {
  return (
    <div className="pr-codigos">
      <span className="pr-codigos-rotulo">Códigos de pagamento</span>
      {CODIGOS.map((c) => (
        <span className="pr-codigo" key={c.codigo}>
          {moeda(c.stake)}
          <b>{c.codigo}</b>
        </span>
      ))}
    </div>
  )
}
