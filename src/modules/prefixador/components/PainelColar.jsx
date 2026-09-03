import { useMemo, useState } from 'react'
import { extrairValores, processarLista } from '../lib/prefixar.js'
import { baixarCSV, baixarXLSX, copiar, nomeComData } from '../../../lib/exportar.js'
import Resumo from '../../../shell/Resumo.jsx'

// Listas de dezenas de milhares de ids são comuns; renderizar todas as linhas
// travaria a aba. A tabela é só conferência — o arquivo baixado vem completo.
const LIMITE_TABELA = 500

export default function PainelColar({ prefixo }) {
  const [texto, setTexto] = useState('')
  const [removerDuplicados, setRemoverDuplicados] = useState(true)
  const [aviso, setAviso] = useState('')

  const { linhas, resumo } = useMemo(
    () => processarLista(extrairValores(texto), { prefixo, removerDuplicados }),
    [texto, prefixo, removerDuplicados],
  )

  const listaPronta = linhas.map((l) => l.resultado).join('\n')
  const matriz = [['original', 'com_prefixo'], ...linhas.map((l) => [l.original, l.resultado])]
  const vazio = linhas.length === 0

  const avisar = (msg) => {
    setAviso(msg)
    setTimeout(() => setAviso(''), 2200)
  }

  return (
    <div className="pf-painel">
      <div className="pf-coluna">
        <div className="pf-bloco">
          <div className="pf-bloco-topo">
            <h3>Cole os números</h3>
            <span className="pf-hint">um por linha, ou separados por vírgula, ponto-e-vírgula ou tab</span>
          </div>

          <textarea
            className="pf-textarea"
            value={texto}
            spellCheck={false}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={'28435851\n28435852\n28435853'}
          />

          <div className="pf-acoes">
            <label className="pf-check">
              <input
                type="checkbox"
                checked={removerDuplicados}
                onChange={(e) => setRemoverDuplicados(e.target.checked)}
              />
              Remover duplicados
            </label>

            <div className="pf-acoes-dir">
              <button
                type="button"
                className="pf-btn"
                disabled={vazio}
                onClick={() => setTexto('')}
              >
                Limpar
              </button>
              <button
                type="button"
                className="pf-btn"
                disabled={vazio}
                onClick={async () => {
                  const ok = await copiar(listaPronta)
                  avisar(ok ? `${linhas.length} valores copiados` : 'não consegui copiar')
                }}
              >
                Copiar lista
              </button>
              <button
                type="button"
                className="pf-btn"
                disabled={vazio}
                onClick={() => baixarCSV(nomeComData('ids_prefixados', 'csv'), matriz)}
              >
                Baixar CSV
              </button>
              <button
                type="button"
                className="pf-btn primario"
                disabled={vazio}
                onClick={() => baixarXLSX(nomeComData('ids_prefixados', 'xlsx'), matriz)}
              >
                Baixar XLSX
              </button>
            </div>
          </div>

          {aviso && <p className="pf-aviso">{aviso}</p>}
        </div>
      </div>

      <div className="pf-coluna">
        <Resumo
          itens={[
            { label: 'colados', valor: resumo.entradas, sempre: true },
            { label: 'na saída', valor: resumo.saidas, sempre: true, tom: 'ok' },
            {
              label: removerDuplicados ? 'duplicados removidos' : 'duplicados',
              valor: resumo.duplicados,
              tom: 'alerta',
              dica: 'Valores que já tinham aparecido antes na lista.',
            },
            {
              label: 'já tinham prefixo',
              valor: resumo.jaPrefixados,
              dica: 'Ficaram como estavam — o prefixo não é aplicado duas vezes.',
            },
            {
              label: 'não numéricos',
              valor: resumo.naoNumericos,
              tom: 'erro',
              dica: 'Prefixados mesmo assim, mas vale conferir se não é lixo colado junto.',
            },
          ]}
        />

        <div className="pf-bloco pf-bloco-tabela">
          <div className="pf-bloco-topo">
            <h3>Resultado</h3>
            {linhas.length > LIMITE_TABELA && (
              <span className="pf-hint">
                mostrando as {LIMITE_TABELA} primeiras de {linhas.length.toLocaleString('pt-BR')} —
                o arquivo sai completo
              </span>
            )}
          </div>

          {vazio ? (
            <div className="pf-vazio">A tabela aparece assim que você colar os números.</div>
          ) : (
            <div className="pf-tabela-rolagem">
              <table className="pf-tabela">
                <thead>
                  <tr>
                    <th className="num">#</th>
                    <th>Original</th>
                    <th>Com prefixo</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.slice(0, LIMITE_TABELA).map((l) => (
                    <tr key={l.n}>
                      <td className="num">{l.n}</td>
                      <td className="mono">
                        {l.original}
                        {l.jaTinha && <span className="pf-tag">já tinha</span>}
                        {l.naoNumerico && <span className="pf-tag erro">não numérico</span>}
                      </td>
                      <td className="mono forte">{l.resultado}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
