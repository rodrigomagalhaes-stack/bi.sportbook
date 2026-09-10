// Atalho de build para o `require('./cpexcel.js')` que existe dentro do
// xlsx-js-style. Ele está sob um guarda `typeof require !== 'undefined'` que o
// bundler considera verdadeiro, e aí as ~470 KB de tabelas de codepage entram
// no pacote. O `xlsx` original que o projeto usava antes (build ESM) nunca as
// trazia: no SheetJS o codepage é opcional e só entra em cena se alguém chamar
// `set_cptable`. Devolver `undefined` aqui é exatamente o estado que a build
// ESM tinha — nada muda de comportamento, só o tamanho.
//
// O efeito prático de não ter as tabelas: um .xls **antigo** (BIFF, anterior ao
// xlsx) gravado em codepage exótico pode trazer acento errado. Arquivo .xlsx é
// sempre UTF-8 e não passa por aqui.
module.exports = undefined
