// Builds assets/fx.js from fx.mjs. Only needed when the effects change; the site
// itself is plain files and needs no build to run.
//   cd fx-src && npm install && node build.mjs
import { writeFileSync, mkdirSync, copyFileSync, statSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { readFileSync } from 'node:fs'
import { prepareShader } from '@vgpu/wgsl/prepare'
import { build } from 'esbuild'
import * as shaders from './shaders.mjs'

const prepared = Object.fromEntries(Object.entries(shaders).map(([k, v]) => [k, prepareShader(v)]))
writeFileSync(new URL('./prepared.json', import.meta.url), JSON.stringify(prepared))

const out = new URL('../assets/fx.js', import.meta.url)
await build({
  entryPoints: [new URL('./fx.mjs', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')],
  bundle: true,
  format: 'esm',
  minify: true,
  target: 'es2022',
  legalComments: 'none',
  banner: { js: '/* Noodle site effects. Includes vgpu (MIT, Copyright Vercel), see assets/vgpu-LICENSE.txt */' },
  outfile: out.pathname.replace(/^\/([A-Z]:)/, '$1')
})
mkdirSync(new URL('../assets', import.meta.url), { recursive: true })
copyFileSync(new URL('./node_modules/vgpu/LICENSE', import.meta.url), new URL('../assets/vgpu-LICENSE.txt', import.meta.url))
const bytes = readFileSync(out)
console.log(`fx.js ${bytes.length} bytes, ${gzipSync(bytes).length} gzipped`)
