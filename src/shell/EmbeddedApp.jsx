// Páginas que eram projetos HTML independentes continuam sendo servidas como
// arquivos estáticos (public/apps/**) e aparecem aqui dentro de um iframe.
// É de propósito: são monolitos de JS puro que já funcionam; reescrevê-los em
// React arriscaria a lógica sem mudar o que o usuário vê. Tudo acontece dentro
// da moldura — nenhuma delas leva o usuário para fora do portal.
export default function EmbeddedApp({ src, titulo }) {
  // O `?v=` muda a cada build. Sem ele, o navegador pode continuar exibindo a
  // versão anterior da página embutida por tempo indeterminado depois de um
  // deploy, e a pessoa vê um comportamento antigo sem nenhuma pista do porquê.
  const url = `${src}?v=${import.meta.env.VITE_BUILD_ID}`

  return (
    <div className="pb-embed">
      <iframe key={url} src={url} title={titulo} />
    </div>
  )
}
