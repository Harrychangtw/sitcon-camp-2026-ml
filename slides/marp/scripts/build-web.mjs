#!/usr/bin/env node
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

// 2. Fresh bundle skeleton.
rmSync(bundle, { recursive: true, force: true })
mkdirSync(join(bundle, 'assets/figures'), { recursive: true })

// 3. Copy assets under one flat root.
cpSync(join(root, 'assets/bg'), join(bundle, 'assets/bg'), { recursive: true })
cpSync(join(root, 'assets/fonts'), join(bundle, 'assets/fonts'), { recursive: true })
for (const f of readdirSync(figuresDir).filter((n) => n.endsWith('.png')))
  copyFileSync(join(figuresDir, f), join(bundle, 'assets/figures', f))

// 4. Rewrite the relative roots the HTML/theme use. Order: deepest first.
const args = process.argv.slice(2)
const baseArg = args.find((a) => a.startsWith('--base='))
const base = (baseArg ? baseArg.slice('--base='.length) : process.env.DECK_BASE || '').replace(/\/$/, '')

let html = readFileSync(tmpHtml, 'utf8')
html = html.split('../../figures/').join('./assets/figures/')
html = html.split('../assets/').join('./assets/')
if (base) html = html.split('./assets/').join(`${base}/assets/`) // absolute mount
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
