// A única parte do módulo que fala com o banco.
//
// Fica separada de `historico.js` de propósito: aquele arquivo é só função
// pura, e enquanto ele importava daqui não dava para rodá-lo fora do navegador
// (o cliente do Supabase lê `import.meta.env`, que só existe sob o Vite). Com a
// separação, a lógica de agregação roda em qualquer script de conferência.
import { rest } from '../../../lib/supabaseRest.js'

// Teto da consulta. Um ano e pouco de dias importados; além disso o mercado já
// mudou o suficiente para a mediana não descrever mais o presente.
export const DIAS = 400

/** Os dias importados em boost_days, do mais recente para o mais antigo. */
export const buscarDias = () =>
  rest(`boost_days?select=date,boosts&order=date.desc&limit=${DIAS}`)
