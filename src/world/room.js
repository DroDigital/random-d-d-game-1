// Procedural room layouts (rot.js cellular automata + hand-tuned patterns)
// and their 3D assembly from the KayKit dungeon kit.
import * as THREE from 'three';
import { Map as RotMap, RNG } from 'rot-js';
import { rng } from '../core/rules.js';

export const CELL = 4;
export const FLOOR = 0, VOID = 1, BLOCK = 2;

export class Room {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.grid = new Uint8Array(w * h).fill(FLOOR);
    this.doors = []; this.props = []; this.torches = []; this.spikes = []; this.decor = [];
    this.flow = null;
  }
  idx(i, j) { return j * this.w + i; }
  get(i, j) { if (i < 0 || j < 0 || i >= this.w || j >= this.h) return VOID; return this.grid[j * this.w + i]; }
  set(i, j, v) { if (i >= 0 && j >= 0 && i < this.w && j < this.h) this.grid[j * this.w + i] = v; }
  isFloor(i, j) { return this.get(i, j) === FLOOR; }
  toWorld(i, j) { return { x: (i - this.w / 2 + 0.5) * CELL, z: (j - this.h / 2 + 0.5) * CELL }; }
  toCell(x, z) { return { i: Math.floor(x / CELL + this.w / 2), j: Math.floor(z / CELL + this.h / 2) }; }
  solidAt(x, z, flying = false) {
    const c = this.toCell(x, z);
    const v = this.get(c.i, c.j);
    return flying ? v === VOID : v !== FLOOR;
  }
  floorCells() {
    const out = [];
    for (let j = 0; j < this.h; j++) for (let i = 0; i < this.w; i++) if (this.isFloor(i, j)) out.push([i, j]);
    return out;
  }
  // BFS distance field from the given world points (for enemy pathing)
  computeFlow(points) {
    const n = this.w * this.h;
    const dist = this.flow && this.flow.length === n ? this.flow : new Float32Array(n);
    dist.fill(1e9);
    const q = [];
    for (const p of points) {
      const c = this.toCell(p.x, p.z);
      if (this.isFloor(c.i, c.j)) { dist[this.idx(c.i, c.j)] = 0; q.push(c.i, c.j); }
    }
    for (let h = 0; h < q.length; h += 2) {
      const i = q[h], j = q[h + 1], d0 = dist[this.idx(i, j)];
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        if (!di && !dj) continue;
        const ni = i + di, nj = j + dj;
        if (!this.isFloor(ni, nj)) continue;
        if (di && dj && (!this.isFloor(i + di, j) || !this.isFloor(i, j + dj))) continue;
        const nd = d0 + (di && dj ? 1.414 : 1);
        const k = this.idx(ni, nj);
        if (nd < dist[k]) { dist[k] = nd; q.push(ni, nj); }
      }
    }
    this.flow = dist;
  }
  // direction to walk downhill on the flow field
  flowDir(x, z) {
    if (!this.flow) return null;
    const c = this.toCell(x, z);
    let best = this.flow[this.idx(c.i, c.j)] ?? 1e9, bi = 0, bj = 0;
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      if (!di && !dj) continue;
      const ni = c.i + di, nj = c.j + dj;
      if (!this.isFloor(ni, nj)) continue;
      if (di && dj && (!this.isFloor(c.i + di, c.j) || !this.isFloor(c.i, c.j + dj))) continue;
      const v = this.flow[this.idx(ni, nj)];
      if (v < best) { best = v; bi = di; bj = dj; }
    }
    if (!bi && !bj) return null;
    const t = this.toWorld(c.i + bi, c.j + bj);
    const dx = t.x - x, dz = t.z - z, l = Math.hypot(dx, dz) || 1;
    return { x: dx / l, z: dz / l };
  }
  lineOfSight(ax, az, bx, bz) {
    const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / 1.0);
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      if (this.solidAt(ax + (bx - ax) * t, az + (bz - az) * t, true)) return false;
      const c = this.toCell(ax + (bx - ax) * t, az + (bz - az) * t);
      if (this.get(c.i, c.j) === BLOCK && this.blockTall && this.blockTall[this.idx(c.i, c.j)]) return false;
    }
    return true;
  }
}

function reachable(room, from) {
  const seen = new Uint8Array(room.w * room.h);
  const q = [from];
  seen[room.idx(from[0], from[1])] = 1;
  let count = 1;
  while (q.length) {
    const [i, j] = q.pop();
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj;
      if (room.isFloor(ni, nj) && !seen[room.idx(ni, nj)]) { seen[room.idx(ni, nj)] = 1; count++; q.push([ni, nj]); }
    }
  }
  return { seen, count };
}

// kind: 'combat' | 'boss' | 'shrine' | 'peddler' | 'altar' | 'treasure'
export function generateRoom({ kind, depth, doors: nDoors }) {
  let w, h;
  if (kind === 'boss') { w = 15; h = 13; }
  else if (kind === 'shrine' || kind === 'peddler' || kind === 'altar') { w = 9; h = 8; }
  else { w = rng.int(10, 14); h = rng.int(8, 11); }
  const room = new Room(w, h);
  room.kind = kind;

  // carve corner notches for L / T / cross shaped rooms
  if (kind !== 'boss' && w >= 10) {
    const notches = rng.int(0, 2);
    const corners = rng.shuffle([[0, 0], [1, 0], [0, 1], [1, 1]]);
    for (let n = 0; n < notches; n++) {
      const [cx, cy] = corners[n];
      if (cy === 1 && kind !== 'combat') continue;
      const nw = rng.int(2, 3), nh = rng.int(2, 3);
      for (let a = 0; a < nw; a++) for (let b = 0; b < nh; b++) {
        const i = cx ? w - 1 - a : a, j = cy ? h - 1 - b : b;
        room.set(i, j, VOID);
      }
    }
  }

  // entrance (south wall, the side facing the camera)
  const midI = Math.floor(w / 2);
  room.entrance = { i: midI, j: h - 1, side: 'S' };
  room.set(midI, h - 1, FLOOR); room.set(midI, h - 2, FLOOR);

  // exits: north wall first, then east/west
  const exits = [];
  const n = nDoors;
  if (n > 0) {
    const northSlots = [];
    for (let i = 1; i < w - 1; i++) if (room.isFloor(i, 0)) northSlots.push(i);
    if (n === 1) exits.push({ i: northSlots[Math.floor(northSlots.length / 2)], j: 0, side: 'N' });
    else {
      exits.push({ i: northSlots[Math.floor(northSlots.length * 0.25)], j: 0, side: 'N' });
      exits.push({ i: northSlots[Math.floor(northSlots.length * 0.75)], j: 0, side: 'N' });
      if (n >= 3) {
        const side = rng.chance(0.5) ? 'W' : 'E';
        const i = side === 'W' ? 0 : w - 1;
        const slots = []; for (let j = 1; j < h - 2; j++) if (room.isFloor(i, j)) slots.push(j);
        if (slots.length) exits.push({ i, j: slots[Math.floor(slots.length / 2)], side });
      }
    }
  }
  room.doors = exits;

  // obstacles
  const reserved = new Set();
  const reserve = (i, j, r = 1) => { for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) reserved.add((i + a) + ',' + (j + b)); };
  reserve(room.entrance.i, room.entrance.j, 1);
  exits.forEach((e) => reserve(e.i, e.j, 1));
  reserve(midI, Math.floor(h / 2), 1);

  const pattern = kind === 'boss' ? 'boss' : (kind === 'combat' ? rng.pick(['pillars', 'cellular', 'cellular', 'scatter', 'ring']) : 'calm');
  room.pattern = pattern;
  const blockers = [];
  const tryBlock = (i, j, prop) => {
    if (i <= 0 || j <= 0 || i >= w - 1 || j >= h - 1) return;
    if (reserved.has(i + ',' + j) || !room.isFloor(i, j)) return;
    room.set(i, j, BLOCK);
    const r = reachable(room, [room.entrance.i, room.entrance.j]);
    const ok = exits.every((e) => r.seen[room.idx(e.i, e.j)]);
    const total = room.floorCells().length;
    if (!ok || r.count < total) { room.set(i, j, FLOOR); return; }
    blockers.push({ i, j, prop });
  };
  if (pattern === 'pillars' || pattern === 'boss') {
    const step = pattern === 'boss' ? 4 : 3;
    for (let i = 2; i < w - 2; i += step) for (let j = 2; j < h - 2; j += step) {
      if (pattern === 'boss' && (i === midI || j === Math.floor(h / 2))) continue;
      tryBlock(i, j, pattern === 'boss' ? 'pillar_decorated' : 'pillar');
    }
  } else if (pattern === 'cellular') {
    const cell = new RotMap.Cellular(w, h);
    cell.randomize(0.36);
    for (let k = 0; k < 2; k++) cell.create();
    cell.create((x, y, v) => { if (v && rng.chance(0.55)) tryBlock(x, y, 'rubble'); });
  } else if (pattern === 'scatter') {
    for (let k = 0; k < Math.floor(w * h / 14); k++) tryBlock(rng.int(1, w - 2), rng.int(1, h - 2), 'prop');
  } else if (pattern === 'ring') {
    const ci = midI, cj = Math.floor(h / 2);
    for (const [a, b] of [[-2, -2], [2, -2], [-2, 2], [2, 2], [0, -3], [0, 3], [-3, 0], [3, 0]]) tryBlock(ci + a, cj + b, 'column');
  }
  room.blockers = blockers;
  room.blockTall = new Uint8Array(w * h);
  for (const b of blockers) if (b.prop === 'pillar' || b.prop === 'pillar_decorated' || b.prop === 'column') room.blockTall[room.idx(b.i, b.j)] = 1;

  // spike traps in deeper combat rooms
  if (kind === 'combat' && depth >= 1 && rng.chance(0.45)) {
    const cells = room.floorCells().filter(([i, j]) => !reserved.has(i + ',' + j));
    for (let k = 0; k < rng.int(3, 7) && cells.length; k++) {
      const c = cells.splice(rng.int(0, cells.length - 1), 1)[0];
      room.spikes.push({ i: c[0], j: c[1], phase: rng.float() * 3 });
    }
  }
  return room;
}

// ---------- 3D assembly ----------
const SIDE = {
  N: { di: 0, dj: -1, rot: 0 },
  S: { di: 0, dj: 1, rot: Math.PI },
  W: { di: -1, dj: 0, rot: Math.PI / 2 },
  E: { di: 1, dj: 0, rot: -Math.PI / 2 },
};

export function buildRoom(room, kit, depthDef) {
  const group = new THREE.Group();
  kit.begin(depthDef.texture);
  const { w, h } = room;
  const doorKey = new Set(room.doors.map((d) => d.i + ',' + d.j + ',' + d.side));
  doorKey.add(room.entrance.i + ',' + room.entrance.j + ',S');
  const floors = depthDef.floorAlt;
  const spikeSet = new Set(room.spikes.map((s) => s.i + ',' + s.j));
  const wallEdges = [];
  room.occluders = [];

  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    if (room.get(i, j) === VOID) continue;
    const p = room.toWorld(i, j);
    const fl = spikeSet.has(i + ',' + j) ? 'floor_tile_big_spikes' : (RNG.getUniform() < 0.6 ? floors[0] : floors[RNG.getUniformInt(1, floors.length - 1)]);
    kit.place(fl, p.x, 0, p.z, (RNG.getUniformInt(0, 3)) * Math.PI / 2);
    for (const s of ['N', 'S', 'W', 'E']) {
      const sd = SIDE[s];
      if (room.get(i + sd.di, j + sd.dj) !== VOID) continue;
      const ex = p.x + sd.di * CELL / 2, ez = p.z + sd.dj * CELL / 2;
      const isDoor = doorKey.has(i + ',' + j + ',' + s);
      wallEdges.push({ i, j, s, x: ex, z: ez, isDoor });
      if (s === 'S') {
        if (isDoor) continue; // open entrance on the camera side
        kit.place('wall_half', ex, 0, ez, sd.rot, 1, 0.55);
      } else if (isDoor) {
        kit.place('wall_doorway', ex, 0, ez, sd.rot);
      } else {
        const r = RNG.getUniform();
        const variant = r < 0.62 ? 'wall' : r < 0.74 ? 'wall_cracked' : r < 0.82 ? 'wall_inset_candles' : r < 0.9 ? 'wall_arched' : r < 0.95 ? 'wall_window_closed' : 'wall_broken';
        kit.place(variant, ex, 0, ez, sd.rot);
      }
    }
  }

  // corner posts at every grid vertex touched by a boundary edge
  const posts = new Map();
  for (const e of wallEdges) {
    const sd = SIDE[e.s];
    const along = sd.di === 0 ? [[-2, 0], [2, 0]] : [[0, -2], [0, 2]];
    for (const [ax, az] of along) {
      const k = (e.x + ax).toFixed(1) + ',' + (e.z + az).toFixed(1);
      const south = e.s === 'S';
      const prev = posts.get(k);
      posts.set(k, { x: e.x + ax, z: e.z + az, south: prev ? prev.south && south : south });
    }
  }
  for (const p of posts.values()) kit.place('pillar', p.x, 0, p.z, 0, 0.62, p.south ? 0.32 : 1.02);

  // blockers
  for (const b of room.blockers) {
    const p = room.toWorld(b.i, b.j);
    let name = b.prop;
    if (name === 'rubble') name = RNG.getUniform() < 0.5 ? 'rubble_large' : 'rocks_decorated';
    if (name === 'prop') name = depthDef.props[RNG.getUniformInt(0, depthDef.props.length - 1)];
    const rot = RNG.getUniformInt(0, 3) * Math.PI / 2, sc = name.startsWith('pillar') || name === 'column' ? 1 : 1.25;
    if (name.startsWith('rubble') || name.startsWith('rocks')) { kit.place(name, p.x, 0, p.z, rot, sc); continue; }
    // tall pieces are standalone so they can fade out when they hide a hero
    const o = kit.cloneFadable(name);
    o.position.set(p.x, 0, p.z); o.rotation.y = rot; o.scale.setScalar(sc);
    group.add(o);
    room.occluders.push({ obj: o, x: p.x, z: p.z, mats: o.userData.mats, a: 1 });
  }

  // decorations against north / side walls: banners, torches, candles
  const torchSpots = [];
  let k = 0;
  for (const e of wallEdges) {
    if (e.isDoor || e.s === 'S') continue;
    k++;
    const sd = SIDE[e.s];
    const inX = -sd.di, inZ = -sd.dj; // into the room
    if (k % 3 === 1) torchSpots.push({ x: e.x + inX * 0.55, z: e.z + inZ * 0.55, rot: sd.rot, nx: inX, nz: inZ });
    else if (k % 5 === 2) {
      const b = depthDef.banners[k % depthDef.banners.length];
      kit.place(b, e.x + inX * 0.55, 0.2, e.z + inZ * 0.55, sd.rot);
    } else if (k % 7 === 4) {
      const p = room.toWorld(e.i, e.j);
      const dx = p.x + (e.x - p.x) * 0.6, dz = p.z + (e.z - p.z) * 0.6;
      kit.place(RNG.getUniform() < 0.5 ? 'candle_triple' : depthDef.props[k % depthDef.props.length], dx, 0, dz, sd.rot);
    }
  }
  for (const t of torchSpots) kit.place('torch_mounted', t.x, 2.4, t.z, t.rot);
  room.torches = torchSpots;

  group.add(kit.end());

  // void floor far below for depth (so the outline shader has something to bite)
  const abyss = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  abyss.rotation.x = -Math.PI / 2; abyss.position.y = -6;
  group.add(abyss);
  return group;
}

export { SIDE };
