import { useRef, useState } from 'react'

// Área de arrastar-e-soltar compartilhada pelas ferramentas nativas. Quem usa
// cuida de ler o arquivo; aqui só existe a interação (arrastar, clicar,
// limpar o input para o mesmo arquivo poder ser escolhido duas vezes).
export default function AreaUpload({
  onArquivo,
  carregando = false,
  erro = '',
  titulo = 'Solte o CSV ou XLSX aqui',
  formatos = '.csv,.txt,.xlsx,.xls',
  dica = 'ou clique para escolher — aceita .csv, .txt, .xlsx e .xls',
}) {
  const [arrastando, setArrastando] = useState(false)
  const inputRef = useRef(null)

  const entregar = (file) => {
    if (file) onArquivo(file)
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <>
      <div
        className={`pf-drop${arrastando ? ' arrastando' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setArrastando(true) }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => {
          e.preventDefault()
          setArrastando(false)
          entregar(e.dataTransfer.files?.[0])
        }}
        onClick={() => inputRef.current?.click()}
      >
        <strong>{carregando ? 'Lendo o arquivo…' : titulo}</strong>
        <span>{dica}</span>
        <input
          ref={inputRef}
          type="file"
          accept={formatos}
          hidden
          onChange={(e) => entregar(e.target.files?.[0])}
        />
      </div>
      {erro && <p className="pf-erro">{erro}</p>}
    </>
  )
}
