// Room dressing: themed set dressing per depth, placed where it belongs.
//  - wall props hug the wall and face into the room (bookcases, coffins, crystals)
//  - corner set pieces fill the corners (coffin altars, giant mushrooms, crystal pillars)
//  - small floor clutter never blocks movement (bones, candles, coins, mushrooms)
//  - clusters of breakables (urns, pots, crates, barrels) and powder kegs sit
//    against walls and in corners, never in a doorway or the middle lane
//  - traps per depth: saw blades and spikes (crypt), spore pods and webs
//    (ossuary), flame vents and lava (abyss)
// Static pieces go into the instanced kit batch; anything interactive is
// returned as a spec in room.dynamic for the Hazards system to build.
import { RNG } from 'rot-js';

const CELL = 4;
const SIDE = { N: { di: 0, dj: -1, rot: 0 }, S: { di: 0, dj: 1, rot: Math.PI }, W: { di: -1, dj: 0, rot: Math.PI / 2 }, E: { di: 1, dj: 0, rot: -Math.PI / 2 } };
const R = () => RNG.getUniform();
const RI = (a, b) => RNG.getUniformInt(a, b);
const pickW = (list) => { let t = 0; for (const x of list) t += x.w ?? 1; let r = R() * t; for (const x of list) { r -= x.w ?? 1; if (r <= 0) return x; } return list[list.length - 1]; };
const sc = (s) => Array.isArray(s) ? s[0] + R() * (s[1] - s[0]) : (s ?? 1);

// glow presets (emissive tint on the prop's own texture + an optional halo)
const G = {
  candle: { color: 0xffb060, k: 0.35, halo: 0xffa050 },
  fire: { color: 0xff7a2a, k: 0.7, halo: 0xff6a1a },
  spore: { color: 0x7dff6a, k: 0.75, halo: 0x6aff5a },
  ghost: { color: 0x8fd0ff, k: 0.7, halo: 0x7ac8ff },
  crystalV: { color: 0xc070ff, k: 0.85, halo: 0xb060ff },
  crystalO: { color: 0xff8a3a, k: 0.85, halo: 0xff7a2a },
  gold: { color: 0xffd060, k: 0.25 },
};

// n: piece, w: weight, s: scale (or [min,max]), off: distance from the wall plane,
// r: collision radius (0 = walk-through), flat: a sprite-card that should face the camera,
// turn: extra yaw (e.g. lay a coffin along the wall), glow: preset, y: height
const THEMES = {
  crypt: {
    wall: [
      { n: 'hw:coffin', w: 2.2, s: 0.8, off: 1.0, r: 1.1, turn: Math.PI / 2 },
      { n: 'bookcase_single_decoratedA', w: 1.6, off: 0.55, r: 0.9 },
      { n: 'bookcase_single_decoratedB', w: 1.2, off: 0.55, r: 0.9 },
      { n: 'bookcase_double_decoratedA', w: 0.8, off: 0.6, r: 1.4 },
      { n: 'hw:grave_A', w: 1.2, s: 0.85, off: 0.6, r: 0.9 },
      { n: 'hw:grave_B', w: 1.0, s: 0.85, off: 0.6, r: 0.9 },
      { n: 'hw:gravestone', w: 1.2, s: 0.95, off: 0.45, r: 0.7 },
      { n: 'hw:plaque_candles', w: 1.0, s: 0.75, off: 0.8, r: 0.8, glow: 'candle' },
      { n: 'hw:skull_candle', w: 1.0, s: 0.75, off: 0.6, r: 0.5, glow: 'candle' },
      { n: 'px:statue_on_pedestal', w: 0.7, s: 2.8, off: 0.5, r: 0.8, flat: true },
      { n: 'px:gargoyle_statue', w: 0.6, s: 2.2, off: 0.5, r: 0.8, flat: true },
      { n: 'hw:lantern_standing', w: 0.8, s: 1.1, off: 0.5, r: 0.4, glow: 'candle' },
      { n: 'sword_shield', w: 0.6, off: 0.4, r: 0.5 },
      { n: 'table_medium_broken', w: 0.6, off: 0.9, r: 1.0 },
      { n: 'shelf_small_candles', w: 0.8, off: 0.35, r: 0, y: 1.4, glow: 'candle' },
    ],
    corner: [
      { n: 'hw:coffin_decorated', w: 1.5, s: 0.8, r: 1.2 },
      { n: 'hw:shrine_candles', w: 1.4, s: 1.0, r: 0.7, glow: 'candle' },
      { n: 'bookcase_double_decoratedA', w: 0.8, r: 1.2 },
      { n: 'px:spider_web', w: 1.2, s: 2.6, r: 0, flat: true, y: 0.6 },
      { n: 'hw:post_skull', w: 0.7, s: 0.85, r: 0.5 },
    ],
    floor: [
      { n: 'hw:bone_A', w: 2, s: [1.5, 2.1] }, { n: 'hw:bone_B', w: 2, s: [1.5, 2.1] }, { n: 'hw:bone_C', w: 1.5, s: [1.3, 1.8] },
      { n: 'hw:skull', w: 1.4, s: [0.8, 1.0] }, { n: 'hw:ribcage', w: 1, s: [1.4, 1.8] }, { n: 'hw:candle_melted', w: 1.2, s: 1.5, glow: 'candle' },
      { n: 'candle_thin_lit', w: 0.8, s: 1.4, glow: 'candle' }, { n: 'coin_stack_small', w: 0.6, s: 1.2 }, { n: 'rocks_small', w: 1.2, s: [0.7, 1] },
    ],
    breakables: [{ n: 'px:urn', w: 3, s: 1.25 }, { n: 'px:vase', w: 2, s: 1.3 }, { n: 'px:lidded_urn', w: 2, s: 1.2 }, { n: 'barrel_small', w: 1.2, s: 0.9 }, { n: 'crate_small', w: 1.2, s: 0.9 }, { n: 'box_small', w: 1, s: 0.9 }],
    pillar: [{ n: 'hw:candle_triple', w: 2, s: 1.4, glow: 'candle' }, { n: 'hw:skull_candle', w: 1.2, s: 0.8, glow: 'candle' }, { n: 'hw:candle_melted', w: 1.5, s: 1.5, glow: 'candle' }, { n: 'hw:bone_A', w: 1, s: 1.8 }, { n: 'hw:skull', w: 1, s: 0.9 }],
    kegs: [0, 2], traps: ['saw', 'spikes'], walls: { wall_inset_shelves_decoratedA: 0.06, wall_inset_shelves_decoratedB: 0.05, wall_gated: 0.05, wall_archedwindow_gated: 0.04 },
    floors: { quad: ['floor_tile_small_decorated', 'floor_tile_small_broken_B', 'floor_tile_small_broken_A', 'floor_tile_small_weeds_A'], large: ['floor_tile_large_rocks'] },
  },
  ossuary: {
    wall: [
      { n: 'px:glowcap_mushroom', w: 1.6, s: [1.6, 2.2], off: 0.6, r: 0.5, flat: true, glow: 'spore' },
      { n: 'px:lantern_mushroom', w: 1.0, s: [1.6, 2.0], off: 0.6, r: 0.5, flat: true, glow: 'spore' },
      { n: 'px:bracket_fungus', w: 1.0, s: 1.3, off: 0.25, r: 0, flat: true, y: 1.5, glow: 'spore' },
      { n: 'hw:ribcage', w: 1.2, s: [1.6, 2.2], off: 0.8, r: 0.8 },
      { n: 'hw:skull', w: 0.8, s: [1.2, 1.6], off: 0.7, r: 0.7 },
      { n: 'bucket_pickaxes', w: 1.0, off: 0.6, r: 0.5 },
      { n: 'barrel_small_stack', w: 1.0, off: 0.7, r: 0.9 },
      { n: 'keg_decorated', w: 0.8, off: 0.7, r: 0.8 },
      { n: 'crates_stacked', w: 1.0, off: 0.8, r: 1.0 },
      { n: 'box_large', w: 0.8, off: 0.7, r: 0.8 },
      { n: 'shelves_decorated', w: 0.8, off: 0.5, r: 0.9 },
      { n: 'table_long_broken', w: 0.5, off: 1.0, r: 1.1 },
      { n: 'px:ore_filled_mine_cart', w: 0.8, s: 1.9, off: 0.7, r: 0.8, flat: true },
      { n: 'pickaxe', w: 0.6, off: 0.5, r: 0 },
    ],
    corner: [
      { n: 'px:lantern_mushroom', w: 1.4, s: [2.6, 3.3], r: 0.7, flat: true, glow: 'spore' },
      { n: 'px:glowcap_mushroom', w: 1.4, s: [2.6, 3.3], r: 0.7, flat: true, glow: 'ghost' },
      { n: 'px:spider_web', w: 1.2, s: 2.6, r: 0, flat: true, y: 0.6 },
      { n: 'crates_stacked', w: 1, r: 1.1 },
      { n: 'rocks_decorated', w: 1, r: 1.1 },
    ],
    floor: [
      { n: 'hw:bone_A', w: 2, s: [1.5, 2.1] }, { n: 'hw:bone_C', w: 1.5, s: [1.3, 1.8] }, { n: 'hw:skull', w: 1.2, s: [0.8, 1.0] }, { n: 'hw:ribcage', w: 0.8, s: [1.4, 1.8] },
      { n: 'px:mushroom_cluster', w: 1.8, s: [1.2, 1.6], flat: true, glow: 'spore' }, { n: 'px:shadowcap_mushroom', w: 1.2, s: [1.1, 1.5], flat: true, glow: 'ghost' }, { n: 'px:skull_mushroom', w: 0.8, s: [1.1, 1.4], flat: true, glow: 'spore' },
      { n: 'rocks_small', w: 1.5, s: [0.7, 1] },
    ],
    breakables: [{ n: 'px:storage_pot', w: 2.5, s: 1.3 }, { n: 'px:crock', w: 1.5, s: 1.4, flat: true }, { n: 'barrel_small', w: 1.5, s: 0.9 }, { n: 'crate_small', w: 1.5, s: 0.9 }, { n: 'px:urn', w: 1, s: 1.2 }],
    pillar: [{ n: 'px:mushroom_cluster', w: 2, s: [1.2, 1.6], flat: true, glow: 'spore' }, { n: 'px:glowcap_mushroom', w: 1.2, s: [1.2, 1.6], flat: true, glow: 'ghost' }, { n: 'hw:ribcage', w: 1, s: 1.6 }, { n: 'hw:skull', w: 1, s: 0.9 }, { n: 'hw:bone_C', w: 1, s: 1.6 }],
    kegs: [0, 2], traps: ['pods', 'webs', 'spikes'], walls: { wall_inset_shelves_broken: 0.06, wall_shelves: 0.05 },
    floors: { large: ['floor_dirt_large'], quad: ['floor_dirt_small_weeds', 'floor_tile_small_weeds_B', 'floor_tile_small_broken_B'] },
  },
  abyss: {
    wall: [
      { n: 'px:crystal_cluster', w: 1.6, s: [1.8, 2.6], off: 0.6, r: 0.6, flat: true, glow: 'crystalV' },
      { n: 'px:crystal_formation', w: 1.4, s: [2.2, 3.0], off: 0.6, r: 0.7, flat: true, glow: 'crystalO' },
      { n: 'px:obsidian_shard', w: 1.2, s: [1.8, 2.6], off: 0.6, r: 0.6, flat: true },
      { n: 'px:brazier', w: 1.2, s: 2.0, off: 0.7, r: 0.6, flat: true, glow: 'fire' },
      { n: 'px:smelting_furnace', w: 0.6, s: 2.4, off: 0.6, r: 0.8, flat: true, glow: 'fire' },
      { n: 'px:burning_log', w: 0.6, s: 1.3, off: 0.8, r: 0.6, glow: 'fire' },
      { n: 'coin_stack_medium', w: 1.0, off: 0.7, r: 0, glow: 'gold' },
      { n: 'rocks_gold', w: 1.0, off: 0.7, r: 0.7, glow: 'gold' },
      { n: 'chest_large_gold', w: 0.4, off: 0.8, r: 1.0, glow: 'gold' },
      { n: 'sword_shield_gold', w: 0.6, off: 0.4, r: 0.5, glow: 'gold' },
      { n: 'px:statue_on_pedestal', w: 0.6, s: 2.8, off: 0.5, r: 0.8, flat: true },
      { n: 'px:jar_of_embers', w: 0.8, s: 1.3, off: 0.6, r: 0.4, flat: true, glow: 'fire' },
    ],
    corner: [
      { n: 'px:crystal_pillar', w: 2, s: [1.6, 2.2], r: 1.0, glow: 'crystalV' },
      { n: 'px:crystal_formation', w: 1.2, s: [3, 3.8], r: 0.8, flat: true, glow: 'crystalO' },
      { n: 'coin_stack_large', w: 0.8, r: 0.9, glow: 'gold' },
      { n: 'rocks_decorated', w: 0.8, r: 1.1 },
    ],
    floor: [
      { n: 'coin_stack_small', w: 1.4, s: 1.2, glow: 'gold' }, { n: 'rocks_small', w: 1.6, s: [0.7, 1] }, { n: 'hw:skull', w: 1, s: [0.8, 1.0] },
      { n: 'hw:bone_B', w: 1.2, s: [1.5, 2.1] }, { n: 'px:crystal_spike', w: 1.4, s: [1.2, 1.7], flat: true, glow: 'crystalV' }, { n: 'candle_melted', w: 0.8, s: 1.5, glow: 'candle' }
    ],
    breakables: [{ n: 'px:urn', w: 2, s: 1.25 }, { n: 'px:lidded_urn', w: 2, s: 1.2 }, { n: 'px:vase', w: 1.5, s: 1.3 }, { n: 'box_small_decorated', w: 1, s: 0.9 }, { n: 'barrel_small', w: 1, s: 0.9 }],
    pillar: [{ n: 'px:crystal_spike', w: 2, s: [1.3, 1.8], flat: true, glow: 'crystalV' }, { n: 'px:crystal_cluster', w: 1.2, s: [1.2, 1.6], flat: true, glow: 'crystalO' }, { n: 'coin_stack_small', w: 1, s: 1.2, glow: 'gold' }, { n: 'px:jar_of_embers', w: 0.8, s: 1.1, flat: true, glow: 'fire' }],
    kegs: [1, 3], traps: ['vents', 'lava'], walls: { wall_archedwindow_gated: 0.05, wall_gated: 0.05 },
    floors: { quad: ['floor_tile_small_decorated', 'floor_tile_small_broken_A', 'floor_tile_small_broken_B'] },
  },
};
export const DEPTH_THEMES = THEMES;

// Per room kind: how much of each layer
const DENSITY = {
  combat: { wall: 0.8, corner: 0.95, floor: 0.3, band: 0.7, clusters: [2, 4], traps: true, kegs: true },
  boss: { wall: 0.7, corner: 1, floor: 0.2, band: 0.6, clusters: [1, 2], traps: true, kegs: false },
  shrine: { wall: 0.75, corner: 1, floor: 0.3, band: 0.7, clusters: [1, 2], traps: false, kegs: false },
  peddler: { wall: 0.8, corner: 1, floor: 0.25, band: 0.6, clusters: [2, 3], traps: false, kegs: false },
  altar: { wall: 0.75, corner: 1, floor: 0.3, band: 0.7, clusters: [1, 2], traps: false, kegs: false },
};

export function wallVariant(theme, r) {
  // themed alternatives mixed into the base wall roll
  let acc = 0;
  for (const [name, p] of Object.entries(theme.walls || {})) { acc += p; if (r < acc) return name; }
  return null;
}

export function dressRoom(room, kit, depthDef, wallEdges) {
  const theme = THEMES[depthDef.id];
  room.dynamic = [];
  room.colliders = room.colliders || [];

  if (!theme) return;
  const D = DENSITY[room.kind] || DENSITY.combat;
  const used = new Set();            // "i,j" cells that already carry a blocking prop
  const key = (i, j) => i + ',' + j;
  const doorCells = [...room.doors, room.entrance];
  const nearDoor = (i, j, d = 1) => doorCells.some((e) => Math.abs(e.i - i) <= d && Math.abs(e.j - j) <= d);
  const centre = { i: Math.floor(room.w / 2), j: Math.floor(room.h / 2) };
  const nearCentre = (i, j, d) => Math.abs(i - centre.i) <= d && Math.abs(j - centre.j) <= d;
  const spikes = new Set(room.spikes.map((s) => key(s.i, s.j)));
  const free = (i, j) => room.isFloor(i, j) && !spikes.has(key(i, j)) && !used.has(key(i, j));
  const calm = room.kind !== 'combat';
  const centreKeep = room.kind === 'combat' ? 0 : 1; // shrine fire, altar, peddler, boss spawn

  const place = (spec, x, z, rot, extraY = 0) => {
    const s = sc(spec.s);
    const yaw = spec.flat ? (R() - 0.5) * 0.5 : rot + (spec.turn || 0) + (R() - 0.5) * 0.25;
    const glow = spec.glow ? G[spec.glow] : null;
    kit.place(spec.n, x, (spec.y || 0) + extraY, z, yaw, s, null, glow ? { color: glow.color, k: glow.k } : null);
    if (spec.r) room.colliders.push({ x, z, r: spec.r * (Array.isArray(spec.s) ? s / ((spec.s[0] + spec.s[1]) / 2) : 1), on: true });
    if (glow && glow.halo) room.halos.push({ x, y: (spec.y || 0) + Math.max(0.6, s * 0.6), z, color: glow.halo, size: Math.min(3.2, 1.2 + s * 0.5) });
  };
  room.halos = [];

  // ---- corners: two perpendicular walls
  const corners = [];
  for (let j = 0; j < room.h; j++) for (let i = 0; i < room.w; i++) {
    if (!room.isFloor(i, j) || nearDoor(i, j)) continue;
    const n = room.get(i, j - 1) === 1, s = room.get(i, j + 1) === 1, w = room.get(i - 1, j) === 1, e = room.get(i + 1, j) === 1;
    if (s) continue; // keep the camera-side wall clear of tall props
    if (n && w) corners.push({ i, j, dx: -1, dz: -1 });
    if (n && e) corners.push({ i, j, dx: 1, dz: -1 });
  }
  for (const c of corners) {
    if (R() > D.corner || !free(c.i, c.j)) continue;
    const p = room.toWorld(c.i, c.j);
    const spec = pickW(theme.corner);
    place(spec, p.x + c.dx * 1.0, p.z + c.dz * 1.0, Math.atan2(-c.dx, -c.dz) + Math.PI);
    if (spec.r) used.add(key(c.i, c.j));
  }

  // ---- wall props (north / east / west walls; the south wall is the low camera side)
  const slots = wallEdges.filter((e) => !e.isDoor && !e.banner && e.s !== 'S' && !nearDoor(e.i, e.j) && room.isFloor(e.i, e.j));
  // keep every 3rd edge free for the torch sconces placed by buildRoom
  const torchy = new Set(); let k = 0;
  for (const e of wallEdges) { if (e.isDoor || e.s === 'S') continue; k++; if (k % 3 === 1) torchy.add(e); }
  const clusterSlots = [];
  for (const e of slots) {
    if (!free(e.i, e.j) || (centreKeep && nearCentre(e.i, e.j, 1))) continue;
    if (R() > D.wall) { clusterSlots.push(e); continue; }
    const sd = SIDE[e.s], p = room.toWorld(e.i, e.j);
    const spec = pickW(theme.wall);
    const off = CELL / 2 - (spec.off ?? 0.6);
    const lat = (R() - 0.5) * (torchy.has(e) ? 0.6 : 1.6);
    const x = p.x + sd.di * off + (sd.di ? 0 : lat), z = p.z + sd.dj * off + (sd.dj ? 0 : lat);
    place(spec, x, z, sd.rot);
    if (spec.r >= 0.8) used.add(key(e.i, e.j));
    // a small companion piece at its foot (candles by a coffin, a skull by a bookcase...)
    if (R() < 0.6) {
      const f = pickW(theme.floor);
      const side = R() < 0.5 ? -1 : 1, l2 = lat + side * (1.1 + R() * 0.5);
      place({ ...f, r: 0 }, p.x + sd.di * (off - 0.6) + (sd.di ? 0 : l2), p.z + sd.dj * (off - 0.6) + (sd.dj ? 0 : l2), R() * 6.28);
    }
  }
  // debris collects along every wall (including the low south wall)
  for (const e of wallEdges) {
    if (e.isDoor || nearDoor(e.i, e.j, 0) || !room.isFloor(e.i, e.j) || R() > (D.band ?? 0.6)) continue;
    const sd = SIDE[e.s], p = room.toWorld(e.i, e.j);
    const f = pickW(theme.floor);
    const lat = (R() - 0.5) * 3.2, off = CELL / 2 - 0.5 - R() * 0.5;
    place({ ...f, r: 0 }, p.x + sd.di * off + (sd.di ? 0 : lat), p.z + sd.dj * off + (sd.dj ? 0 : lat), R() * 6.28);
  }

  // ---- set dressing round the base of pillars and columns
  for (const b of room.blockers) {
    if (!theme.pillar || !/^(pillar|column)/.test(b.prop)) continue;
    const p = room.toWorld(b.i, b.j);
    const n = RI(2, 3), a0 = R() * 6.28;
    for (let q = 0; q < n; q++) { const a = a0 + q * (6.28 / n) + (R() - 0.5) * 0.6, d = 1.35 + R() * 0.35; place({ ...pickW(theme.pillar), r: 0 }, p.x + Math.cos(a) * d, p.z + Math.sin(a) * d, R() * 6.28); }
  }

  // ---- breakable clusters and powder kegs, against walls in otherwise empty slots
  const nClusters = RI(D.clusters[0], D.clusters[1]);
  RNG.shuffle(clusterSlots);
  let kegs = D.kegs ? RI(theme.kegs[0], theme.kegs[1]) : 0;
  for (let c = 0; c < nClusters && clusterSlots.length; c++) {
    const e = clusterSlots.pop();
    if (!free(e.i, e.j)) continue;
    const sd = SIDE[e.s], p = room.toWorld(e.i, e.j);
    const n = RI(2, 4);
    for (let q = 0; q < n; q++) {
      const along = (q - (n - 1) / 2) * 1.05 + (R() - 0.5) * 0.3;
      const depth = 0.8 + (q % 2) * 0.5 + R() * 0.3;
      const x = p.x + sd.di * (CELL / 2 - depth) + (sd.di ? 0 : along);
      const z = p.z + sd.dj * (CELL / 2 - depth) + (sd.dj ? 0 : along);
      if (kegs > 0 && q === n - 1 && R() < 0.7) { room.dynamic.push({ type: 'keg', x, z, rot: R() * 6.28 }); kegs--; continue; }
      const b = pickW(theme.breakables);
      room.dynamic.push({ type: 'breakable', name: b.n, x, z, rot: b.flat ? (R() - 0.5) * 0.5 : R() * 6.28, s: sc(b.s) * (0.9 + R() * 0.2) });
    }
    used.add(key(e.i, e.j));
  }
  // leftover kegs stand alone near a wall
  while (kegs-- > 0 && clusterSlots.length) {
    const e = clusterSlots.pop(); if (!free(e.i, e.j)) continue;
    const sd = SIDE[e.s], p = room.toWorld(e.i, e.j);
    room.dynamic.push({ type: 'keg', x: p.x + sd.di * 1.1, z: p.z + sd.dj * 1.1, rot: R() * 6.28 });
    used.add(key(e.i, e.j));
  }

  // ---- floor clutter (walk-through)
  for (const [i, j] of room.floorCells()) {
    if (nearDoor(i, j, 0) || (centreKeep && nearCentre(i, j, 1))) continue;
    const edge = Math.min(i, j, room.w - 1 - i, room.h - 1 - j);
    if (R() > D.floor * (edge <= 1 ? 1.6 : edge === 2 ? 0.9 : 0.45)) continue;
    const p = room.toWorld(i, j);
    const spec = pickW(theme.floor.filter((f) => (f.w ?? 1) > 0));
    place({ ...spec, r: 0 }, p.x + (R() - 0.5) * 2.8, p.z + (R() - 0.5) * 2.8, R() * 6.28);
  }

  // ---- traps
  if (!D.traps) return;
  const open = room.floorCells().filter(([i, j]) => free(i, j) && !nearDoor(i, j, 1) && !nearCentre(i, j, centreKeep ? 2 : 0));
  const take = () => open.length ? open.splice(RI(0, open.length - 1), 1)[0] : null;
  const boss = room.kind === 'boss';
  for (const trap of theme.traps) {
    if (trap === 'saw' && !boss && R() < 0.7) {
      // a blade that runs back and forth along a groove, 2-3 cells long
      for (let tries = 0; tries < 12; tries++) {
        const c = take(); if (!c) break;
        const horiz = R() < 0.5, len = RI(2, 3);
        let ok = true;
        for (let s = 1; s <= len; s++) { const ci = c[0] + (horiz ? s : 0), cj = c[1] + (horiz ? 0 : s); if (!free(ci, cj) || nearDoor(ci, cj, 1)) { ok = false; break; } }
        if (!ok) continue;
        const a = room.toWorld(c[0], c[1]), b = room.toWorld(c[0] + (horiz ? len : 0), c[1] + (horiz ? 0 : len));
        room.dynamic.push({ type: 'saw', ax: a.x, az: a.z, bx: b.x, bz: b.z, phase: R() * 6 });
        break;
      }
    }
    if (trap === 'pods') { const n = boss ? RI(3, 5) : RI(1, 3); for (let q = 0; q < n; q++) { const c = take(); if (c) { const p = room.toWorld(c[0], c[1]); room.dynamic.push({ type: 'pod', x: p.x + (R() - 0.5) * 1.5, z: p.z + (R() - 0.5) * 1.5 }); } } }
    if (trap === 'webs' && !boss) { const n = RI(1, 2); for (let q = 0; q < n; q++) { const c = take(); if (c) { const p = room.toWorld(c[0], c[1]); room.dynamic.push({ type: 'web', x: p.x, z: p.z, r: 2.2 + R() * 0.8 }); } } }
    if (trap === 'vents') { const n = boss ? RI(4, 6) : RI(1, 3); for (let q = 0; q < n; q++) { const c = take(); if (c) { const p = room.toWorld(c[0], c[1]); room.dynamic.push({ type: 'vent', x: p.x, z: p.z, phase: R() * 3.5 }); } } }
  }
}

export { SIDE };
