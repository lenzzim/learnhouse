/**
 * Menu de comandos "/" do Caderno (estilo Notion): a lista de comandos e a
 * busca sem acento. Os rótulos vêm do i18n (caderno_editor.cmd.<id>); aqui
 * ficam só ids, grupos, atalhos de Markdown e palavras de busca (pt, en, es).
 *
 * Módulo PURO e SEM IMPORTS: roda no Node (lib/caderno/comandos.test.mjs).
 */

export type GrupoComando = 'basico' | 'blocos' | 'midia' | 'caderno' | 'ajuda'

export type IdComando =
  | 'texto'
  | 'titulo1'
  | 'titulo2'
  | 'titulo3'
  | 'titulo4'
  | 'lista'
  | 'lista_numerada'
  | 'tarefas'
  | 'recuo_mais'
  | 'recuo_menos'
  | 'marca_texto'
  | 'cor_texto'
  | 'citacao'
  | 'destaque'
  | 'divisor'
  | 'codigo'
  | 'tabela'
  | 'imagem'
  | 'video'
  | 'versiculo'
  | 'ligacao'
  | 'tag'
  | 'data_hoje'
  | 'modelo'
  | 'propriedade'
  | 'guia'

export interface Comando {
  id: IdComando
  grupo: GrupoComando
  /** Atalho de digitação equivalente (mostrado à direita no menu). */
  atalho?: string
  /** Outras palavras que encontram o comando (sem acento, minúsculas). */
  palavras: string[]
}

export const COMANDOS: Comando[] = [
  { id: 'texto', grupo: 'basico', palavras: ['paragrafo', 'texto', 'text', 'paragraph', 'parrafo', 'normal'] },
  { id: 'titulo1', grupo: 'basico', atalho: '#', palavras: ['titulo', 'h1', 'heading', 'cabecalho', 'encabezado'] },
  { id: 'titulo2', grupo: 'basico', atalho: '##', palavras: ['titulo', 'h2', 'heading', 'subtitulo', 'encabezado'] },
  { id: 'titulo3', grupo: 'basico', atalho: '###', palavras: ['titulo', 'h3', 'heading', 'encabezado'] },
  { id: 'titulo4', grupo: 'basico', atalho: '####', palavras: ['titulo', 'h4', 'heading', 'encabezado', 'subsecao'] },
  { id: 'lista', grupo: 'basico', atalho: '-', palavras: ['lista', 'marcadores', 'bullet', 'list', 'topicos', 'vinetas'] },
  { id: 'lista_numerada', grupo: 'basico', atalho: '1.', palavras: ['lista', 'numerada', 'numbered', 'ordered', 'ordenada', 'numeros'] },
  { id: 'tarefas', grupo: 'basico', atalho: '[ ]', palavras: ['tarefa', 'tarefas', 'checkbox', 'todo', 'task', 'checklist', 'caixa', 'tareas', 'pendente'] },
  { id: 'recuo_mais', grupo: 'basico', atalho: 'Tab', palavras: ['recuo', 'recuar', 'aumentar', 'indent', 'sangria', 'aninhar', 'subitem', 'tab'] },
  { id: 'recuo_menos', grupo: 'basico', atalho: '⇧Tab', palavras: ['recuo', 'diminuir', 'outdent', 'desrecuar', 'sangria', 'reducir'] },
  { id: 'marca_texto', grupo: 'basico', atalho: '==', palavras: ['marca', 'marca-texto', 'marcatexto', 'destacar', 'grifar', 'highlight', 'resaltar', 'realce', 'fundo'] },
  { id: 'cor_texto', grupo: 'basico', palavras: ['cor', 'colorir', 'color', 'colour', 'texto', 'pintar', 'verde', 'azul', 'rosa', 'grafite'] },
  { id: 'citacao', grupo: 'blocos', atalho: '>', palavras: ['citacao', 'quote', 'blockquote', 'cita', 'citar'] },
  { id: 'destaque', grupo: 'blocos', atalho: '!>', palavras: ['destaque', 'callout', 'aviso', 'nota', 'caixa', 'importante', 'destacado'] },
  { id: 'divisor', grupo: 'blocos', atalho: '---', palavras: ['divisor', 'linha', 'separador', 'divider', 'hr', 'rule'] },
  { id: 'codigo', grupo: 'blocos', atalho: '```', palavras: ['codigo', 'code', 'bloco', 'monoespacado'] },
  { id: 'tabela', grupo: 'blocos', palavras: ['tabela', 'table', 'grade', 'tabla', 'colunas'] },
  { id: 'imagem', grupo: 'midia', palavras: ['imagem', 'foto', 'image', 'picture', 'imagen', 'figura', 'enviar', 'upload'] },
  { id: 'video', grupo: 'midia', palavras: ['video', 'youtube', 'vimeo', 'embed'] },
  { id: 'versiculo', grupo: 'caderno', palavras: ['versiculo', 'biblia', 'verse', 'bible', 'passagem', 'referencia', 'escritura'] },
  { id: 'ligacao', grupo: 'caderno', atalho: '[[', palavras: ['ligacao', 'link', 'nota', 'wiki', 'backlink', 'enlace', 'vinculo'] },
  { id: 'tag', grupo: 'caderno', atalho: '#tag', palavras: ['tag', 'etiqueta', 'marcador', 'hashtag'] },
  { id: 'data_hoje', grupo: 'caderno', palavras: ['data', 'hoje', 'date', 'today', 'fecha', 'hoy', 'dia'] },
  { id: 'modelo', grupo: 'caderno', palavras: ['modelo', 'template', 'plantilla', 'estrutura'] },
  { id: 'propriedade', grupo: 'caderno', palavras: ['propriedade', 'propriedades', 'metadado', 'property', 'properties', 'tipo', 'livro', 'propiedad', 'frontmatter'] },
  { id: 'guia', grupo: 'ajuda', palavras: ['guia', 'ajuda', 'markdown', 'help', 'guide', 'atalhos', 'ayuda'] },
]

/** Minúsculas, sem acento e sem espaços extras ("Título 1" → "titulo 1"). */
export function normalizar(texto: string): string {
  return (texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Comandos que casam com a consulta, do melhor para o pior:
 * 1) rótulo começa com a consulta; 2) uma palavra do rótulo começa com ela;
 * 3) uma palavra de busca começa com ela; 4) a consulta aparece no meio do
 * rótulo. Consulta vazia devolve todos na ordem original. Empate mantém a
 * ordem da lista (estável).
 */
export function filtrarComandos<T extends Comando>(lista: T[], consulta: string, rotulo: (c: T) => string): T[] {
  const q = normalizar(consulta)
  if (!q) return lista.slice()
  const pontuados: { c: T; nota: number; i: number }[] = []
  lista.forEach((c, i) => {
    const r = normalizar(rotulo(c))
    let nota = 0
    if (r.startsWith(q)) nota = 4
    else if (r.split(/[\s/()-]+/).some((p) => p.startsWith(q))) nota = 3
    else if (c.palavras.some((p) => normalizar(p).startsWith(q)) || normalizar(c.id).startsWith(q)) nota = 2
    else if (r.includes(q) || (c.atalho && q === normalizar(c.atalho))) nota = 1
    if (nota) pontuados.push({ c, nota, i })
  })
  pontuados.sort((a, b) => b.nota - a.nota || a.i - b.i)
  return pontuados.map((p) => p.c)
}
