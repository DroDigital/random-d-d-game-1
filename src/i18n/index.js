// Localization: English source strings are the keys; each language maps them
// to a translation. Long texts use short ids (see EN below). Missing entries
// fall back to English, so the game never shows a blank.
import de from './de.js';
import es from './es.js';
import fr from './fr.js';
import zh from './zh.js';
import ja from './ja.js';

export const LANGUAGES = [
  { id: 'en', name: 'English' },
  { id: 'de', name: 'Deutsch' },
  { id: 'es', name: 'Español' },
  { id: 'fr', name: 'Français' },
  { id: 'zh', name: '简体中文' },
  { id: 'ja', name: '日本語' },
];

// English text for id-keyed strings (long paragraphs, ambiguous short words)
const EN = {
  'help.souls1': 'Every swing and roll costs <b>stamina</b>. Dodging grants brief invulnerability. Foes <b>telegraph</b> attacks with red ground markings — roll through them. Heavy hits build <b>poise</b> damage; staggered foes take advantage and crit on 18+.',
  'help.souls2': "Fall to 0 HP and you're <b>downed</b>: make death saves while an ally holds Interact to revive you. If the whole party falls, an <b>Ember</b> is spent and you rekindle at the last shrine — but your <b>Ash</b> stays where you died.",
  'help.dnd': 'Every attack is a real <b>d20 + bonus vs AC</b>. Natural 20s crit, natural 1s fumble. Advantage from flanking (an ally on the far side), backstabs, staggers, Hunter\'s Mark. Area spells call for <b>saving throws</b>. Damage types, resistances and vulnerabilities matter: skeletons shatter to bludgeoning, shades shrug off steel.',
  'help.rogue': "Choose your path through branching doors: battles, elites, vaults, peddlers, the Dicer's Altar. Draft <b>boons</b> — feats, magic items, spell-pacts — after each fight. Three boons of one pact = <b>Attunement</b>. Two players with two each = a <b>Pact Bond</b> both enjoy. Spend Ash at <b>Ember Shrines</b> to level up (1–10). Earn Oath Marks for permanent unlocks, swear Vows for a harder climb.",
  'credits.game': '<b>Ashen Oath</b> — game design, code, shaders and the "Ashcore" PSX filter written for this project.',
  'credits.srd': 'Dungeons & Dragons 5e mechanics are referenced under the SRD 5.1 (CC BY 4.0). Not affiliated with Wizards of the Coast.',
  'altar.rules': 'Roll the d20. <b>1</b>: a curse. <b>2–9</b>: Ash. <b>10–17</b>: a boon. <b>18–19</b>: a rare boon. <b>20</b>: legendary.',
  'select.howto': 'Each player presses <b>Attack</b> on their keyboard half or gamepad to join. ◂ ▸ class · ▴ ▾ colours · Attack to ready · Back to leave',
};

const DICTS = { de, es, fr, zh, ja };
let lang = 'en';

export function setLang(l) {
  lang = LANGUAGES.some((x) => x.id === l) ? l : 'en';
  document.documentElement.lang = lang === 'zh' ? 'zh-Hans' : lang;
  document.documentElement.classList.toggle('cjk', lang === 'zh' || lang === 'ja');
}
export function getLang() { return lang; }

export function detectLang() {
  const nav = (navigator.languages && navigator.languages[0]) || navigator.language || 'en';
  const code = nav.toLowerCase().slice(0, 2);
  return LANGUAGES.some((x) => x.id === code) ? code : 'en';
}

// t('Runs {0} · Victories {1}', runs, wins)
export function t(key, ...args) {
  if (key === undefined || key === null) return '';
  const d = DICTS[lang];
  let s = (d && d[key]) || EN[key] || key;
  if (args.length) s = s.replace(/\{(\d)\}/g, (m, i) => (args[+i] !== undefined ? args[+i] : m));
  return s;
}

// every key the game uses, for tooling (tools/i18n-check.mjs)
export function dictionaries() { return { EN, ...DICTS }; }

// font stack helper for canvas text
export function canvasFont(px) {
  const cjk = lang === 'ja' ? '"Ashen JP", "Hiragino Sans", "Yu Gothic", "Meiryo", "Noto Sans CJK JP"' : '"Ashen SC", "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC"';
  return `${px}px VT323, ${cjk}, sans-serif`;
}
