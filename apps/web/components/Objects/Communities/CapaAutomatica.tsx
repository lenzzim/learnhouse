import React from 'react'

/**
 * Capa automática para espaços sem imagem (Discipulei, item 3.2): tipográfica,
 * em P&B, com o nome do espaço em serifa sobre uma textura sutil de linhas
 * (como papel pautado). Só CSS e os tokens do tema: nenhuma imagem externa,
 * funciona no escuro e no claro. O admin continua podendo enviar uma imagem,
 * que tem prioridade.
 */
export function CapaAutomatica({
  nome,
  variante = 'capa',
  className = '',
}: {
  nome: string
  /** `capa`: 16:9 com o nome; `icone`: quadradinho com a inicial. */
  variante?: 'capa' | 'icone'
  className?: string
}) {
  const textura: React.CSSProperties = {
    backgroundColor: 'var(--surface)',
    backgroundImage:
      'repeating-linear-gradient(0deg, transparent 0, transparent 13px, var(--line) 13px, var(--line) 14px),' +
      'radial-gradient(circle at 20% 15%, color-mix(in srgb, var(--text) 6%, transparent), transparent 60%)',
  }
  const serifa: React.CSSProperties = { fontFamily: "var(--font-serif), Georgia, 'Times New Roman', serif" }

  if (variante === 'icone') {
    const inicial = (nome.trim()[0] || '·').toUpperCase()
    return (
      <div
        aria-hidden="true"
        className={`flex items-center justify-center overflow-hidden text-[var(--text)] ${className}`}
        style={textura}
      >
        <span className="text-lg leading-none" style={serifa}>
          {inicial}
        </span>
      </div>
    )
  }

  return (
    <div
      aria-hidden="true"
      className={`relative flex h-full w-full items-center justify-center overflow-hidden px-6 text-center ${className}`}
      style={textura}
    >
      <span className="absolute inset-x-6 top-4 h-px bg-[var(--line-strong)]" />
      <span
        className="line-clamp-3 text-2xl leading-tight text-[var(--text)] sm:text-[1.65rem]"
        style={{ ...serifa, textWrap: 'balance' as any }}
        dir="auto"
      >
        {nome}
      </span>
      <span className="absolute inset-x-6 bottom-4 h-px bg-[var(--line-strong)]" />
    </div>
  )
}

export default CapaAutomatica
