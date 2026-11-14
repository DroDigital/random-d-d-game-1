// D&D 5e rules core: dice, ability modifiers, proficiency, attack rolls,
// saving throws, advantage/disadvantage, criticals.
import { RNG } from 'rot-js';

export const rng = {
  seed(s) { RNG.setSeed(s); },
  float() { return RNG.getUniform(); },
  int(a, b) { return RNG.getUniformInt(a, b); },
  pick(arr) { return arr[Math.floor(RNG.getUniform() * arr.length)]; },
  chance(p) { return RNG.getUniform() < p; },
  shuffle(arr) { return RNG.shuffle(arr); },
  weighted(map) { return RNG.getWeightedValue(map); },
};

// cosmetic randomness that must not disturb the seeded run (particles etc.)
export const frand = (a = 0, b = 1) => a + Math.random() * (b - a);

export const mod = (score) => Math.floor((score - 10) / 2);
export const profBonus = (level) => 2 + Math.floor((level - 1) / 4);

export function d(sides) { return rng.int(1, sides); }

// parse "2d6+3", "1d8", "4" ; returns {n, s, b}
export function parseDice(expr) {
  if (typeof expr === 'object') return expr;
  const m = /^(\d*)d(\d+)([+-]\d+)?$/.exec(String(expr).replace(/\s/g, ''));
  if (!m) return { n: 0, s: 0, b: parseInt(expr, 10) || 0 };
  return { n: m[1] ? parseInt(m[1], 10) : 1, s: parseInt(m[2], 10), b: m[3] ? parseInt(m[3], 10) : 0 };
}

export function rollDice(expr, { crit = false, maxDice = false, rerollLow = false, savage = false } = {}) {
  const p = parseDice(expr);
  const n = crit ? p.n * 2 : p.n;
  const once = () => {
    let total = 0;
    for (let i = 0; i < n; i++) {
      let r = maxDice ? p.s : d(p.s);
      if (rerollLow && r <= 2) r = d(p.s);
      total += r;
    }
    return total;
  };
  let t = once();
  if (savage) t = Math.max(t, once());
  return Math.max(0, t + p.b);
}

export function avgDice(expr) {
  const p = parseDice(expr);
  return p.n * (p.s + 1) / 2 + p.b;
}

// d20 with advantage (+1) / disadvantage (-1) / straight (0)
export function d20(adv = 0) {
  const a = d(20);
  if (adv === 0) return { roll: a, rolls: [a] };
  const b = d(20);
  return { roll: adv > 0 ? Math.max(a, b) : Math.min(a, b), rolls: [a, b] };
}

export function netAdvantage(advSources, disSources) {
  if (advSources > 0 && disSources > 0) return 0; // 5e: they cancel out
  if (advSources > 0) return 1;
  if (disSources > 0) return -1;
  return 0;
}

// Resolve an attack roll. Returns {hit, crit, fumble, roll, total, rolls}
export function attackRoll({ bonus, ac, adv = 0, critRange = 20, luckyReroll = null }) {
  let r = d20(adv);
  let total = r.roll + bonus;
  let hit = r.roll === 20 || (r.roll !== 1 && total >= ac);
  // Lucky feat / luck blade: reroll a miss once
  if (!hit && luckyReroll && luckyReroll()) {
    const r2 = d20(adv);
    r = { roll: r2.roll, rolls: r.rolls.concat(['↻', ...r2.rolls]), lucky: true };
    total = r.roll + bonus;
    hit = r.roll === 20 || (r.roll !== 1 && total >= ac);
  }
  const crit = hit && r.roll >= critRange;
  return { hit, crit, fumble: r.roll === 1, roll: r.roll, total, rolls: r.rolls, lucky: !!r.lucky };
}

export function savingThrow({ bonus, dc, adv = 0, autoSucceed = false }) {
  const r = d20(adv);
  const total = r.roll + bonus;
  const success = autoSucceed || r.roll === 20 || (r.roll !== 1 && total >= dc);
  return { success, roll: r.roll, total, rolls: r.rolls };
}

// 5e CR -> XP, we pay Ash (souls-like currency/XP) from this table
export const CR_XP = { 0: 10, 0.125: 25, 0.25: 50, 0.5: 100, 1: 200, 2: 450, 3: 700, 4: 1100, 5: 1800, 6: 2300, 8: 3900, 10: 5900, 13: 10000 };

// Ash required to reach level N+1 from level N (souls-like, paid at Ember Shrines)
export const LEVEL_COST = [0, 200, 420, 700, 1050, 1500, 2000, 2600, 3300, 4100, 99999];
export const MAX_LEVEL = 10;

export const DAMAGE_TYPES = ['slashing', 'piercing', 'bludgeoning', 'fire', 'cold', 'radiant', 'necrotic', 'thunder', 'lightning', 'force', 'poison', 'psychic'];
