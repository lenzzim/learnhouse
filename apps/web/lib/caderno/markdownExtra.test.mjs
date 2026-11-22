// Testes da conversão extra de Markdown (tarefas, imagens, destaque, vídeo).
// Rodar (a partir de apps/web):
//   node --import ./lib/caderno/testes/registrar.mjs --test lib/caderno/markdownExtra.test.mjs
// O parser de verdade (@tiptap/markdown) entra em components/Caderno/editor/editor.test.mjs.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ajustarDoc, prepararMarkdown } from './markdownExtra.ts'

const UUID = 'noteatt_00000000-0000-0000-0000-000000000001'

test('preparar: marcadores para tarefas e imagens (fora de blocos de código)', () => {
  const entrada = [
    '- [ ] ler',
    '  - [x] orar',
    `![Monte](caderno:anexo/${UUID})`,
    '![x](javascript:alert(1))',
    '```',
    '- [ ] código',
    '```',
  ].join('\n')
  const { md, imagens } = prepararMarkdown(entrada)
  const linhas = md.split('\n')
  assert.equal(linhas[0], '- CDXTAREFA0 ler')
  assert.equal(linhas[1], '  - CDXTAREFA1 orar')
  assert.equal(linhas[2], 'CDXIMAGEM0X')
  assert.equal(linhas[3], 'x') // imagem perigosa vira só o texto alternativo
  assert.equal(linhas[5], '- [ ] código')
  assert.deepEqual(imagens, [{ alt: 'Monte', src: null, anexo: UUID }])
})

test('ajustar: lista de tarefas, imagem, destaque e vídeo', () => {
  const { imagens } = prepararMarkdown(`![Monte](caderno:anexo/${UUID})`)
  const link = { type: 'link', attrs: { href: 'https://youtu.be/dQw4w9WgXcQ' } }
  const doc = {
    type: 'doc',
    content: [
      {
        type: 'bulletList',
        content: [
          { type: 'listItem', content: [{ type: 'text', text: 'CDXTAREFA0 um' }] },
          { type: 'listItem', content: [{ type: 'text', text: 'CDXTAREFA1 dois' }] },
        ],
      },
      { type: 'paragraph', content: [{ type: 'text', text: 'CDXIMAGEM0X' }] },
      { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: '[!note] Lembrete\nDeus é fiel' }] }] },
      { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'citação comum' }] }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'https://youtu.be/dQw4w9WgXcQ', marks: [link] }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'https://vimeo.com/76979871' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'veja https://vimeo.com/76979871' }] },
    ],
  }
  const out = ajustarDoc(doc, imagens).content
  assert.equal(out[0].type, 'taskList')
  assert.deepEqual(out[0].content.map((i) => i.attrs.checked), [false, true])
  assert.deepEqual(out[0].content[0].content, [{ type: 'paragraph', content: [{ type: 'text', text: 'um' }] }])
  assert.deepEqual(out[1], { type: 'image', attrs: { src: null, anexo: UUID, alt: 'Monte' } })
  assert.equal(out[2].type, 'callout')
  assert.deepEqual(out[2].content[0], {
    type: 'paragraph',
    content: [{ type: 'text', text: 'Lembrete', marks: [{ type: 'bold' }] }],
  })
  assert.equal(out[2].content[1].content[0].text, 'Deus é fiel')
  assert.equal(out[3].type, 'blockquote')
  assert.deepEqual(out[4], { type: 'youtube', attrs: { src: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', start: 0 } })
  assert.deepEqual(out[5], { type: 'vimeo', attrs: { id: '76979871', hash: null } })
  assert.equal(out[6].type, 'paragraph') // link no meio do texto continua link
})

test('ajustar: destaque só com o marcador e texto solto na raiz', () => {
  const doc = {
    type: 'doc',
    content: [
      {
        type: 'blockquote',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: '[!note]' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'x' }] },
        ],
      },
      { type: 'text', text: 'solto' },
    ],
  }
  const out = ajustarDoc(doc, []).content
  assert.equal(out[0].type, 'callout')
  assert.deepEqual(out[0].content, [{ type: 'paragraph', content: [{ type: 'text', text: 'x' }] }])
  assert.deepEqual(out[1], { type: 'paragraph', content: [{ type: 'text', text: 'solto' }] })
})
