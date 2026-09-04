/* ─────────────────────────────────────────────────────────────────────────
   Claro/escuro das telas embutidas.

   Cada uma destas páginas roda dentro de um iframe: é outro documento, não
   enxerga o <html> do portal nem o React dele. O que os dois compartilham é
   a origem — e, por tabela, o localStorage. Daí o acordo:

   - na carga, a página lê a chave `eb-theme` e já nasce no tema certo (este
     script é síncrono e fica no <head>, antes do CSS pintar: sem isso, quem
     usa o escuro veria um flash branco a cada troca de ferramenta);
   - depois, o evento `storage` avisa. Ele dispara em todo documento de mesma
     origem *exceto* naquele que escreveu — que é justamente o portal. O
     iframe recebe a mudança sem precisar de postMessage.

   Aberta fora do portal, a página cai na preferência do sistema.
   ───────────────────────────────────────────────────────────────────────── */
;(function () {
  var CHAVE = 'eb-theme'

  function aplicar(tema) {
    document.documentElement.setAttribute('data-theme', tema === 'dark' ? 'dark' : 'light')
  }

  function salvo() {
    try {
      return localStorage.getItem(CHAVE)
    } catch (e) {
      return null
    }
  }

  function preferido() {
    try {
      return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    } catch (e) {
      return 'light'
    }
  }

  aplicar(salvo() || preferido())

  addEventListener('storage', function (e) {
    if (e.key === CHAVE) aplicar(e.newValue || preferido())
  })
})()
