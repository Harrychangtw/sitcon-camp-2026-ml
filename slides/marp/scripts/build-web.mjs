#!/usr/bin/env node
/* global process, console */
// Build a SELF-CONTAINED web bundle of the Course 2 deck for static hosting.
//
// Marp exports the bespoke HTML player (presenter view = notes + timer, press
// `P`), but references fonts/backgrounds/figures by relative path — so a lone
// .html file is not portable. This script exports the HTML, rewrites those
// paths to a single flat `./assets/` root, and copies the referenced files in.
//
// Output: slides/marp/web/course2/  (index.html + assets/)  — drop into any
// static host. Pass the deploy dir as the first arg (or set DECK_DEST) to sync
// the bundle there too.
//
// `--base=<url-prefix>` rewrites asset refs to ABSOLUTE paths under that prefix
// instead of relative `./assets/`. Required when the deck is served at a pretty
// URL with no trailing slash (e.g. /slides/foo), where relative paths would
// resolve against the wrong directory. Omit it for a portable relative bundle.
//
//   node scripts/build-web.mjs
//   node scripts/build-web.mjs --base=/slides/sitcon-camp-26-ml-course2 \
//     /path/to/harrychang-me/public/slides/sitcon-camp-26-ml-course2

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, readdirSync, copyFileSync } from 'node:fs'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// harrychang-me already serves the Artific family from /fonts/artific-fonts/
// (static woff2 weights, wired in apps/harrychang-me/app/layout.tsx and
// populated at build time by that app's scripts/fetch-fonts.mjs). A `--base`
// bundle mounts under that same host, so it points its Artific @font-face at
// those files instead of shipping its own Artific-Variable.ttf. The deck only
// renders Artific at wght 400 (BODY) and 700 (HEAD) — see themes/camp-dark.css.
const SITE_ARTIFIC_FONTS = '/fonts/artific-fonts'
const siteArtificFaces =
  `@font-face {font-family:'Artific Variable';src:url('${SITE_ARTIFIC_FONTS}/Artific-Regular.woff2') format('woff2'),` +
  `local('Artific Regular'), local('Artific-Regular');font-weight:400;font-style:normal;font-display:swap}` +
  `@font-face {font-family:'Artific Variable';src:url('${SITE_ARTIFIC_FONTS}/Artific-Bold.woff2') format('woff2'),` +
  `local('Artific Bold'), local('Artific-Bold');font-weight:700;font-style:normal;font-display:swap}`

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')                 // slides/marp
const deck = join(root, 'deck/course2.md')
const tmpHtml = join(root, 'out/course2.html')
const bundle = join(root, 'web/course2')
const figuresDir = resolve(root, '../figures')

// 1. Export the bespoke HTML player.
execFileSync(
  'pnpm',
  ['exec', 'marp', '--config', join(root, 'marp.config.js'), '--allow-local-files', deck, '-o', tmpHtml],
  { stdio: 'inherit', cwd: root },
)

// 2. Resolve the mount base up front — it decides which fonts we bundle.
const args = process.argv.slice(2)
const baseArg = args.find((a) => a.startsWith('--base='))
const base = (baseArg ? baseArg.slice('--base='.length) : process.env.DECK_BASE || '').replace(/\/$/, '')

// 3. Fresh bundle skeleton.
rmSync(bundle, { recursive: true, force: true })
mkdirSync(join(bundle, 'assets/figures'), { recursive: true })

// 4. Copy assets under one flat root.
cpSync(join(root, 'assets/bg'), join(bundle, 'assets/bg'), { recursive: true })
// Noto + Fira always ship with the bundle; the host site does not serve those.
// Artific-Variable.ttf ships only in the portable (relative) bundle — a --base
// build inherits Artific from the host (see siteArtificFaces above).
cpSync(join(root, 'assets/fonts'), join(bundle, 'assets/fonts'), {
  recursive: true,
  filter: (src) => !(base && src.endsWith('Artific-Variable.ttf')),
})
for (const f of readdirSync(figuresDir).filter((n) => n.endsWith('.png')))
  copyFileSync(join(figuresDir, f), join(bundle, 'assets/figures', f))

// 5. Rewrite the relative roots the HTML/theme use. Order: deepest first.
let html = readFileSync(tmpHtml, 'utf8')
html = html.split('../../figures/').join('./assets/figures/')
html = html.split('../assets/').join('./assets/')
if (base) {
  html = html.split('./assets/').join(`${base}/assets/`) // absolute mount
  // Repoint Artific at the host site's served woff2 (dropped from the bundle).
  const before = html
  html = html.replace(/@font-face \{font-family:'Artific Variable';[^}]*\}/, siteArtificFaces)
  if (html === before) throw new Error('Artific @font-face block not found — theme changed; update siteArtificFaces')
}
writeFileSync(join(bundle, 'index.html'), html)
console.log('bundle ->', bundle, base ? `(base ${base})` : '(relative)')

// 5. Optional sync to a static-host dir (e.g. harrychang-me/public/slides/...).
const dest = args.find((a) => !a.startsWith('--')) || process.env.DECK_DEST
if (dest) {
  const target = resolve(dest)
  rmSync(target, { recursive: true, force: true })
  mkdirSync(target, { recursive: true })
  cpSync(bundle, target, { recursive: true })
  console.log('synced ->', target)
}
