// Testes da validação de links de vídeo e imagem.
// Rodar (a partir de apps/web):
//   node --import ./lib/caderno/testes/registrar.mjs --test lib/caderno/video.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { analisarUrlVideo, embedVimeo, embedYoutube, urlImagemValida } from './video.ts'

test('YouTube: formatos aceitos viram embed nocookie', () => {
  const casos = [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'youtube.com/watch?v=dQw4w9WgXcQ&list=x',
    'https://youtu.be/dQw4w9WgXcQ',
    'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com/shorts/dQw4w9WgXcQ',
    'https://www.youtube.com/embed/dQw4w9WgXcQ',
    'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    'https://www.youtube.com/live/dQw4w9WgXcQ',
  ]
  for (const c of casos) {
    const v = analisarUrlVideo(c)
    assert.ok(v, c)
    assert.equal(v.tipo, 'youtube')
    assert.equal(v.id, 'dQw4w9WgXcQ')
    assert.equal(v.embed, 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')
  }
})

test('YouTube: tempo inicial', () => {
  assert.equal(
    analisarUrlVideo('https://youtu.be/dQw4w9WgXcQ?t=90').embed,
    'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=90'
  )
  assert.equal(analisarUrlVideo('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s').inicio, 90)
})

test('Vimeo: embed com dnt=1 e vídeo não listado', () => {
  assert.equal(analisarUrlVideo('https://vimeo.com/76979871').embed, 'https://player.vimeo.com/video/76979871?dnt=1')
  assert.equal(analisarUrlVideo('https://vimeo.com/channels/staffpicks/76979871').id, '76979871')
  const nl = analisarUrlVideo('https://vimeo.com/76979871/abc123def0')
  assert.equal(nl.hash, 'abc123def0')
  assert.equal(nl.embed, 'https://player.vimeo.com/video/76979871?dnt=1&h=abc123def0')
  assert.equal(analisarUrlVideo('https://player.vimeo.com/video/76979871?h=abc123def0').hash, 'abc123def0')
  assert.equal(embedVimeo('123'), 'https://player.vimeo.com/video/123?dnt=1')
  assert.equal(embedVimeo('12a'), '')
})

test('domínios fora da lista e URLs perigosas são recusados', () => {
  const ruins = [
    '',
    'javascript:alert(1)',
    'https://evil.com/watch?v=dQw4w9WgXcQ',
    'https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ',
    'https://notyoutube.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com/watch?v=curto',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ"onload="x',
    'https://user:pass@youtube.com/watch?v=dQw4w9WgXcQ',
    'https://vimeo.com/',
    'https://vimeo.com.evil.com/123',
    'https://player.vimeo.com/123',
    'data:text/html,<script>',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ extra',
  ]
  for (const r of ruins) assert.equal(analisarUrlVideo(r), null, r)
  assert.equal(embedYoutube('https://evil.com/x'), '')
})

test('imagem por link: só https', () => {
  assert.equal(urlImagemValida('https://exemplo.org/a.png'), 'https://exemplo.org/a.png')
  assert.equal(urlImagemValida('http://exemplo.org/a.png'), null)
  assert.equal(urlImagemValida('javascript:alert(1)'), null)
  assert.equal(urlImagemValida('data:image/png;base64,AAAA'), null)
  assert.equal(urlImagemValida('https://u:p@exemplo.org/a.png'), null)
})
