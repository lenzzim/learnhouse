// Editor do Caderno de verdade (TipTap + happy-dom), sem navegador:
//  - cada exemplo do Guia de Markdown é DIGITADO no editor e conferido;
//  - atalhos de teclado do guia;
//  - comandos do menu "/" e o botão que abre o menu;
//  - nós próprios (imagem, tarefas, destaque, vídeos) e sua segurança;
//  - importação de .md (frontmatter, tarefas, imagem, destaque, tabela, vídeo).
// Rodar (a partir de apps/web):
//   node --import ./lib/caderno/testes/registrar.mjs --test components/Caderno/editor/editor.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Window } from 'happy-dom'

const janela = new Window({ url: 'http://localhost/' })
for (const nome of ['window', 'document', 'navigator', 'Node', 'HTMLElement', 'Element', 'MutationObserver', 'getComputedStyle', 'DOMParser', 'Text', 'Range', 'Selection', 'KeyboardEvent', 'Event', 'ClipboardEvent', 'DragEvent']) {
  if (!(nome in globalThis) || nome === 'navigator') {
    try {
      Object.defineProperty(globalThis, nome, { value: janela[nome], configurable: true, writable: true })
    } catch {
      /* algumas globais do Node não podem ser trocadas */
    }
  }
}
globalThis.requestAnimationFrame = (f) => setTimeout(f, 0)
globalThis.cancelAnimationFrame = (id) => clearTimeout(id)

const { Editor } = await import('@tiptap/core')
const { default: StarterKit } = await import('@tiptap/starter-kit')
const { TableKit } = await import('@tiptap/extension-table')
const nos = await import('./nos.ts')
const marcas = await import('./marcas.ts')
const barra = await import('./barraComandos.ts')
const { GUIA, ATALHOS_TECLADO } = await import('../../../lib/caderno/guia.ts')
const { COMANDOS, filtrarComandos } = await import('../../../lib/caderno/comandos.ts')
const { markdownParaDocPublico } = await import('../../../lib/caderno/importar.ts')
const { lerFrontmatter } = await import('../../../lib/caderno/propriedades.ts')

const ROTULOS = {
  texto: 'Texto', titulo1: 'Título 1', titulo2: 'Título 2', titulo3: 'Título 3', titulo4: 'Título 4', lista: 'Lista',
  marca_texto: 'Marca-texto', cor_texto: 'Cor do texto', lista_numerada: 'Lista numerada', tarefas: 'Lista de tarefas', citacao: 'Citação', destaque: 'Destaque',
  divisor: 'Divisor', codigo: 'Código', tabela: 'Tabela', imagem: 'Imagem', video: 'Vídeo', versiculo: 'Versículo',
  ligacao: 'Ligação', tag: 'Tag', data_hoje: 'Data de hoje', modelo: 'Modelo', propriedade: 'Propriedade',
  guia: 'Guia de Markdown',
}

function novoEditor({ carregar = null, editable = true, content = '' } = {}) {
  const estado = { menu: null, pedidos: [] }
  const ed = new Editor({
    element: document.createElement('div'),
    editable,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3, 4] } }),
      TableKit.configure({ table: { resizable: false } }),
      nos.CadernoImagem.configure({ carregar }),
      nos.TarefaLista,
      nos.TarefaItem,
      nos.Destaque,
      nos.VideoYoutube,
      nos.VideoVimeo,
      marcas.MarcaTexto,
      marcas.CorTexto,
      barra.criarBarraComandos(() => ({
        itens: (q) => filtrarComandos(COMANDOS, q, (c) => ROTULOS[c.id]).map((c) => ({ id: c.id, rotulo: ROTULOS[c.id] })),
        aoPedir: (id) => estado.pedidos.push(id),
        dataDeHoje: () => '22/11/2026',
        render: () => ({
          onStart: (p) => (estado.menu = { aberto: true, itens: p.items, range: p.range, query: p.query, command: p.command }),
          onUpdate: (p) => (estado.menu = { aberto: true, itens: p.items, range: p.range, query: p.query, command: p.command }),
          onExit: () => (estado.menu = { aberto: false }),
          onKeyDown: () => false,
        }),
      })),
    ],
    content,
  })
  return { ed, estado }
}

/** Digita como o teclado: cada caractere passa pelas regras de digitação (input rules). */
function digitar(ed, texto) {
  for (const ch of texto) {
    const { from, to } = ed.state.selection
    const tratado = ed.view.someProp('handleTextInput', (f) => f(ed.view, from, to, ch, () => ed.state.tr.insertText(ch, from, to)))
    if (!tratado) ed.view.dispatch(ed.state.tr.insertText(ch, from, to))
  }
}

const espera = () => new Promise((r) => setTimeout(r, 5))

function acharNo(doc, tipo, attrs) {
  let achado = null
  doc.descendants((n) => {
    if (achado) return false
    if (n.type.name === tipo && Object.entries(attrs ?? {}).every(([k, v]) => n.attrs[k] === v)) achado = n
  })
  return achado
}

function temMarca(doc, marca, texto) {
  let ok = false
  doc.descendants((n) => {
    if (n.isText && n.text === texto && n.marks.some((m) => m.type.name === marca)) ok = true
  })
  return ok
}

/* ------------------------------------------------- guia x editor real */

for (const secao of GUIA) {
  for (const ex of secao.exemplos) {
    test(`guia: "${ex.mostrar ?? ex.digitar}" (${secao.id}/${ex.id})`, async () => {
      const { ed, estado } = novoEditor()
      ed.commands.focus('end')
      digitar(ed, ex.digitar)
      // nos atalhos de bloco, o texto de exemplo vem depois do marcador
      const v = ex.verificar
      await espera()
      if (v.tipo === 'bloco') {
        assert.ok(acharNo(ed.state.doc, v.no, v.attrs), `esperava ${v.no} ${JSON.stringify(v.attrs ?? {})}: ${JSON.stringify(ed.getJSON())}`)
        if (ex.amostra && ex.digitar.endsWith(ex.amostra)) assert.ok(ed.state.doc.textContent.includes(ex.amostra))
        // o marcador de markdown não fica no texto
        assert.ok(!/^(#|-|1\.|\[|>|!>)/.test(ed.state.doc.textContent), ed.state.doc.textContent)
      } else if (v.tipo === 'marca') {
        assert.ok(temMarca(ed.state.doc, v.marca, v.texto), JSON.stringify(ed.getJSON()))
        assert.equal(ed.state.doc.textContent, v.texto)
      } else if (v.tipo === 'texto') {
        assert.ok(ed.state.doc.textContent.includes(v.texto))
      } else if (v.tipo === 'menu') {
        assert.ok(estado.menu?.aberto, 'menu "/" devia abrir')
        const alvo = ex.digitar.slice(1)
        if (alvo) {
          const esperado = { imagem: 'imagem', 'vídeo': 'video', tabela: 'tabela', propriedade: 'propriedade', cor: 'cor_texto' }[alvo]
          assert.equal(estado.menu.itens[0]?.id, esperado, JSON.stringify(estado.menu.itens))
        } else {
          assert.equal(estado.menu.itens.length, COMANDOS.length)
        }
      }
      ed.destroy()
    })
  }
}

for (const ex of ATALHOS_TECLADO) {
  test(`guia: atalho ${ex.digitar}`, () => {
    const amostra = ex.amostra ?? 'texto'
    const { ed } = novoEditor({ content: `<p>${amostra}</p>` })
    const v = ex.verificar
    if (v.tecla === 'Mod-z') {
      ed.commands.focus('end')
      digitar(ed, ' mais')
      assert.ok(ed.state.doc.textContent.endsWith('mais'))
      ed.commands.keyboardShortcut('Mod-z')
      assert.equal(ed.state.doc.textContent, amostra)
      return
    }
    if (v.tecla === 'Mod-Shift-z') {
      ed.commands.focus('end')
      digitar(ed, ' mais')
      // direto no view (keyboardShortcut regrava os passos e confunde o histórico)
      const tecla = (key, shiftKey) => ed.view.someProp('handleKeyDown', (f) => f(ed.view, new KeyboardEvent('keydown', { key, ctrlKey: true, shiftKey })))
      tecla('z', false)
      assert.equal(ed.state.doc.textContent, amostra)
      tecla('z', true)
      assert.ok(ed.state.doc.textContent.endsWith('mais'))
      return
    }
    if (v.tecla === 'Shift-Enter') {
      ed.commands.focus('end')
      ed.commands.keyboardShortcut('Shift-Enter')
      assert.ok(acharNo(ed.state.doc, 'hardBreak'))
      return
    }
    ed.commands.selectAll()
    ed.commands.keyboardShortcut(v.tecla)
    if (v.marca) assert.ok(temMarca(ed.state.doc, v.marca, amostra), JSON.stringify(ed.getJSON()))
    if (v.no) assert.ok(acharNo(ed.state.doc, v.no, v.attrs), JSON.stringify(ed.getJSON()))
    ed.destroy()
  })
}

/* ------------------------------------------------------- menu "/" */

test('menu "/": não abre colado a uma palavra nem dentro de código', async () => {
  const { ed, estado } = novoEditor()
  ed.commands.focus('end')
  digitar(ed, 'e/ou')
  await espera()
  assert.ok(!estado.menu?.aberto)
  const { ed: ed2, estado: e2 } = novoEditor({ content: '<pre><code>x</code></pre>' })
  ed2.commands.focus('end')
  digitar(ed2, ' /')
  await espera()
  assert.ok(!e2.menu?.aberto)
})

test('menu "/": escolher comando troca o "/consulta" pelo bloco', async () => {
  const { ed, estado } = novoEditor()
  ed.commands.focus('end')
  digitar(ed, '/tare')
  await espera()
  assert.equal(estado.menu.itens[0].id, 'tarefas')
  estado.menu.command(estado.menu.itens[0])
  assert.ok(acharNo(ed.state.doc, 'taskList'))
  assert.ok(!ed.state.doc.textContent.includes('/tare'))
})

test('menu "/": comandos com diálogo vão para a tela', async () => {
  for (const id of barra.COMANDOS_COM_DIALOGO) {
    const { ed, estado } = novoEditor()
    ed.commands.focus('end')
    digitar(ed, '/')
    await espera()
    estado.menu.command({ id, rotulo: ROTULOS[id] })
    assert.deepEqual(estado.pedidos, [id])
    assert.equal(ed.state.doc.textContent, '')
  }
})

test('menu "/": todos os comandos de bloco', () => {
  const casos = {
    texto: 'paragraph', titulo1: 'heading', titulo2: 'heading', titulo3: 'heading', lista: 'bulletList',
    lista_numerada: 'orderedList', tarefas: 'taskList', citacao: 'blockquote', destaque: 'callout',
    divisor: 'horizontalRule', codigo: 'codeBlock', tabela: 'table',
  }
  for (const [id, tipo] of Object.entries(casos)) {
    const { ed } = novoEditor({ content: '<p>x</p>' })
    ed.commands.focus('end')
    assert.ok(barra.executarComando(ed, id, null, () => '22/11/2026'), id)
    assert.ok(acharNo(ed.state.doc, tipo), `${id} → ${tipo}`)
  }
  const { ed } = novoEditor()
  ed.commands.focus('end')
  barra.executarComando(ed, 'data_hoje', null, () => '22/11/2026')
  assert.equal(ed.state.doc.textContent, '22/11/2026 ')
  const { ed: ed2 } = novoEditor({ content: '<p>palavra</p>' })
  ed2.commands.focus('end')
  barra.executarComando(ed2, 'tag', null, () => '')
  assert.equal(ed2.state.doc.textContent, 'palavra #')
  const { ed: ed3 } = novoEditor()
  ed3.commands.focus('end')
  barra.executarComando(ed3, 'ligacao', null, () => '')
  assert.equal(ed3.state.doc.textContent, '[[')
})

test('botão da barra abre o menu; fechar sem escolher apaga o "/"', async () => {
  const { ed, estado } = novoEditor({ content: '<p>Amém</p>' })
  ed.commands.focus('end')
  barra.abrirMenuComandos(ed)
  await espera()
  assert.ok(estado.menu.aberto)
  assert.equal(ed.state.doc.textContent, 'Amém /')
  barra.fecharMenuComandos(ed, estado.menu.range, estado.menu.query)
  await espera()
  assert.equal(ed.state.doc.textContent, 'Amém ')
  assert.ok(!estado.menu.aberto)
})

/* -------------------------------------------------------- nós próprios */

const UUID = 'noteatt_00000000-0000-0000-0000-000000000001'

test('imagem: anexo carregado pela função do contexto; link só https', async () => {
  const pedidos = []
  const { ed } = novoEditor({ carregar: async (a) => (pedidos.push(a), 'blob:http://localhost/abc') })
  ed.commands.focus('end')
  assert.ok(ed.commands.inserirImagem({ anexo: UUID, alt: 'Monte' }))
  await espera()
  assert.deepEqual(pedidos, [UUID])
  const img = ed.view.dom.querySelector('figure.caderno-imagem img')
  assert.equal(img.getAttribute('src'), 'blob:http://localhost/abc')
  assert.equal(img.getAttribute('alt'), 'Monte')
  // HTML gerado (copiar/colar) não expõe URL do anexo
  assert.ok(ed.getHTML().includes(`data-anexo="${UUID}"`))
  assert.ok(!/<img[^>]*src=/.test(ed.getHTML()))
  assert.equal(ed.commands.inserirImagem({ src: 'javascript:alert(1)' }), false)
  assert.equal(ed.commands.inserirImagem({ src: 'http://inseguro.org/a.png' }), false)
  assert.equal(ed.commands.inserirImagem({ anexo: '../../etc/passwd' }), false)
  assert.ok(ed.commands.inserirImagem({ src: 'https://exemplo.org/a.png' }))
})

test('imagem: conteúdo forjado (JSON) não injeta src perigoso', () => {
  const { ed } = novoEditor({
    content: { type: 'doc', content: [{ type: 'image', attrs: { src: 'javascript:alert(1)', anexo: 'x' } }] },
  })
  assert.ok(!ed.getHTML().includes('javascript:'))
  assert.equal(ed.view.dom.querySelector('figure img').getAttribute('src'), null)
  // colar <img src="data:..."> não cria imagem
  const { ed: ed2 } = novoEditor({ content: '<p>a</p><img src="data:image/png;base64,AAAA">' })
  assert.equal(acharNo(ed2.state.doc, 'image'), null)
})

test('tarefas: marcar a caixa grava checked; leitura não deixa marcar', () => {
  const { ed } = novoEditor({ content: '<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>orar</p></li></ul>' })
  const caixa = ed.view.dom.querySelector('li[data-type="taskItem"] input[type="checkbox"]')
  assert.ok(caixa.getAttribute('aria-label'))
  caixa.checked = true
  caixa.dispatchEvent(new janela.Event('change'))
  assert.ok(acharNo(ed.state.doc, 'taskItem', { checked: true }))

  const { ed: leitura } = novoEditor({ editable: false, content: '<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>orar</p></li></ul>' })
  const c2 = leitura.view.dom.querySelector('input[type="checkbox"]')
  assert.ok(c2.disabled)
  c2.checked = true
  c2.dispatchEvent(new janela.Event('change'))
  assert.ok(acharNo(leitura.state.doc, 'taskItem', { checked: false }))
})

test('tarefas: Enter cria a próxima tarefa (desmarcada)', () => {
  const { ed } = novoEditor()
  ed.commands.focus('end')
  digitar(ed, '[x] um')
  ed.commands.keyboardShortcut('Enter')
  digitar(ed, 'dois')
  const itens = []
  ed.state.doc.descendants((n) => {
    if (n.type.name === 'taskItem') itens.push([n.textContent, n.attrs.checked])
  })
  assert.deepEqual(itens, [['um', true], ['dois', false]])
})

test('vídeos: só YouTube (nocookie) e Vimeo (dnt=1), com sandbox', () => {
  const { ed } = novoEditor({
    content: {
      type: 'doc',
      content: [
        { type: 'youtube', attrs: { src: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' } },
        { type: 'vimeo', attrs: { id: '76979871', hash: null } },
        { type: 'youtube', attrs: { src: 'javascript:alert(1)' } },
        { type: 'vimeo', attrs: { id: '1;alert(1)' } },
      ],
    },
  })
  const html = ed.getHTML()
  const iframes = [...html.matchAll(/<iframe[^>]*src="([^"]+)"/g)].map((m) => m[1])
  assert.deepEqual(iframes, [
    'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    'https://player.vimeo.com/video/76979871?dnt=1',
  ])
  assert.ok(html.includes('sandbox="allow-scripts allow-same-origin'))
  assert.ok(!html.includes('javascript:'))
})

test('destaque: atalho "!> " e voltar com o comando', () => {
  const { ed } = novoEditor()
  ed.commands.focus('end')
  digitar(ed, '!> Deus é fiel')
  assert.ok(acharNo(ed.state.doc, 'callout'))
  assert.ok(ed.getHTML().includes('role="note"'))
  ed.commands.toggleCallout()
  assert.equal(acharNo(ed.state.doc, 'callout'), null)
})

/* ------------------------------------------------- importação .md */

test('importar .md: frontmatter, tarefas, imagem, destaque, tabela e vídeo', async () => {
  const arquivo = [
    '---',
    'tipo: Culto',
    'livro: João',
    '---',
    '# Culto de domingo',
    '',
    '- [ ] ler Jo 3',
    '- [x] orar',
    '',
    `![Monte](caderno:anexo/${UUID})`,
    '',
    '> [!note]',
    '> Deus é fiel',
    '',
    '| Livro | Tema |',
    '| --- | --- |',
    '| João | Amor |',
    '',
    'https://youtu.be/dQw4w9WgXcQ',
    '',
    'Ver [[Graça]] e #oração',
  ].join('\n')
  const { propriedades, corpo } = lerFrontmatter(arquivo)
  assert.deepEqual(propriedades, [{ key: 'tipo', value: 'Culto' }, { key: 'livro', value: 'João' }])
  const doc = await markdownParaDocPublico(corpo.replace(/^\s*#\s+.+\r?\n?/, ''))
  // o documento importado é válido para o editor do Caderno
  const { ed } = novoEditor({ content: doc })
  const d = ed.state.doc
  assert.ok(acharNo(d, 'taskItem', { checked: false }))
  assert.ok(acharNo(d, 'taskItem', { checked: true }))
  assert.ok(acharNo(d, 'image', { anexo: UUID, alt: 'Monte' }))
  assert.ok(acharNo(d, 'callout'))
  assert.ok(acharNo(d, 'table'))
  assert.ok(acharNo(d, 'youtube'))
  assert.ok(d.textContent.includes('[[Graça]]') && d.textContent.includes('#oração'))
})

test('importar .md: o mesmo texto que a exportação do servidor gera', async () => {
  // saída de apps/api tiptap_to_markdown (test_markdown_export_editor_v2_nodes)
  const exportado = [
    `![Monte](caderno:anexo/${UUID})`,
    '',
    'https://vimeo.com/123456',
    '',
    '- [x] Ler Jo 3',
    '- [ ] Orar',
    '',
    '> [!note]',
    '> Deus é fiel',
    '',
    '| Livro | Tema |',
    '| --- | --- |',
    '| João | a\\|b |',
    '',
  ].join('\n')
  const doc = await markdownParaDocPublico(exportado)
  const tipos = doc.content.map((n) => n.type)
  assert.deepEqual(tipos, ['image', 'vimeo', 'taskList', 'callout', 'table'])
})

/* ------------------------------- decorações incrementais (item 1.5) */
// A cada tecla, [[ligações]], #tags e referências bíblicas eram redecoradas no
// documento inteiro. Agora só os blocos tocados são refeitos; o resultado
// precisa ser idêntico ao cálculo completo, em qualquer edição.

const { ReferenciasBiblicas, decorarReferencias } = await import('../../Biblia/extensaoReferencias.ts')
const { LigacoesETags, decorarLigacoesTags } = await import('./decoracoesCaderno.ts')
const { DecorationSet } = await import('@tiptap/pm/view')
const { faixasAlteradas } = await import('../../../lib/editor/decoracoesIncrementais.ts')

function resumoDecoracoes(conjunto, doc) {
  return conjunto
    .find(0, doc.content.size)
    .map((d) => `${d.from}-${d.to}:${JSON.stringify(d.type.attrs ?? d.type.spec?.key ?? '')}`)
    .sort()
}

function editorDecorado(content) {
  return new Editor({
    element: document.createElement('div'),
    extensions: [StarterKit.configure({ heading: { levels: [1, 2, 3, 4] } }), ReferenciasBiblicas, LigacoesETags],
    content,
  })
}

const PARAGRAFOS = Array.from({ length: 12 }, (_, i) => ({
  type: 'paragraph',
  content: [{ type: 'text', text: `Linha ${i}: Jo 3:16 e Rm 8:28, a [[Nota ${i}]] e a #tag${i}, com Sl 23.` }],
}))

test('decorações incrementais = cálculo completo depois de apagar, digitar, juntar e colar', () => {
  const ed = editorDecorado({
    type: 'doc',
    content: [...PARAGRAFOS, { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: '— João 3:16 (NVI)' }] }] }],
  })
  const conferir = (passo) => {
    for (const [plugin, decorar] of [
      [ed.state.plugins.find((p) => p.key.startsWith('referenciasBiblicas')), decorarReferencias],
      [ed.state.plugins.find((p) => p.key.startsWith('cadernoLigacoesTags')), decorarLigacoesTags],
    ]) {
      const incremental = plugin.getState(ed.state)
      const completo = DecorationSet.create(ed.state.doc, decorar(ed.state.doc, 0, ed.state.doc.content.size))
      assert.deepEqual(resumoDecoracoes(incremental, ed.state.doc), resumoDecoracoes(completo, ed.state.doc), `${passo} (${plugin.key})`)
    }
  }
  conferir('início')
  // apagar caractere a caractere no fim de "Sl 23" (a referência muda a cada tecla)
  let fimSl = 0
  ed.state.doc.descendants((n, pos) => {
    if (!fimSl && n.isText && n.text.includes('Sl 23')) fimSl = pos + n.text.indexOf('Sl 23') + 5
  })
  for (let i = 0; i < 6; i++) {
    ed.view.dispatch(ed.state.tr.delete(fimSl - 1 - i, fimSl - i))
    conferir(`apagar ${i}`)
  }
  // quebrar um [[ ]] e uma #tag, juntar parágrafos, digitar uma referência nova
  ed.commands.setTextSelection(30)
  ed.view.dispatch(ed.state.tr.insertText(' Gn 1:1 #nova [[Outra]] '))
  conferir('digitar')
  ed.commands.setTextSelection(ed.state.doc.child(0).nodeSize + 1)
  ed.commands.joinBackward()
  conferir('juntar')
  ed.commands.setTextSelection(5)
  ed.commands.splitBlock()
  conferir('quebrar bloco')
  // editar a citação: a citação viva some e volta
  let posCit = 0
  ed.state.doc.descendants((n, pos) => {
    if (n.isText && n.text.startsWith('— João')) posCit = pos + n.text.length - 1
  })
  ed.view.dispatch(ed.state.tr.delete(posCit - 3, posCit))
  conferir('citação quebrada')
  ed.view.dispatch(ed.state.tr.insertText('NVI', posCit - 3))
  conferir('citação de volta')
  // colar vários blocos e desfazer
  ed.commands.insertContentAt(3, PARAGRAFOS.slice(0, 3))
  conferir('colar')
  ed.commands.undo()
  conferir('desfazer')
  ed.commands.setContent({ type: 'doc', content: PARAGRAFOS.slice(0, 2) })
  conferir('setContent')
  ed.destroy()
})

test('decorações incrementais: apagar um caractere redecora só o bloco tocado', () => {
  const ed = editorDecorado({ type: 'doc', content: PARAGRAFOS })
  const tr = ed.state.tr.delete(10, 11)
  const faixas = faixasAlteradas(tr)
  assert.equal(faixas.length, 1)
  const bloco = ed.state.doc.child(0).nodeSize
  assert.deepEqual(faixas[0], [0, bloco - 1])
  ed.destroy()
})

/* ------------------------------------ marca-texto e cor (item 2.4) */

test('marca-texto e cor: comandos, paleta fechada e HTML seguro', () => {
  const { ed } = novoEditor({ content: '<p>graça e paz</p>' })
  ed.commands.setTextSelection({ from: 1, to: 6 })
  ed.commands.toggleMarcaTexto('azul')
  assert.ok(ed.isActive('highlight', { cor: 'azul' }))
  ed.commands.toggleMarcaTexto('azul')
  assert.ok(!ed.isActive('highlight'))
  ed.commands.setCorTexto('rosa')
  assert.ok(ed.isActive('corTexto', { cor: 'rosa' }))
  ed.commands.setCorTexto('roxo')
  assert.ok(!ed.isActive('corTexto'), 'cor fora da paleta tira a cor')
  // conteúdo vindo de fora com cor inventada: nunca vira estilo nem atributo livre
  ed.commands.setContent({
    type: 'doc',
    content: [{ type: 'paragraph', content: [
      { type: 'text', text: 'a', marks: [{ type: 'highlight', attrs: { cor: 'red" onclick="x' } }] },
      { type: 'text', text: 'b', marks: [{ type: 'corTexto', attrs: { cor: 'javascript:1' } }] },
    ] }],
  })
  const html = ed.getHTML()
  assert.ok(/<mark[^>]*data-cor="verde"[^>]*>a<\/mark>/.test(html), html)
  assert.ok(!/onclick|javascript|style=/.test(html), html)
  // colar HTML com cor fora da paleta: a cor some
  ed.commands.setContent('<p><span data-cor="dourado">c</span><span data-cor="azul">d</span><mark data-cor="ambar">e</mark></p>')
  const json = JSON.stringify(ed.getJSON())
  assert.ok(json.includes('"corTexto","attrs":{"cor":"azul"}'), json)
  assert.ok(!json.includes('dourado') && !json.includes('ambar'), json)
  ed.destroy()
})

test('importar .md: ==marca==, <mark data-cor> e <span data-cor> (o que a exportação gera)', async () => {
  const md = '==graça== e <mark data-cor="azul">fé</mark> e <span data-cor="rosa">paz</span> e <span data-cor="verde"><mark data-cor="grafite">**amor**</mark></span> e <span data-cor="dourado">x</span> `==código==`'
  const doc = await markdownParaDocPublico(md)
  const textos = doc.content[0].content
  const achar = (t) => textos.find((n) => n.text === t)
  assert.deepEqual(achar('graça').marks, [{ type: 'highlight', attrs: { cor: 'verde' } }])
  assert.deepEqual(achar('fé').marks, [{ type: 'highlight', attrs: { cor: 'azul' } }])
  assert.deepEqual(achar('paz').marks, [{ type: 'corTexto', attrs: { cor: 'rosa' } }])
  const amor = achar('amor').marks.map((m) => m.type).sort()
  assert.deepEqual(amor, ['bold', 'corTexto', 'highlight'])
  assert.ok(textos.some((n) => n.text?.includes('x') && !n.marks?.length))
  assert.ok(achar('==código==')?.marks.some((m) => m.type === 'code'))
  assert.ok(!JSON.stringify(doc).includes('CDX'))
})
