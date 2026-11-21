// node --test lib/discipulei/nav.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { IDIOMAS_DISCIPULEI, idiomaDiscipulei, urlAgendar } from './nav.ts'

test('seletor oferece só pt, en e es, nesta ordem', () => {
  assert.deepEqual([...IDIOMAS_DISCIPULEI], ['pt', 'en', 'es'])
})

test('idiomaDiscipulei reduz o código do i18next e cai no português', () => {
  assert.equal(idiomaDiscipulei('pt-BR'), 'pt')
  assert.equal(idiomaDiscipulei('en-US'), 'en')
  assert.equal(idiomaDiscipulei('es'), 'es')
  assert.equal(idiomaDiscipulei('fr'), 'pt')
  assert.equal(idiomaDiscipulei(undefined), 'pt')
})

test('urlAgendar aponta para a página do idioma e mantém a atribuição', () => {
  assert.equal(
    urlAgendar('menu'),
    'https://www.discipulei.com.br/discipulado-biblico/?o=comunidade-menu#agendar'
  )
  assert.equal(
    urlAgendar('biblia', 'agendar', 'pt-BR'),
    'https://www.discipulei.com.br/discipulado-biblico/?o=comunidade-biblia#agendar'
  )
  assert.equal(
    urlAgendar('menu-lateral', 'agendar', 'en'),
    'https://www.discipulei.com.br/en/discipulado-biblico/?o=comunidade-menu-lateral#agendar'
  )
  assert.equal(
    urlAgendar('lista', 'como-funciona', 'es'),
    'https://www.discipulei.com.br/es/discipulado-biblico/?o=comunidade-lista#como-funciona'
  )
})
