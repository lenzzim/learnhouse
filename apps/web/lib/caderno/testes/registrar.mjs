// Carregador dos testes do Caderno no Node 24 (sem bundler):
//   node --import ./lib/caderno/testes/registrar.mjs --test <arquivos>
// Resolve os aliases do tsconfig (@/, @components/, @lib/) e imports
// relativos sem extensão para os arquivos .ts — os módulos do app ficam
// escritos como o Next espera, sem ".ts" nos imports.
import { register } from 'node:module'

register('./resolver.mjs', import.meta.url)
