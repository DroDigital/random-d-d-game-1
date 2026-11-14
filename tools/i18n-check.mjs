// Collects every translatable string (t('...') calls, on-screen literals and
// game data) and reports which ones each language is missing.
//   node tools/i18n-check.mjs            -> summary
//   node tools/i18n-check.mjs --keys     -> write all keys to i18n-keys.json
//   node tools/i18n-check.mjs --missing de
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);

const keys = new Set();
const add = (s) => { if (typeof s === 'string' && s.trim() && !/^[\d\s+\-.%/✦✓✗]*$/.test(s)) keys.add(s); };

// 1) literals in source
const LIT = /(?:\bt|fx\.text|\.text|banner|toast|roomTitle|opt|row)\(\s*(['"])((?:\\.|(?!\1).)*)\1/g;
const LIT2 = /(?:label|text|title|sub):\s*(['"])((?:\\.|(?!\1).)*)\1/g;
function walk(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)])); }
for (const f of walk(path.join(ROOT, 'src'))) {
  if (!f.endsWith('.js') || f.includes(`${path.sep}i18n${path.sep}`)) continue;
  const src = fs.readFileSync(f, 'utf8');
  for (const re of [LIT, LIT2]) for (const m of src.matchAll(re)) {
    const v = m[2].replace(/\\'/g, "'").replace(/\\"/g, '"');
    if (/^[a-z_]+$/.test(v) && !['on', 'off', 'miss', 'hit', 'adv', 'dis', 'save', 'success', 'fail', 'choose', 'confirm', 'close', 'reroll', 'for {0}'].includes(v)) continue; // ids
    if (v.startsWith('assets/') || v.startsWith('music/') || v.endsWith('.png')) continue;
    add(v);
  }
}

// 2) game data
const { CLASSES } = await imp('src/data/classes.js');
for (const c of Object.values(CLASSES)) { add(c.name); add(c.title); add(c.blurb); c.skills.forEach((s) => { add(s.name); add(s.desc); }); Object.values(c.features).forEach(add); }
const { BOONS, RARITY, PACTS, SHOP_ITEMS } = await imp('src/data/boons.js');
BOONS.forEach((b) => { add(b.name); add(b.desc); });
Object.values(RARITY).forEach((r) => add(r.name));
Object.values(PACTS).forEach((p) => { add(p.name); add(p.attune); });
SHOP_ITEMS.forEach((s) => { add(s.name); add(s.desc); });
const { DEPTHS, ROOM_TYPES, VOWS, UNLOCKS } = await imp('src/data/world.js');
DEPTHS.forEach((d) => { add(d.name); add(d.sub); });
Object.values(ROOM_TYPES).forEach((r) => { add(r.name); add(r.desc); });
VOWS.forEach((v) => { add(v.name); add(v.desc); });
UNLOCKS.forEach((u) => { add(u.name); add(u.desc); });
const { ENEMIES, BOSSES, AFFIXES } = await imp('src/data/enemies.js');
Object.values(ENEMIES).forEach((e) => add(e.name));
Object.values(BOSSES).forEach((b) => { add(b.name); add(b.title); });
Object.values(AFFIXES).forEach((a) => { add(a.name); add(a.desc); });
// 3) things composed at runtime
['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA', 'RAGE', 'ACTION SURGE', 'SLOWED', 'POISONED', 'FRIGHTENED', 'HEXED', 'PRONE', 'HIDDEN', 'ALERT', 'WHIRL', 'RECKLESS',
  'FUMBLED', 'DASH', 'CHILLED', 'FROZEN', 'EXHAUSTED', 'Keyboard (left)', 'Keyboard (right)', 'Gamepad {0}', 'slashing', 'piercing', 'bludgeoning', 'fire', 'cold',
  'radiant', 'necrotic', 'thunder', 'lightning', 'force', 'poison', 'psychic', 'acid', 'on', 'off', 'miss', 'hit', 'adv', 'dis', 'save', 'success', 'fail',
  'choose', 'confirm', 'close', 'reroll', 'for {0}', 'Move', 'Attack', 'Heavy attack', 'Dodge roll', 'Skill 1', 'Skill 2', 'Potion', 'Interact / revive', 'Language',
  'SAVED', 'FAILED', 'IMMUNE', '{0} Ember remains. Your Ash lies where you fell.', '{0} Embers remain. Your Ash lies where you fell.', 'Flawless', 'Room Cleared', 'More foes rise!', 'The party rests. Checkpoint kindled.', 'THE WYRM ASCENDS', 'THE COLOSSUS CRACKS', 'DEATH ANSWERS', 'help.souls1', 'help.souls2', 'help.dnd', 'help.rogue', 'credits.game', 'credits.srd', 'altar.rules', 'select.howto', 'Depth I', 'Depth II', 'Depth III'].forEach(add);

const { dictionaries } = await imp('src/i18n/index.js').catch(() => ({ dictionaries: null }));
const all = [...keys].sort();
if (process.argv.includes('--keys')) { fs.writeFileSync(path.join(ROOT, 'i18n-keys.json'), JSON.stringify(all, null, 1)); console.log(all.length, 'keys written'); }
if (dictionaries) {
  const d = dictionaries();
  const want = process.argv[process.argv.indexOf('--missing') + 1];
  for (const lang of ['de', 'es', 'fr', 'zh', 'ja']) {
    const miss = all.filter((k) => !(d[lang] && d[lang][k]));
    const extra = Object.keys(d[lang] || {}).filter((k) => !keys.has(k));
    console.log(`${lang}: ${all.length - miss.length}/${all.length} translated${extra.length ? `, ${extra.length} unused` : ''}`);
    if (want === lang) console.log(miss.join('\n'));
  }
}
