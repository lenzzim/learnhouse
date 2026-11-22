import { TableKit } from '@tiptap/extension-table'
import { CadernoImagem, Destaque, TarefaItem, TarefaLista, VideoVimeo, VideoYoutube } from './nos'

/**
 * Nós de conteúdo do Caderno além do StarterKit. Usados no editor da nota,
 * na leitura por link (/n/<token>) e na discussion publicada, para o mesmo
 * documento aparecer igual nos três lugares. `carregar` decide com qual
 * credencial a imagem privada é buscada em cada contexto.
 */
export function extensoesConteudoCaderno({
  carregar,
  rotuloErroImagem,
  rotuloCaixaTarefa,
  colarImagensHtml = true,
}: {
  carregar: ((anexo: string) => Promise<string>) | null
  rotuloErroImagem: string
  rotuloCaixaTarefa: string
  /** Falso no editor de discussões: imagem colada da web não entra. */
  colarImagensHtml?: boolean
}) {
  return [
    CadernoImagem.configure({ carregar, rotuloErro: rotuloErroImagem, colarHtml: colarImagensHtml }),
    TarefaLista,
    TarefaItem.configure({ rotuloCaixa: rotuloCaixaTarefa }),
    Destaque,
    VideoYoutube,
    VideoVimeo,
    TableKit.configure({ table: { resizable: false, HTMLAttributes: { class: 'caderno-tabela' } } }),
  ]
}
