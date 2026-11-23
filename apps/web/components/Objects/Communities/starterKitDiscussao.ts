/**
 * Configuração do StarterKit usada no editor de compor/editar discussões e na
 * leitura da discussão publicada. Uma fonte só, para o editor aceitar tudo o
 * que a leitura mostra: uma nota publicada do Caderno pode ter títulos de H1 a
 * H4 (e marca-texto e cor, que vêm de `extensoesConteudoCaderno`). Se o editor
 * aceitasse menos níveis, editar a nota apagaria esses títulos.
 */
export const NIVEIS_TITULO_DISCUSSAO = [1, 2, 3, 4] as const

export function opcoesStarterKitDiscussao() {
  return {
    // o Link é configurado à parte em cada lugar
    link: false as const,
    heading: { levels: [...NIVEIS_TITULO_DISCUSSAO] as (1 | 2 | 3 | 4)[] },
    bulletList: { HTMLAttributes: { class: 'discussion-bullet-list' } },
    orderedList: { HTMLAttributes: { class: 'discussion-ordered-list' } },
    codeBlock: { HTMLAttributes: { class: 'discussion-code-block' } },
    blockquote: { HTMLAttributes: { class: 'discussion-blockquote' } },
  }
}
