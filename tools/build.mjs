// Ashen Oath build script.
// Produces a fully self-contained `play/` folder that runs by double-clicking
// play/index.html on Windows, macOS and Linux (no server, no engine, no install).
//
//  1. Bundles src/ (Three.js, rot.js, Howler, game code) into play/game.js (IIFE).
//  2. Packs every asset (models, textures, audio, icons, fonts) into
//     play/data/pack-N.js files as data: URIs, because browsers block fetch()
//     from file:// pages but happily run <script> files.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as esbuild from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'play');
const DATA = path.join(OUT, 'data');
const watch = process.argv.includes('--watch');

const MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff2': 'font/woff2', '.woff': 'font/woff',
};

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p)); else out.push(p);
  }
  return out;
}

// Strip glTF animation-library meshes: the KayKit animation .glb files ship a
// mannequin mesh we never render. We keep them as-is (simpler, robust) but this
// hook is where we would trim. Icons get their black background square removed
// so they can be used as CSS masks / tinted canvas textures.
function transform(rel, buf) {
  if (rel.startsWith('assets/icons/') && rel.endsWith('.svg')) {
    let s = buf.toString('utf8').replace('<path d="M0 0h512v512H0z"/>', '');
    return Buffer.from(s, 'utf8');
  }
  return buf;
}

function fontFiles() {
  const fonts = [
    ['@fontsource/im-fell-english-sc/files/im-fell-english-sc-latin-400-normal.woff2', 'fonts/fell-sc.woff2'],
    ['@fontsource/im-fell-english/files/im-fell-english-latin-400-normal.woff2', 'fonts/fell.woff2'],
    ['@fontsource/im-fell-english/files/im-fell-english-latin-400-italic.woff2', 'fonts/fell-italic.woff2'],
    ['@fontsource/vt323/files/vt323-latin-400-normal.woff2', 'fonts/vt323.woff2'],
  ];
  return fonts.map(([src, key]) => [path.join(ROOT, 'node_modules', src), key]);
}

function buildPacks() {
  fs.mkdirSync(DATA, { recursive: true });
  for (const f of fs.readdirSync(DATA)) if (f.startsWith('pack-')) fs.unlinkSync(path.join(DATA, f));
  const entries = [];
  for (const abs of walk(path.join(ROOT, 'assets'))) {
    const rel = path.relative(ROOT, abs).split(path.sep).join('/');
    if (rel.startsWith('assets/licenses/')) continue;
    const ext = path.extname(abs).toLowerCase();
    if (!MIME[ext]) continue;
    entries.push([rel, MIME[ext], transform(rel, fs.readFileSync(abs))]);
  }
  for (const [abs, key] of fontFiles()) {
    if (!fs.existsSync(abs)) { console.warn('missing font', abs); continue; }
    entries.push([key, 'font/woff2', fs.readFileSync(abs)]);
  }
  // Pack in ~12MB chunks so no single file is huge.
  const LIMIT = 12 * 1024 * 1024;
  const chunks = [[]]; let size = 0;
  for (const e of entries) {
    const sz = e[2].length * 1.34;
    if (size + sz > LIMIT && chunks[chunks.length - 1].length) { chunks.push([]); size = 0; }
    chunks[chunks.length - 1].push(e); size += sz;
  }
  chunks.forEach((chunk, i) => {
    let js = 'window.__AO_PACK=window.__AO_PACK||{};(function(p){\n';
    for (const [rel, mime, buf] of chunk) js += `p[${JSON.stringify(rel)}]="data:${mime};base64,${buf.toString('base64')}";\n`;
    js += '})(window.__AO_PACK);\n';
    fs.writeFileSync(path.join(DATA, `pack-${i}.js`), js);
  });
  fs.writeFileSync(path.join(DATA, 'packs.js'), `window.__AO_PACKS=${JSON.stringify(chunks.map((_, i) => `data/pack-${i}.js`))};\n`);
  const total = entries.reduce((a, e) => a + e[2].length, 0);
  console.log(`packed ${entries.length} assets (${(total / 1048576).toFixed(1)} MB) into ${chunks.length} pack files`);
}

function copyStatic() {
  fs.mkdirSync(OUT, { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'src', 'index.html'), path.join(OUT, 'index.html'));
  fs.copyFileSync(path.join(ROOT, 'src', 'style.css'), path.join(OUT, 'style.css'));
}

const esopts = {
  entryPoints: [path.join(ROOT, 'src', 'main.js')],
  bundle: true, format: 'iife', target: ['chrome100', 'firefox100', 'safari15'],
  outfile: path.join(OUT, 'game.js'), minify: !watch, sourcemap: false, logLevel: 'info',
  legalComments: 'eof',
};

if (!process.argv.includes('--code-only')) buildPacks();
copyStatic();
if (watch) {
  const ctx = await esbuild.context(esopts);
  await ctx.watch();
  fs.watch(path.join(ROOT, 'src'), (ev, f) => { if (f && /\.(html|css)$/.test(f)) copyStatic(); });
  console.log('watching src/ ...');
} else {
  await esbuild.build(esopts);
}
