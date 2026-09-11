// A única parte do módulo que fala com o banco. O resto (`situacao.js`,
// `filtros.js`, `base.js`) é função pura e roda em qualquer lugar — inclusive
// nos testes, que não sobem navegador nenhum.
import { rest, usuarioAtual } from '../../../lib/supabaseRest.js'
import { supabase } from '../../../lib/supabase.js'
import { valorDaBase } from './base.js'

const BUCKET = 'protegidos-bases'

// Teto da consulta. Bilhete protegido é evento de campanha, não linha de
// transação: alguns por dia. Se um dia isto encostar no teto, a tela passa a
// filtrar por período no servidor em vez de trazer tudo.
const LIMITE = 2000

/**
 * Os bilhetes com as bases já embutidas.
 *
 * O PostgREST traz a relação junto (`protegidos_bases(*)`), então os quadros
 * somam o que foi pago sem uma segunda consulta. As LINHAS das bases ficam de
 * fora de propósito: são milhares por bilhete, e nenhuma tela precisa delas —
 * o cruzamento de IDs roda no banco, em `protegidos_ids_repetidos`.
 */
export async function buscarBilhetes() {
  const linhas = await rest(
    `protegidos_bilhetes?select=*,protegidos_bases(*)&order=confronto_fim.desc&limit=${LIMITE}`,
  )
  return (linhas ?? []).map(({ protegidos_bases: bases, ...b }) => ({ ...b, bases: bases ?? [] }))
}

/**
 * Os jogadores de um bilhete: uma amostra, ou os que casam com a busca.
 *
 * A busca vai ao BANCO, e não filtra o que já está na tela. Uma base popular
 * tem milhares de linhas e a tela mostra as primeiras; procurar só dentro
 * dessas responderia "não achei" para alguém que está na base — a pior resposta
 * possível para quem está conferindo se pagou uma pessoa específica.
 *
 * O termo é limpo antes de virar filtro: vírgula e parêntese são gramática do
 * PostgREST, e um deles solto no meio do texto muda o sentido da consulta.
 */
export function buscarJogadores(bilheteId, termo = '', limite = 200) {
  const limpo = String(termo).trim().replace(/[^\w.@-]/g, '').slice(0, 60)
  const busca = limpo ? `&usuario=ilike.*${encodeURIComponent(limpo)}*` : ''
  return rest(
    `protegidos_base_linhas?select=usuario,valor,linha` +
      `&bilhete_id=eq.${encodeURIComponent(bilheteId)}${busca}&order=linha&limit=${limite}`,
  )
}

/** As linhas de um bilhete compartilhado, pelo código do link. */
export async function buscarLinhas(codigo) {
  const res = await fetch(`/api/protegidos/bilhete?codigo=${encodeURIComponent(codigo)}`)
  const dados = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(dados.erro || `erro ${res.status} ao ler o bilhete`)
  return dados
}

/**
 * Guarda as linhas lidas no próprio bilhete.
 *
 * Só onde ainda não há nada guardado (`bilhete=is.null`): a primeira leitura é
 * a que vale, e duas pessoas abrindo o mesmo painel não trocam uma pela outra.
 */
export const salvarLinhas = (id, bilhete) =>
  rest(`protegidos_bilhetes?id=eq.${encodeURIComponent(id)}&bilhete=is.null`, {
    method: 'PATCH',
    body: { bilhete },
  })

/** O cruzamento de IDs no período, agregado pelo banco. */
export const buscarIdsRepetidos = (de, ate) =>
  rest('rpc/protegidos_ids_repetidos', { method: 'POST', body: { de, ate } })

export const marcarPago = async (id) =>
  rest(`protegidos_bilhetes?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { status: 'pago', pago_em: new Date().toISOString(), pago_por: await usuarioAtual() },
  })

/**
 * Volta o bilhete para a fila.
 *
 * As bases anexadas NÃO são apagadas junto: se o pagamento foi marcado por
 * engano, o arquivo que já subiu continua sendo o que foi enviado, e apagá-lo
 * escondendo o erro é pior do que deixá-lo visível.
 *
 * Isso quer dizer que reabrir e pagar de novo com o MESMO arquivo esbarra no
 * índice único de (bilhete, nome do arquivo) — o painel traduz esse erro. Não
 * há tela para remover uma base: `apagarBase` existe só para o desfazer de
 * `salvarBase`. Se um dia precisar, é um botão, não uma reescrita.
 */
export const reabrir = (id) =>
  rest(`protegidos_bilhetes?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { status: 'a_pagar', pago_em: null, pago_por: null },
  })

/**
 * Aprova uma solicitação: ela sai de Solicitações e entra em A pagar.
 *
 * O filtro de status faz a mudança valer só para o que ainda está pendente.
 * Duas pessoas com a mesma solicitação aberta não se atropelam: a segunda não
 * desfaz a recusa que a primeira acabou de gravar. Sem o filtro o PATCH não
 * daria erro nenhum, e a decisão da primeira sumiria calada.
 */
export async function aprovar(id) {
  const linhas = await rest(`protegidos_bilhetes?id=eq.${encodeURIComponent(id)}&status=eq.pendente`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: { status: 'a_pagar', aprovado_em: new Date().toISOString(), aprovado_por: await usuarioAtual() },
  })
  if (!linhas?.length) {
    throw new Error('Esta solicitação já foi analisada por outra pessoa. Feche e atualize a tela.')
  }
}

/**
 * Recusa um bilhete — pendente, na análise, ou já aprovado, na fila.
 *
 * Nos bilhetes que vieram de uma conta, o motivo NÃO é anotação interna: o
 * tipster o lê em Minhas solicitações. O filtro de status é o mesmo cuidado de
 * `aprovar`: um painel aberto há tempo não recusa um bilhete que outra pessoa
 * acabou de pagar.
 */
export async function recusar(id, motivo) {
  const linhas = await rest(
    `protegidos_bilhetes?id=eq.${encodeURIComponent(id)}&status=in.(pendente,a_pagar)`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: {
        status: 'recusado',
        motivo_recusa: motivo?.trim() || null,
        recusado_em: new Date().toISOString(),
        recusado_por: await usuarioAtual(),
      },
    },
  )
  if (!linhas?.length) {
    throw new Error('Este bilhete mudou de situação enquanto estava aberto. Feche e atualize a tela.')
  }
}

export const apagarBase = (id) =>
  rest(`protegidos_bases?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' })

/**
 * Grava uma base paga: o arquivo original, o registro e as linhas.
 *
 * NÃO É TRANSAÇÃO, e não tem como ser: são três chamadas HTTP distintas. O que
 * dá para garantir é que não sobre meia base gravada — se as linhas falharem no
 * meio, o registro da base é apagado, e a exclusão em cascata leva junto o que
 * já tinha entrado. Sem isso, uma queda de rede deixaria um valor total gravado
 * com metade das linhas por trás dele, e o número passaria despercebido porque
 * está certo na tabela e errado na realidade.
 */
export async function salvarBase(bilheteId, { arquivo, colUsuario, stake, resumo, linhas }) {
  const caminho = await enviarArquivo(bilheteId, arquivo)
  const valorTotal = valorDaBase(stake, resumo.jogadores)

  const [base] = await rest('protegidos_bases', {
    method: 'POST',
    body: {
      bilhete_id: bilheteId,
      arquivo_nome: arquivo.name,
      arquivo_caminho: caminho,
      linhas: resumo.jogadores,
      usuarios: resumo.jogadores,
      valor_total: valorTotal,
      col_usuario: colUsuario,
      enviado_por: await usuarioAtual(),
    },
    headers: { Prefer: 'return=representation' },
  })

  try {
    // Em lotes: um POST com 40 mil linhas estoura o limite de corpo da
    // requisição muito antes de o banco reclamar de qualquer coisa.
    const LOTE = 500
    for (let i = 0; i < linhas.length; i += LOTE) {
      await rest('protegidos_base_linhas', {
        method: 'POST',
        // O valor de cada linha é a stake: num bingo protegido cada seguidor
        // recebe de volta o que apostou, e o arquivo diz quem, não quanto.
        body: linhas.slice(i, i + LOTE).map((l) => ({
          base_id: base.id,
          bilhete_id: bilheteId,
          usuario: l.usuario,
          valor: stake,
          linha: l.linha,
        })),
        headers: { Prefer: 'return=minimal' },
      })
    }
  } catch (e) {
    // O arquivo sai junto com a linha da base. Sem isto, cada tentativa que
    // falha deixa um CSV no bucket que nenhuma linha referencia — e a pessoa
    // tenta de novo, sobe outra cópia, e o bucket acumula bases de pagamento
    // com id de jogador dentro que ninguém sabe mais de onde vieram.
    await apagarBase(base.id).catch(() => {})
    await removerArquivo(caminho)
    throw e
  }

  return base
}

/**
 * Sobe o CSV para o bucket privado.
 *
 * O envio pode falhar sem o resto falhar junto: as linhas já estão na tabela e
 * são elas que alimentam todo número da tela. O arquivo é a via de conferência,
 * então a falta dele vira aviso, e não motivo para descartar um pagamento que
 * já foi conferido. `arquivo_caminho` nulo é exatamente esse caso.
 */
async function enviarArquivo(bilheteId, arquivo) {
  if (!supabase || !arquivo) return null
  const caminho = `${bilheteId}/${Date.now()}-${arquivo.name.replace(/[^\w.-]+/g, '_')}`
  const { error } = await supabase.storage.from(BUCKET).upload(caminho, arquivo, {
    contentType: arquivo.type || 'text/csv',
    upsert: false,
  })
  if (error) {
    console.warn('base paga: o arquivo não subiu para o Storage —', error.message)
    return null
  }
  return caminho
}

/** Desfaz o envio. Falhar aqui não pode derrubar o erro original. */
async function removerArquivo(caminho) {
  if (!supabase || !caminho) return
  const { error } = await supabase.storage.from(BUCKET).remove([caminho])
  if (error) console.warn('base paga: o arquivo ficou no Storage —', error.message)
}

/** Link temporário para baixar o arquivo de uma base. */
export async function linkDaBase(caminho) {
  if (!supabase || !caminho) return null
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(caminho, 60)
  if (error) throw new Error('não consegui gerar o link do arquivo: ' + error.message)
  return data?.signedUrl ?? null
}
