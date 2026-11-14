// Run structure: three Depths of branching rooms, shrines, a boss each.
import { DEPTHS, ROOMS_PER_DEPTH, SHRINE_AT, ROOM_TYPES } from '../data/world.js';
import { BOONS, RARITY } from '../data/boons.js';
import { rng } from '../core/rules.js';

export class Run {
  constructor(seed, vows, metaData, partySize) {
    this.seed = seed;
    this.vows = vows;
    this.depthIndex = 0;
    this.roomIndex = 0;
    this.roomType = 'shrine';
    this.embers = (vows.has('ember') ? 1 : 3) + (metaData.has('fourth_ember') ? 1 : 0);
    this.ash = metaData.has('ash_tithe') ? 300 : 0;
    this.checkpoint = { depthIndex: 0, roomIndex: 0 };
    this.remains = null;
    this.roomsCleared = 0; this.bossesSlain = 0; this.elitesSlain = 0;
    this.partySize = partySize;
    this.startTime = Date.now();
    this.history = [];
  }
  get depth() { return DEPTHS[this.depthIndex]; }

  // what kind of rooms lie behind the doors of the current room
  nextChoices() {
    const next = this.roomIndex + 1;
    if (next > ROOMS_PER_DEPTH) return [];
    if (next === ROOMS_PER_DEPTH) return ['boss'];
    if (SHRINE_AT.includes(next)) return ['shrine'];
    const n = rng.chance(0.3) ? 3 : 2;
    const pool = {};
    for (const k in ROOM_TYPES) if (ROOM_TYPES[k].weight) pool[k] = ROOM_TYPES[k].weight;
    if (next <= 1) { delete pool.peddler; delete pool.trial; }
    if (this.vows.has('elite')) pool.elite *= 2;
    const out = [];
    for (let i = 0; i < n; i++) {
      const pick = rng.weighted(pool);
      out.push(pick);
      delete pool[pick];
      if (pick === 'combat') pool.ash = (pool.ash || 0) * 0.5;
    }
    return out;
  }

  advance(type) {
    this.history.push(type);
    this.roomIndex++;
    this.roomType = type;
  }
  nextDepth() {
    this.depthIndex++;
    this.roomIndex = 0;
    this.roomType = 'shrine';
  }
}

// Draft three boons for a hero. minRarity bumps the pool for elites/bosses.
export function draftBoons(hero, { depth = 0, minRarity = null, count = 3, legendaryBoost = 1 } = {}) {
  const order = ['common', 'uncommon', 'rare', 'very_rare', 'legendary'];
  const minI = minRarity ? order.indexOf(minRarity) : 0;
  const weights = {};
  order.forEach((r, i) => {
    if (i < minI) return;
    let w = RARITY[r].weight * (1 + depth * (i >= 2 ? 0.6 : 0));
    if (r === 'legendary') w *= legendaryBoost;
    weights[r] = w;
  });
  const owned = new Set(hero.boons.map((b) => b.id));
  // bias toward pacts the hero already invests in (build-crafting), but keep variety
  const pactCount = {};
  for (const b of hero.boons) pactCount[b.pact] = (pactCount[b.pact] || 0) + 1;
  const picks = [];
  let guard = 0;
  while (picks.length < count && guard++ < 200) {
    const rar = rng.weighted(weights);
    let pool = BOONS.filter((b) => b.rarity === rar && (!owned.has(b.id) || b.stack) && !picks.includes(b));
    if (!pool.length) continue;
    const wmap = {};
    pool.forEach((b, i) => { wmap[i] = 1 + (pactCount[b.pact] || 0) * 0.8; });
    picks.push(pool[+rng.weighted(wmap)]);
  }
  return picks;
}
