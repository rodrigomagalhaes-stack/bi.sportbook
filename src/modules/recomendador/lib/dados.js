// A única parte do módulo que fala com o banco.
//
// Fica separada de `historico.js` e `comparacao.js` de propósito: aqueles são
// só função pura, e enquanto importavam daqui não dava para rodá-los fora do
// navegador (o cliente do Supabase lê `import.meta.env`, que só existe sob o
// Vite). Com a separação, a lógica de agregação roda em qualquer script de
// conferência.
import { rest, usuarioAtual } from '../../../lib/supabaseRest.js'

// Teto da consulta de histórico. Um ano e pouco de dias importados; além disso
// o mercado já mudou o suficiente para a mediana não descrever mais o presente.
export const DIAS = 400

/** Os dias importados em boost_days, do mais recente para o mais antigo. */
export const buscarDias = () =>
  rest(`boost_days?select=date,boosts&order=date.desc&limit=${DIAS}`)

/** As dicas já marcadas, da mais recente para a mais antiga. */
export const buscarDicas = () =>
  rest('boost_dicas?select=*&order=marcado_em.desc&limit=500')

/**
 * Grava a previsão de uma dica, congelada como a tela a mostrava.
 *
 * `resolution=merge-duplicates` faz a segunda marcação da mesma seleção
 * atualizar a linha em vez de estourar no índice único. O `on_conflict` na URL
 * é obrigatório: sem ele o PostgREST assume a chave primária como alvo do
 * conflito, o índice de (event_id, mercado, selecao) não é consultado e a
 * segunda marcação falha com violação de unicidade.
 */
export const salvarDica = async (dica) =>
  rest('boost_dicas?on_conflict=event_id,mercado,selecao', {
    method: 'POST',
    body: { ...dica, marcado_por: await usuarioAtual() },
    headers: { Prefer: 'return=representation,resolution=merge-duplicates' },
  })

/** Desmarca uma dica. */
export const apagarDica = (id) =>
  rest(`boost_dicas?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' })
