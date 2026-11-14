// Game orchestrator: scene, camera, run flow, rooms, spawning, rewards.
import * as THREE from 'three';
import { PSXRenderer, PALETTES, settings as psxSettings } from './render/psx.js';
import { FX } from './render/fx.js';
import { ModelLib } from './render/models.js';
import { Kit } from './world/kit.js';
import { generateRoom, buildRoom, CELL, SIDE } from './world/room.js';
import { Run, draftBoons } from './world/run.js';
import { Hero } from './entities/hero.js';
import { Enemy } from './entities/enemy.js';
import { Boss } from './entities/boss.js';
import { Projectile, Zone } from './entities/projectile.js';
import { computePacts, heroSave } from './entities/combat.js';
import { ENEMIES, BOSSES, AFFIXES } from './data/enemies.js';
import { DEPTHS, ROOM_TYPES, ROOMS_PER_DEPTH, VOWS } from './data/world.js';
import { CLASSES } from './data/classes.js';
import { rng, frand, LEVEL_COST, MAX_LEVEL, d20 } from './core/rules.js';
import { audio } from './core/audio.js';
import { input } from './core/input.js';
import { meta } from './core/meta.js';
import { loadGLTF, url } from './core/assets.js';
import { retroify } from './render/psx.js';

export class Game {
  constructor() {
    this.canvas = document.getElementById('view');
    this.overlay = document.getElementById('overlay');
    this.octx = this.overlay.getContext('2d');
    this.psx = new PSXRenderer(this.canvas);
    this.psx.onResize = (lw, lh) => { this.overlay.width = lw * 2; this.overlay.height = lh * 2; if (this.camera) { this.camera.aspect = lw / lh; this.camera.updateProjectionMatrix(); } };
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(36, window.innerWidth / window.innerHeight, 1, 160);
    this.psx.resize();
    this.fx = new FX(this);
    this.models = new ModelLib();
    this.kit = new Kit();
    this.meta = { has: (id) => meta.has(id) };
    this.heroes = []; this.enemies = []; this.projectiles = []; this.zones = []; this.pickups = []; this.breakables = []; this.interactables = []; this.doors = [];
    this.vows = new Set();
    this.time = 0; this.timeScale = 1; this.hitstopT = 0; this.shakeT = 0; this.flashT = 0;
    this.mode = 'boot';
    this.camTarget = new THREE.Vector3(); this.camDist = 1;
    this.logLines = [];
    this.roomStats = { hitsTaken: 0 };
    this.depthIndex = 0;
    this.cinematic = false;
    this.inputLocked = false;
  }

  async init(progress) {
    const ambient = new THREE.AmbientLight(0x4a5a70, 3.0);
    const hemi = new THREE.HemisphereLight(0x9aa8c8, 0x302018, 1.3);
    const dir = new THREE.DirectionalLight(0xc0b0ff, 1.1); dir.position.set(-10, 30, 10);
    this.ambient = ambient; this.hemi = hemi; this.dirLight = dir;
    this.scene.add(ambient, hemi, dir);
    this.scene.fog = new THREE.Fog(0x0a0d14, 44, 95);
    this.scene.background = new THREE.Color(0x000000);
    progress(0.05, 'Loading effects');
    await this.fx.load();
    progress(0.15, 'Loading dungeon kit');
    await this.kit.load((p) => progress(0.15 + p * 0.25, 'Loading dungeon kit'));
    progress(0.4, 'Loading animation rigs');
    await this.models.loadRigs();
    progress(0.55, 'Loading heroes');
    for (const c of Object.values(CLASSES)) await this.models.template('heroes/' + c.model + '.glb');
    progress(0.65, 'Loading monsters');
    const paths = new Set([...Object.values(ENEMIES), ...Object.values(BOSSES)].map((d) => d.model).filter((p) => !p.startsWith('dungeon')));
    let i = 0;
    for (const p of paths) { await this.models.template(p); i++; progress(0.65 + 0.3 * i / paths.size, 'Loading monsters'); }
    const arrow = await loadGLTF('assets/models/gear/arrow_bow.gltf'); this.models.gearArrow = retroify(arrow.scene);
    const dag = await loadGLTF('assets/models/gear/dagger.gltf'); this.models.gearDagger = retroify(dag.scene);
    progress(1, 'Ready');
  }

  // ---------------------------------------------------------------- logging/feedback
  log(msg, color = '#cfc7b4') { this.logLines.push({ msg, color, t: 7 }); if (this.logLines.length > 7) this.logLines.shift(); this.ui && this.ui.updateLog(this.logLines); }
  shake(a) { this.shakeT = Math.max(this.shakeT, a); }
  hitstop(t) { this.hitstopT = Math.max(this.hitstopT, t); }
  flash(t, color = '#ffffff') { this.flashT = t; this.flashMax = t; this.psx.post.uniforms.uFlashColor.value.setStyle(color, THREE.LinearSRGBColorSpace); }

  // ---------------------------------------------------------------- scenes
  clearRoom() {
    for (const e of this.enemies) e.remove();
    for (const p of this.projectiles) p.kill();
    for (const z of this.zones) { z.alive = false; }
    for (const p of this.pickups) this.fx.group.remove(p.obj);
    for (const b of this.breakables) this.scene.remove(b.obj);
    for (const i of this.interactables) if (i.obj) this.scene.remove(i.obj);
    for (const d of this.doors) { this.scene.remove(d.group); }
    if (this.roomGroup) this.scene.remove(this.roomGroup);
    if (this.extra) for (const o of this.extra) this.scene.remove(o);
    this.enemies = []; this.projectiles = []; this.zones = []; this.pickups = []; this.breakables = []; this.interactables = []; this.doors = []; this.extra = [];
    this.fx.clear();
    this.fx.clearLights();
    for (const h of this.heroes) if (h.model) { h.lantern = this.fx.persistentLight({ x: h.pos.x, y: 3.2, z: h.pos.z, color: 0xffc890, intensity: 26, distance: 18, flicker: 0.2 }); if (h.lantern) { h.lantern.userData.owner = h; h.lantern.userData.ownerY = 3.4; } }
  }

  applyDepthLook(depth, paletteKey = null) {
    this.psx.setPalette(PALETTES[paletteKey || depth.palette]);
    this.scene.fog.color.set(depth.fog);
    this.ambient.color.set(depth.ambient);
  }

  async buildTitleScene() {
    this.clearRoom();
    this.mode = 'title';
    rng.seed(1337);
    const depth = DEPTHS[0];
    this.applyDepthLook(depth, 'title');
    const room = generateRoom({ kind: 'shrine', depth: 0, doors: 1 });
    this.room = room;
    this.roomGroup = buildRoom(room, this.kit, depth);
    this.scene.add(this.roomGroup);
    this.addTorchLights(room, depth);
    this.addShrine(0, 0, true);
    this.titleHeroes = [];
    const lineup = ['fighter', 'rogue', 'wizard', 'druid'];
    for (let k = 0; k < 4; k++) {
      const c = CLASSES[lineup[k]];
      const m = await this.models.instance({ path: 'heroes/' + c.model + '.glb', rig: 'Rig_Medium', height: 2.55, gear: c.gear });
      const a = -Math.PI / 2 + (k - 1.5) * 0.55 + Math.PI;
      m.root.position.set(Math.cos(a) * 4.2, 0, Math.sin(a) * 4.2 + 0.5);
      m.root.rotation.y = Math.PI / 2 - Math.atan2(-m.root.position.z, -m.root.position.x);
      m.loop(k % 2 ? 'Idle_B' : 'Idle_A');
      this.scene.add(m.root); this.extra.push(m.root); this.titleHeroes.push(m);
    }
  }

  addTorchLights(room, depth) {
    let n = 0;
    for (const t of room.torches) {
      // flame sprite always; real light for a few
      const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.fx.tex.flame_03, color: 0xffa050, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      flame.position.set(t.x + t.nx * 0.35, 3.25, t.z + t.nz * 0.35); flame.scale.set(0.9, 1.3, 1);
      flame.userData.flicker = Math.random() * 10;
      this.scene.add(flame); this.extra.push(flame);
      if (n < 5 && (n === 0 || Math.random() < 0.8)) {
        this.fx.persistentLight({ x: t.x + t.nx * 1.2, y: 3.4, z: t.z + t.nz * 1.2, color: depth.torch, intensity: 22, distance: 16, flicker: 0.5 });
        n++;
      }
    }
  }

  addShrine(x, z, title = false) {
    const g = new THREE.Group();
    const sig = this.fx.decal('dngn_floor_sigil_circle', { x, z, size: 6, color: 0xffb060, opacity: 0.65, life: 1e9 });
    for (let k = 0; k < 6; k++) {
      const a = k / 6 * Math.PI * 2;
      const c = this.kit.clone(k % 2 ? 'candle_lit' : 'candle_triple');
      c.position.set(x + Math.cos(a) * 2.2, 0, z + Math.sin(a) * 2.2); c.scale.setScalar(1.2);
      g.add(c);
    }
    const sword = this.kit.clone('sword_shield_broken'); sword.position.set(x, 0, z); sword.scale.setScalar(1.4); g.add(sword);
    this.scene.add(g); this.extra.push(g);
    const fire = { x, z, t: 0 };
    this.shrineFire = fire;
    this.fx.persistentLight({ x, y: 2.2, z, color: 0xff9a40, intensity: 40, distance: 22, flicker: 0.4 });
    return g;
  }

  // ---------------------------------------------------------------- run flow
  async startRun(players, vows) {
    this.vows = new Set(vows);
    const seed = Math.floor(Math.random() * 1e9);
    rng.seed(seed);
    this.run = new Run(seed, this.vows, this.meta, players.length);
    meta.data.runs++; meta.save();
    for (const h of this.heroes) h.removeModel();
    this.heroes = [];
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      const h = new Hero(this, i, p.classId, p.controllerId, p.skin);
      if (meta.has('reroll')) h.rerolls = 1;
      await h.spawnModel(this.models);
      this.heroes.push(h);
    }
    if (meta.has('kindled')) for (const h of this.heroes) { const b = draftBoons(h, { minRarity: 'uncommon', count: 1 })[0]; if (b) this.grantBoon(h, b, true); }
    this.mode = 'play';
    audio.voice('prepare_yourself');
    await this.enterRoom('shrine', true);
  }

  depthIntro() {
    const d = this.run.depth;
    this.ui.banner(d.sub, d.name, 3.2);
  }

  async enterRoom(type, newDepth = false) {
    const run = this.run;
    this.ui.fade(true);
    await new Promise((r) => setTimeout(r, 380));
    this.clearRoom();
    this.depthIndex = run.depthIndex;
    const depth = run.depth;
    this.depth = depth;
    this.applyDepthLook(depth);
    const nextChoices = type === 'boss' ? [run.depthIndex >= 2 ? 'victory' : 'descend'] : run.nextChoices();
    const room = generateRoom({ kind: type === 'boss' ? 'boss' : ['shrine', 'peddler', 'altar'].includes(type) ? type : 'combat', depth: run.depthIndex, doors: nextChoices.length });
    room.doors.forEach((d, i) => { d.type = nextChoices[i]; });
    this.room = room;
    this.roomType = type;
    this.roomGroup = buildRoom(room, this.kit, depth);
    this.scene.add(this.roomGroup);
    this.addTorchLights(room, depth);
    this.buildDoors();
    // heroes at the entrance
    const ent = room.toWorld(room.entrance.i, room.entrance.j);
    this.heroes.forEach((h, i) => {
      const off = (i - (this.heroes.length - 1) / 2) * 1.8;
      h.placeAt(ent.x + off, ent.z - 1.5, -Math.PI / 2);
      h.state = h.dead ? 'dead' : h.downed ? 'downed' : 'free';
      h.onRoomStart();
    });
    computePacts(this.heroes);
    this.roomStats = { hitsTaken: 0, start: this.time };
    this.enemiesKilledInRoom = 0; this.shrineRested = false; this.chestPending = false; this.mimicThenLoot = false; this.boss = null;
    this.cleared = false; this.combatActive = false; this.waves = []; this.waveIndex = 0;
    this.camTarget.set(ent.x, 0, ent.z - 4);
    // content
    const roomDef = ROOM_TYPES[type];
    this.ui.roomTitle(roomDef ? roomDef.name : type, `${depth.sub} · Room ${run.roomIndex}/${ROOMS_PER_DEPTH}`);
    if (type === 'shrine') { this.addShrine(0, 0); this.interactables.push({ x: 0, z: 0, r: 4.4, label: 'Rest at the Ember Shrine', kind: 'shrine' }); this.setCleared(true); audio.music('shrine'); }
    else if (type === 'peddler') this.setupPeddler();
    else if (type === 'altar') this.setupAltar();
    else if (type === 'boss') await this.setupBoss();
    else this.setupCombat(type);
    this.addBreakables();
    // ash remains from a previous wipe
    if (run.remains && run.remains.depthIndex === run.depthIndex && run.remains.roomIndex === run.roomIndex) this.placeRemains();
    room.computeFlow(this.heroes.map((h) => h.pos));
    this.ui.fade(false);
    if (newDepth) this.depthIntro();
    this.ui.refreshHud();
  }

  setupCombat(type) {
    const run = this.run, depth = this.depth;
    const n = this.heroes.length;
    let budget = (3.2 + run.roomIndex * 0.55 + run.depthIndex * 1.3) * (1 + 0.5 * (n - 1)) * (this.vows.has('horde') ? 1.35 : 1);
    const waves = type === 'trial' ? 3 : budget > 6 ? 2 : 1;
    const per = Math.ceil(budget / waves);
    for (let w = 0; w < waves; w++) {
      const list = [];
      for (let k = 0; k < per + (type === 'trial' ? 1 : 0); k++) list.push({ id: rng.pick(depth.common) });
      this.waves.push(list);
    }
    const eliteCount = (type === 'elite' ? 1 : 0) + (this.vows.has('elite') ? 1 : 0) + (type === 'elite' && n >= 3 ? 1 : 0);
    for (let k = 0; k < eliteCount; k++) {
      const aff = Object.keys(AFFIXES); const a1 = rng.pick(aff);
      const affixes = this.vows.has('elite') ? [a1, rng.pick(aff.filter((x) => x !== a1))] : [a1];
      this.waves[Math.min(this.waves.length - 1, k)].push({ id: rng.pick(depth.elites), elite: true, affixes });
    }
    if (type === 'treasure') {
      this.waves = [this.waves[0].slice(0, Math.max(2, Math.ceil(per / 2)))];
      const mimic = rng.chance(0.3);
      this.treasureMimic = mimic;
    }
    audio.music(depth.music);
    this.combatActive = true;
    setTimeout(() => this.spawnWave(), 700);
  }

  spawnWave() {
    if (this.mode !== 'play' || !this.waves[this.waveIndex]) return;
    const wave = this.waves[this.waveIndex++];
    const room = this.room;
    const cells = room.floorCells().map(([i, j]) => room.toWorld(i, j)).filter((p) => this.heroes.every((h) => Math.hypot(h.pos.x - p.x, h.pos.z - p.z) > 9));
    for (const s of wave) {
      const p = cells.length ? cells.splice(rng.int(0, cells.length - 1), 1)[0] : { x: 0, z: 0 };
      this.spawnEnemy(s.id, p.x + frand(-0.8, 0.8), p.z + frand(-0.8, 0.8), { elite: s.elite, affixes: s.affixes || [] });
    }
    if (this.waveIndex > 1) this.ui.banner('', 'More foes rise!', 1.4);
  }

  spawnEnemy(id, x, z, opts = {}) {
    const def = ENEMIES[id];
    if (!def) { console.warn('no enemy', id); return null; }
    const e = new Enemy(this, def, opts);
    e.pos.set(x, 0, z);
    if (e.blocked(x, z)) { const c = this.room.floorCells(); const p = this.room.toWorld(...c[rng.int(0, c.length - 1)]); e.pos.set(p.x, 0, p.z); }
    if (opts.noSpawnAnim) { e.state = 'chase'; }
    if (id === 'mimic') { e.state = 'disguised'; e.hidden = true; }
    this.enemies.push(e);
    e.spawnModel(this.models).then(() => { e.ready = true; if (opts.thrall) { e.thrall = true; } });
    if (opts.elite) this.log(`An elite ${def.name} (${opts.affixes.map((a) => AFFIXES[a].name).join(', ')}) appears!`, '#ffb347');
    return e;
  }

  async setupBoss() {
    const key = this.depth.boss, def = BOSSES[key];
    const b = new Boss(this, def, key);
    b.pos.set(0, 0, 0); b.facing = Math.PI / 2;
    // four braziers light the arena
    for (const [x, z] of [[-9, -7], [9, -7], [-9, 7], [9, 7]]) {
      if (this.room.solidAt(x, z)) continue;
      const t = this.kit.clone('torch_lit'); t.position.set(x, 0, z); t.scale.setScalar(1.6); this.scene.add(t); this.extra.push(t);
      const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.fx.tex.flame_03, color: 0xffa050, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      flame.position.set(x, 3.4, z); flame.scale.set(1.4, 2, 1); flame.userData.flicker = Math.random() * 10; this.scene.add(flame); this.extra.push(flame);
      this.fx.persistentLight({ x, y: 4, z, color: this.depth.torch, intensity: 30, distance: 20, flicker: 0.5 });
    }
    this.enemies.push(b);
    await b.spawnModel(this.models); b.ready = true;
    b.state = 'recover'; b.stateT = 3.2;
    this.boss = b;
    this.combatActive = true;
    this.cinematic = true;
    audio.music(def.music);
    audio.voice(this.run.depthIndex === 2 ? 'final_round' : 'fight');
    this.ui.bossIntro(def);
    setTimeout(() => { this.cinematic = false; }, 2600);
    this.waves = [];
  }

  setupPeddler() {
    audio.music('peddler');
    this.setCleared(true);
    const x = 0, z = -3;
    this.models.instance({ path: 'heroes/Mage.glb', rig: 'Rig_Medium', height: 2.6, gear: { r: 'staff' }, skin: { base: 'mage', name: 'alt_C' } }).then((m) => {
      m.root.position.set(x, 0, z); m.loop('Idle_B'); this.scene.add(m.root); this.extra.push(m.root); this.peddlerModel = m;
    });
    for (const [px, pz, n] of [[-2.4, -3.5, 'chest_large_gold'], [2.4, -3.5, 'barrel_small_stack'], [-3.5, -1.5, 'coin_stack_large']]) { const c = this.kit.clone(n); c.position.set(px, 0, pz); this.scene.add(c); this.extra.push(c); }
    this.fx.persistentLight({ x, y: 3, z: z + 1.5, color: 0xffd090, intensity: 10, distance: 12, flicker: 0.2 });
    this.interactables.push({ x, z, r: 4.2, label: 'Trade with Ossa the Ash-Merchant', kind: 'peddler' });
  }

  setupAltar() {
    audio.music('altar');
    this.setCleared(true);
    const x = 0, z = -2;
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.fx.tex.dngn_altars_makhleb_flame1, transparent: true }));
    spr.position.set(x, 1.6, z); spr.scale.set(3.2, 3.2, 1);
    this.scene.add(spr); this.extra.push(spr);
    const p = this.kit.clone('pillar_decorated'); p.position.set(x - 3, 0, z - 1); this.scene.add(p); this.extra.push(p);
    const p2 = this.kit.clone('pillar_decorated'); p2.position.set(x + 3, 0, z - 1); this.scene.add(p2); this.extra.push(p2);
    this.fx.decal('dngn_floor_sigil_circle', { x, z, size: 7, color: 0xff5a3a, opacity: 0.7, life: 1e9 });
    this.fx.persistentLight({ x, y: 3, z, color: 0xff5a3a, intensity: 12, distance: 14, flicker: 0.4 });
    this.interactables.push({ x, z, r: 4.2, label: "Roll at the Dicer's Altar", kind: 'altar' });
    this.altarRolled = new Set();
  }

  addBreakables() {
    const room = this.room;
    const cells = room.floorCells().filter(([i, j]) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => room.get(i + a, j + b) === 1));
    const n = Math.min(cells.length, rng.int(2, 5));
    for (let k = 0; k < n; k++) {
      const [i, j] = cells.splice(rng.int(0, cells.length - 1), 1)[0];
      const p = room.toWorld(i, j);
      if (Math.hypot(p.x, p.z) < 3) continue;
      const name = rng.pick(['barrel_large', 'box_stacked', 'crates_stacked', 'barrel_small_stack', 'keg_decorated']);
      const obj = this.kit.clone(name); obj.position.set(p.x + frand(-0.6, 0.6), 0, p.z + frand(-0.6, 0.6)); obj.rotation.y = frand(0, 6.28); obj.scale.setScalar(0.8);
      this.scene.add(obj);
      this.breakables.push({ obj, x: obj.position.x, z: obj.position.z, broken: false });
    }
  }

  breakProp(b, hero) {
    b.broken = true; this.scene.remove(b.obj);
    this.fx.burst('dirt_02', b.x, 1, b.z, 12, { color: 0x8a6a4a, speed: 6, up: 6, gravity: -16, additive: false });
    audio.play('bone', { vol: 0.5 });
    if (rng.chance(0.75)) this.dropAsh(b.x, b.z, rng.int(6, 22));
    if (rng.chance(0.08) && hero) { hero.potions = Math.min(hero.potionsMax, hero.potions + 1); this.fx.text('+1 POTION', b.x, 2.5, b.z, { color: '#ff8a8a' }); }
  }

  placeRemains() {
    const r = this.run.remains;
    const ent = this.room.toWorld(this.room.entrance.i, this.room.entrance.j - 3);
    const obj = this.kit.clone('coin_stack_large'); obj.position.set(ent.x + 2, 0, ent.z);
    this.scene.add(obj);
    this.fx.decal('dngn_floor_cobble_blood3', { x: ent.x + 2, z: ent.z, size: 3, color: 0xffffff, opacity: 0.8, life: 1e9, additive: false });
    const light = this.fx.persistentLight({ x: ent.x + 2, y: 1.5, z: ent.z, color: 0xff8a3a, intensity: 6, distance: 6, flicker: 0.6 });
    this.interactables.push({ x: ent.x + 2, z: ent.z, r: 2.4, label: `Reclaim your Ashen Remains (${r.ash})`, kind: 'remains', obj, light, auto: true });
  }

  buildDoors() {
    for (const d of this.room.doors) {
      const sd = SIDE[d.side];
      const p = this.room.toWorld(d.i, d.j);
      const ex = p.x + sd.di * CELL / 2, ez = p.z + sd.dj * CELL / 2;
      const group = new THREE.Group();
      const seal = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.6), new THREE.MeshBasicMaterial({ map: this.fx.tex.magic_05, color: 0xff7a2f, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      seal.position.set(ex, 1.8, ez); seal.rotation.y = sd.rot;
      group.add(seal);
      const type = ROOM_TYPES[d.type] || ROOM_TYPES.combat;
      const sign = this.makeSign(type.icon, type.name, d.type);
      sign.position.set(ex - sd.di * 1.2, 5.2, ez - sd.dj * 1.2);
      group.add(sign);
      this.scene.add(group);
      this.doors.push({ ...d, x: ex, z: ez, group, seal, sign, inX: -sd.di, inZ: -sd.dj });
    }
  }

  makeSign(icon, label, type) {
    const c = document.createElement('canvas'); c.width = 128; c.height = 128;
    const ctx = c.getContext('2d');
    const col = { boss: '#ff5a3a', elite: '#ffb347', shrine: '#ffd28a', peddler: '#c8f06a', altar: '#ff7ad0', treasure: '#ffe48a', trial: '#c27bff', ash: '#ff9a50' }[type] || '#f4ecd6';
    ctx.fillStyle = 'rgba(8,6,10,0.85)'; ctx.beginPath(); ctx.arc(64, 64, 60, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 6; ctx.stroke();
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
    const img = new Image();
    img.onload = () => {
      const tmp = document.createElement('canvas'); tmp.width = 80; tmp.height = 80;
      const t2 = tmp.getContext('2d'); t2.drawImage(img, 0, 0, 80, 80); t2.globalCompositeOperation = 'source-in'; t2.fillStyle = col; t2.fillRect(0, 0, 80, 80);
      ctx.drawImage(tmp, 24, 24); tex.needsUpdate = true;
    };
    img.src = url('assets/icons/' + icon + '.svg');
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    s.scale.set(2.4, 2.4, 1); s.renderOrder = 10;
    s.userData.label = label;
    return s;
  }

  setCleared(quiet = false) {
    if (this.cleared) return;
    this.cleared = true; this.combatActive = false;
    for (const d of this.doors) d.open = true;
    if (!quiet) {
      this.run.roomsCleared++;
      audio.play('roomClear', { vol: 0.8 });
      if (this.roomStats.hitsTaken === 0 && this.enemiesKilledInRoom > 3) { audio.voice('flawless_victory'); this.ui.banner('', 'Flawless', 1.6); }
      else this.ui.banner('', 'Room Cleared', 1.4);
      for (const h of this.heroes) h.onRoomClear();
      this.grantRoomRewards();
    }
    this.ui.refreshHud();
  }

  grantRoomRewards() {
    const type = this.roomType, run = this.run;
    const depth = run.depthIndex;
    if (type === 'combat') this.heroes.forEach((h) => this.ui.openDraft(h, draftBoons(h, { depth })));
    else if (type === 'elite') this.heroes.forEach((h) => this.ui.openDraft(h, draftBoons(h, { depth, minRarity: 'uncommon', legendaryBoost: 2 })));
    else if (type === 'trial') this.heroes.forEach((h) => this.ui.openDraft(h, draftBoons(h, { depth }), () => this.ui.openDraft(h, draftBoons(h, { depth, minRarity: 'uncommon' }))));
    else if (type === 'ash') { const amt = Math.round((180 + depth * 160 + run.roomIndex * 25) * (1 + 0.5 * (this.heroes.length - 1))); for (let i = 0; i < 12; i++) this.dropAsh(frand(-4, 4), frand(-4, 4), Math.round(amt / 12)); }
    else if (type === 'treasure') {
      const chest = this.kit.clone('chest_gold'); chest.position.set(0, 0, -1); chest.scale.setScalar(1.4); this.scene.add(chest); this.extra.push(chest);
      this.fx.persistentLight({ x: 0, y: 2, z: -1, color: 0xffd060, intensity: 10, distance: 10, flicker: 0.3 });
      this.interactables.push({ x: 0, z: -1, r: 2.8, label: 'Open the vault chest', kind: 'chest', obj: chest });
      for (const d of this.doors) d.open = false; // must open the chest first
      this.chestPending = true;
    } else if (type === 'boss') {
      const amt = 800 + depth * 600;
      const bp = this.bossPos || { x: 0, z: 0 };
      for (let i = 0; i < 16; i++) this.dropAsh(bp.x + frand(-3, 3), bp.z + frand(-3, 3), Math.round(amt / 16));
      this.heroes.forEach((h) => this.ui.openDraft(h, draftBoons(h, { depth: depth + 1, minRarity: 'rare', legendaryBoost: 4 })));
    }
  }

  grantBoon(hero, boon, quiet = false) {
    hero.boons.push(boon);
    hero.recompute();
    computePacts(this.heroes);
    if (!quiet) {
      audio.play('boon', { vol: 0.7 });
      this.fx.burst('star_05', hero.pos.x, 1.5, hero.pos.z, 16, { color: 0xffe48a, speed: 3, up: 4 });
      this.log(`${hero.label} gains ${boon.name}.`, hero.color);
      for (const p of hero.bonds || []) if (!hero.announcedBonds?.has(p)) { (hero.announcedBonds = hero.announcedBonds || new Set()).add(p); this.ui.banner('Pact Bond', `${p.toUpperCase()} — shared by the party`, 2); }
    }
    this.ui.refreshHud();
  }

  // ---------------------------------------------------------------- spawn helpers
  spawnProjectile(o) { const p = new Projectile(this, o); this.projectiles.push(p); return p; }
  spawnZone(o) { const z = new Zone(this, o); this.zones.push(z); return z; }
  raiseThrall(enemy, hero) {
    const id = Object.keys(ENEMIES).find((k) => ENEMIES[k] === enemy.def);
    if (!id || id === 'mimic') return;
    setTimeout(() => {
      if (this.mode !== 'play' || this.cleared) return;
      const t = this.spawnEnemy(id, enemy.pos.x, enemy.pos.z, { thrall: true, noSpawnAnim: true });
      if (t) { t.thrall = true; t.thrallT = 12; t.maxHp = t.hp = Math.ceil(t.maxHp * 0.6); this.fx.text('THRALL', t.pos.x, 3, t.pos.z, { color: '#b07cff' }); }
    }, 600);
  }

  dropAsh(x, z, amount) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.fx.tex.flare_01, color: 0xff9a40, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    s.scale.setScalar(0.9);
    s.position.set(x, 1, z);
    this.fx.group.add(s);
    this.pickups.push({ obj: s, x, z, y: 1, amount, t: 0, vy: frand(3, 6), vx: frand(-2, 2), vz: frand(-2, 2) });
  }

  onEnemyDeath(e, source) {
    if (e.thrall) return;
    this.enemiesKilledInRoom = (this.enemiesKilledInRoom || 0) + 1;
    meta.data.kills++;
    const killer = source && source.isHero ? source : null;
    if (killer) killer.onKill(e);
    const ash = Math.round(e.xp * 0.6);
    const n = Math.min(6, 1 + Math.floor(ash / 25));
    for (let i = 0; i < n; i++) this.dropAsh(e.pos.x, e.pos.z, Math.round(ash / n));
    if (e.elite) this.run.elitesSlain++;
    if (e.isBoss) this.onBossDeath(e);
  }

  onBossDeath(b) {
    this.run.bossesSlain++;
    audio.play('bossDown', { vol: 0.9 });
    this.hitstop(0.5); this.shake(1); this.flash(0.4, '#ffe0a0');
    this.ui.banner('Victory', `${b.def.name} has fallen`, 3);
    for (const e of this.enemies) if (e.alive && !e.isBoss) e.die(null);
    this.bossPos = { x: b.pos.x, z: b.pos.z };
    this.boss = null;
    this.ui.bossBar(null);
    if (this.run.depthIndex === 0 && !meta.has('barbarian')) { meta.data.seen.push('barbarian'); }
  }

  // ---------------------------------------------------------------- interaction
  interact(hero) {
    let best = null, bd = 1e9;
    for (const it of this.interactables) { const d = Math.hypot(it.x - hero.pos.x, it.z - hero.pos.z); if (d < it.r && d < bd) { bd = d; best = it; } }
    if (!best) return;
    switch (best.kind) {
      case 'shrine': {
        if (!this.shrineRested) {
          this.shrineRested = true;
          for (const h of this.heroes) h.fullRest(!this.vows.has('scarcity'));
          this.run.checkpoint = { depthIndex: this.run.depthIndex, roomIndex: this.run.roomIndex };
          audio.play('shrine', { vol: 0.9 });
          this.ui.banner('Ember Shrine', 'The party rests. Checkpoint kindled.', 2.2);
          this.fx.burst('flame_05', 0, 1, 0, 30, { color: 0xffb060, speed: 4, up: 5 });
        }
        this.ui.openShrine(hero);
        break;
      }
      case 'peddler': this.ui.openShop(hero); break;
      case 'altar': this.ui.openAltar(hero); break;
      case 'chest': {
        this.interactables = this.interactables.filter((i) => i !== best);
        audio.play('chest', { vol: 0.9 });
        if (this.treasureMimic) {
          this.scene.remove(best.obj);
          const m = this.spawnEnemy('mimic', best.x, best.z, {});
          m.state = 'chase'; m.hidden = false; this.combatActive = true; this.cleared = false;
          this.fx.text('MIMIC!', best.x, 3, best.z, { color: '#ff3a1a', big: true }); this.shake(0.4);
          this.treasureMimic = false; this.mimicThenLoot = true;
        } else this.lootChest();
        break;
      }
    }
  }
  lootChest() {
    this.chestPending = false;
    for (const d of this.doors) d.open = true;
    for (let i = 0; i < 8; i++) this.dropAsh(frand(-2, 2), frand(-3, 1), Math.round((60 + this.run.depthIndex * 40) / 2));
    this.heroes.forEach((h) => this.ui.openDraft(h, draftBoons(h, { depth: this.run.depthIndex, minRarity: 'rare', legendaryBoost: 2 })));
  }

  levelUp(hero) {
    const cost = LEVEL_COST[hero.level];
    if (hero.level >= MAX_LEVEL || this.run.ash < cost) return false;
    this.run.ash -= cost;
    hero.level++;
    hero.recompute();
    hero.hp = hero.maxHp; hero.slots = hero.slotsMax;
    audio.play('levelUp', { vol: 0.8 });
    this.fx.burst('star_05', hero.pos.x, 1.5, hero.pos.z, 24, { color: 0xffe48a, speed: 4, up: 6 });
    const feat = hero.cls.features[hero.level];
    this.log(`${hero.label} reaches level ${hero.level}!${feat ? ' ' + feat : ''}`, '#ffe48a');
    if (feat) this.ui.banner(`${hero.label} — Level ${hero.level}`, feat, 2.6);
    if (hero.level === 4 || hero.level === 8) this.ui.openDraft(hero, draftBoons(hero, { depth: this.run.depthIndex, minRarity: 'uncommon' }));
    return true;
  }

  // ---------------------------------------------------------------- doors & transitions
  async useDoor(door) {
    if (this.transitioning) return;
    if (this.ui.anyPanelOpen()) { this.ui.toast('Waiting for everyone to finish choosing…'); return; }
    this.transitioning = true;
    audio.play('door', { vol: 0.8 });
    this.shrineRested = false;
    if (this.roomType === 'boss') {
      if (this.run.depthIndex >= 2) { this.transitioning = false; this.victory(); return; }
      this.run.nextDepth();
      await this.enterRoom('shrine', true);
    } else {
      this.run.advance(door.type);
      await this.enterRoom(door.type);
    }
    this.transitioning = false;
  }

  wipe() {
    if (this.wiping) return;
    this.wiping = true;
    const run = this.run;
    this.timeScale = 0.35;
    audio.voice('game_over');
    setTimeout(async () => {
      this.timeScale = 1;
      run.embers--;
      if (run.embers <= 0) { this.wiping = false; this.gameOver(); return; }
      // drop remains
      run.remains = run.ash > 0 ? { depthIndex: run.depthIndex, roomIndex: run.roomIndex, ash: run.ash } : null;
      run.ash = 0;
      this.ui.banner('The Ember Fades', `${run.embers} ${run.embers === 1 ? 'Ember remains' : 'Embers remain'}. Your Ash lies where you fell.`, 3.2);
      await new Promise((r) => setTimeout(r, 1200));
      run.depthIndex = run.checkpoint.depthIndex; run.roomIndex = run.checkpoint.roomIndex; run.roomType = 'shrine';
      for (const h of this.heroes) h.fullRest(true);
      this.ui.closeAllPanels();
      await this.enterRoom('shrine');
      this.wiping = false;
    }, 2200);
  }

  endRun(won) {
    const run = this.run;
    const vowMarks = [...this.vows].reduce((a, v) => a + (VOWS.find((x) => x.id === v)?.marks || 0), 0);
    const marks = Math.floor(run.roomsCleared / 3) + run.bossesSlain * 3 + run.elitesSlain + (won ? 6 : 0) + Math.round(vowMarks * (run.bossesSlain + (won ? 1 : 0)) * 0.5);
    meta.data.marks += marks;
    meta.data.bestDepth = Math.max(meta.data.bestDepth, run.depthIndex + 1);
    if (won) meta.data.wins++;
    meta.save();
    return marks;
  }
  gameOver() {
    this.mode = 'over';
    audio.music('gameover');
    const marks = this.endRun(false);
    this.ui.showEnd(false, marks);
  }
  victory() {
    this.mode = 'over';
    audio.music('victory'); audio.voice('you_win');
    const marks = this.endRun(true);
    this.ui.showEnd(true, marks);
  }

  // ---------------------------------------------------------------- main update
  update(dt) {
    if (this.hitstopT > 0) { this.hitstopT -= dt; dt *= 0.05; }
    dt *= this.timeScale;
    this.time += dt;
    input.poll(dt / Math.max(0.05, this.timeScale));

    if (this.mode === 'title' || this.mode === 'select') {
      this.titleHeroes && this.titleHeroes.forEach((m) => m.update(dt));
      const a = this.time * 0.07;
      this.camera.position.set(Math.sin(a) * 15, 9.5, Math.cos(a) * 15 + 2);
      this.camera.lookAt(0, 1.6, 0);
      this.updateShrineFire(dt);
      this.fx.update(dt, this.camera);
      return;
    }
    if (this.mode !== 'play') { this.fx.update(dt, this.camera); return; }
    if (this.paused) return;

    // per-hero input (panels capture their owner's controller)
    for (const h of this.heroes) { h.menuLock = this.ui.panelFor(h); }
    for (const h of this.heroes) {
      h.update(dt);
      h.vel.set(0, 0, 0);
    }
    const active = this.heroes.filter((h) => h.canAct);
    const anchor = this.heroes.filter((h) => !h.dead);
    if (anchor.length) {
      const cx = anchor.reduce((a, h) => a + h.pos.x, 0) / anchor.length, cz = anchor.reduce((a, h) => a + h.pos.z, 0) / anchor.length;
      this.leashCenter = { x: cx, z: cz };
    }
    // enemies
    this.flowT = (this.flowT || 0) - dt;
    if (this.flowT <= 0) { this.flowT = 0.35; this.room.computeFlow(active.length ? active.map((h) => h.pos) : this.heroes.map((h) => h.pos)); }
    for (const e of this.enemies) if (e.ready) e.update(dt);
    this.enemies = this.enemies.filter((e) => !e.gone);
    for (const p of this.projectiles) p.update(dt);
    this.projectiles = this.projectiles.filter((p) => p.alive);
    for (const z of this.zones) z.update(dt);
    this.zones = this.zones.filter((z) => z.alive);
    this.updatePickups(dt);
    this.updateSpikes(dt);
    this.updateDoors(dt);
    this.updateShrineFire(dt);
    this.updateInteractPrompts();

    // waves / clear
    if (this.combatActive && !this.cleared) {
      const living = this.enemies.filter((e) => e.alive && !e.thrall);
      const total = this.waves.reduce((a, w) => a + w.length, 0);
      if (this.waveIndex < this.waves.length && living.length <= Math.max(1, Math.floor(total / this.waves.length * 0.3))) this.spawnWave();
      else if (living.length === 0 && this.waveIndex >= this.waves.length && (this.roomType !== 'boss' || !this.boss)) {
        if (this.mimicThenLoot) { this.mimicThenLoot = false; this.combatActive = false; this.lootChest(); this.cleared = true; }
        else if (!this.chestPending) this.setCleared();
      }
    }

    // wipe check
    if (this.heroes.length && this.heroes.every((h) => h.downed || h.dead) && !this.wiping) this.wipe();

    // boss bar
    if (this.boss) this.ui.bossBar(this.boss);

    this.updateCamera(dt);
    this.fx.update(dt, this.camera);
    this.ui.updateHud(dt);
    for (const l of this.logLines) l.t -= dt;
  }

  updatePickups(dt) {
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.t += dt;
      if (p.t < 0.5) { p.vy -= 14 * dt; p.y = Math.max(0.6, p.y + p.vy * dt); p.x += p.vx * dt; p.z += p.vz * dt; }
      else {
        let best = null, bd = 1e9;
        for (const h of this.heroes) if (!h.dead) { const d = Math.hypot(h.pos.x - p.x, h.pos.z - p.z); if (d < bd) { bd = d; best = h; } }
        if (best && (bd < 7 || this.cleared || p.t > 3)) {
          const sp = 10 + p.t * 8;
          p.x += (best.pos.x - p.x) / bd * Math.min(bd, sp * dt); p.z += (best.pos.z - p.z) / bd * Math.min(bd, sp * dt);
          p.y += (1.4 - p.y) * dt * 5;
          if (bd < 0.8) {
            this.run.ash += p.amount; this.fx.group.remove(p.obj); this.pickups.splice(i, 1);
            audio.play('coins', { vol: 0.25 });
            continue;
          }
        } else p.y = 0.8 + Math.sin(p.t * 4 + p.x) * 0.2;
      }
      p.obj.position.set(p.x, p.y, p.z);
      p.obj.scale.setScalar(0.7 + Math.sin(p.t * 10) * 0.15);
    }
  }

  updateSpikes(dt) {
    if (!this.room.spikes.length || !this.combatActive) return;
    for (const s of this.room.spikes) {
      const prev = s.phase % 3.2;
      s.phase += dt;
      const ph = s.phase % 3.2;
      const p = this.room.toWorld(s.i, s.j);
      if (prev < 2.4 && ph >= 2.4) { this.fx.decal('circle_05', { x: p.x, z: p.z, size: 4, color: 0xff3a1a, opacity: 0.5, life: 0.5 }); }
      if (prev < 2.9 && ph >= 2.9) {
        this.fx.burst('scratch_01', p.x, 0.3, p.z, 6, { color: 0xd0d0d0, speed: 1, up: 6, gravity: -20, additive: false });
        for (const h of this.heroes) if (h.canAct && Math.abs(h.pos.x - p.x) < 2 && Math.abs(h.pos.z - p.z) < 2) {
          heroSave(this, h, { ability: 'dex', dc: 12, dice: '2d6', type: 'piercing', label: '(spike trap)' });
        }
        for (const e of this.enemies) if (e.alive && !e.flying && Math.abs(e.pos.x - p.x) < 2 && Math.abs(e.pos.z - p.z) < 2) e.takeDamage(4, null, { poise: 4 });
      }
    }
  }

  updateDoors(dt) {
    for (const d of this.doors) {
      const target = d.open ? 0 : 0.85;
      d.seal.material.opacity += (target - d.seal.material.opacity) * Math.min(1, dt * 4);
      d.seal.visible = d.seal.material.opacity > 0.02;
      d.sign.position.y = 5.2 + Math.sin(this.time * 2 + d.x) * 0.2;
      d.sign.material.opacity = d.open ? 1 : 0.55;
      if (d.open && !this.transitioning) {
        // anywhere across the doorway's width counts, not just its centre
        const ns = d.side === 'N' || d.side === 'S';
        for (const h of this.heroes) {
          if (!h.canAct) continue;
          const along = Math.abs(ns ? h.pos.x - d.x : h.pos.z - d.z), depth = Math.abs(ns ? h.pos.z - d.z : h.pos.x - d.x);
          if (along < 2.1 && depth < 1.8) { this.useDoor(d); break; }
        }
      }
    }
  }

  updateShrineFire(dt) {
    const f = this.shrineFire;
    if (!f) return;
    f.t += dt;
    if (Math.random() < 0.8) this.fx.spawn(Math.random() < 0.5 ? 'flame_03' : 'flame_05', { x: f.x + frand(-0.4, 0.4), y: 0.5, z: f.z + frand(-0.4, 0.4), vy: frand(2, 4), life: frand(0.4, 0.8), size: frand(0.8, 1.6), grow: -0.6, color: 0xff9a40 });
    if (Math.random() < 0.15) this.fx.spawn('spark_06', { x: f.x + frand(-0.5, 0.5), y: 1, z: f.z + frand(-0.5, 0.5), vy: frand(3, 5), vx: frand(-1, 1), life: 1.2, size: 0.3, color: 0xffd080 });
    // drifting ash motes everywhere (atmosphere)
    if (Math.random() < 0.3) this.fx.spawn('spark_04', { x: this.camTarget.x + frand(-18, 18), y: frand(4, 9), z: this.camTarget.z + frand(-12, 12), vy: -0.6, vx: frand(-0.3, 0.3), life: 4, size: 0.18, color: 0xd8c0a0, fade: true, opacity: 0.6, additive: false });
    for (const o of this.extra) if (o.isSprite && o.userData.flicker !== undefined) { o.userData.flicker += dt * 12; o.scale.y = 1.2 + Math.sin(o.userData.flicker) * 0.15; }
  }

  updateInteractPrompts() {
    const prompts = [];
    for (const h of this.heroes) {
      if (!h.canAct || h.menuLock) continue;
      const it = this.interactables.find((i) => Math.hypot(i.x - h.pos.x, i.z - h.pos.z) < i.r);
      if (it && it.auto && it.kind === 'remains') {
        this.run.ash += this.run.remains.ash; this.fx.text(`+${this.run.remains.ash} ASH`, it.x, 2.5, it.z, { color: '#ff9a40', big: true });
        audio.play('coins', { vol: 0.7 }); this.run.remains = null; this.scene.remove(it.obj); this.fx.freeLight(it.light);
        this.interactables = this.interactables.filter((x) => x !== it); continue;
      }
      if (it) prompts.push({ hero: h, text: it.label });
      const down = this.heroes.find((o) => o !== h && o.downed && o.distTo(h) < 3);
      if (down) prompts.push({ hero: h, text: `Hold to revive ${down.label}` });
    }
    for (const d of this.doors) if (!d.open && this.cleared && this.chestPending) { /* chest first */ }
    this.ui.prompts(prompts);
  }

  updateCamera(dt) {
    const hs = this.heroes.filter((h) => !h.dead);
    const list = hs.length ? hs : this.heroes;
    if (!list.length) return;
    let cx = 0, cz = 0;
    for (const h of list) { cx += h.pos.x; cz += h.pos.z; }
    cx /= list.length; cz /= list.length;
    let spread = 0;
    for (const h of list) spread = Math.max(spread, Math.hypot(h.pos.x - cx, h.pos.z - cz));
    if (this.boss && this.cinematic) { cx = this.boss.pos.x; cz = this.boss.pos.z + 2; }
    // look slightly toward the action
    this.camTarget.x += (cx - this.camTarget.x) * Math.min(1, dt * 5);
    this.camTarget.z += (cz - this.camTarget.z) * Math.min(1, dt * 5);
    const want = 1 + Math.max(0, spread - 5) * 0.06 + (this.boss ? 0.15 : 0);
    this.camDist += (want - this.camDist) * Math.min(1, dt * 2);
    const D = this.camDist;
    let sx = 0, sy = 0;
    if (this.shakeT > 0) { this.shakeT = Math.max(0, this.shakeT - dt * 1.8); const s = this.shakeT * 0.9; sx = frand(-s, s); sy = frand(-s, s); }
    // keep the room framed: clamp the look-at point inside the room bounds
    const r = this.room;
    const hx = Math.max(0, r.w * CELL / 2 - 13 * D), hz = Math.max(0, r.h * CELL / 2 - 9 * D);
    const tx = Math.max(-hx, Math.min(hx, this.camTarget.x)), tz = Math.max(-hz - 2, Math.min(hz, this.camTarget.z));
    this.camera.position.set(tx + sx, 21 * D + sy, tz + 24 * D);
    this.camera.lookAt(tx + sx * 0.5, 0.5, tz - 0.5);
  }

  render() {
    if (this.flashT > 0) { this.flashT -= 1 / 60; this.psx.post.uniforms.uFlash.value = Math.max(0, this.flashT / (this.flashMax || 0.2)) * 0.45; } else this.psx.post.uniforms.uFlash.value = 0;
    const dying = this.mode === 'play' && this.heroes.length && this.heroes.every((h) => h.downed || h.dead);
    this.psx.post.uniforms.uDesat.value += ((dying || this.mode === 'over' ? 0.8 : 0) - this.psx.post.uniforms.uDesat.value) * 0.05;
    this.psx.render(this.scene, this.camera, this.time);
    const ctx = this.octx, W = this.overlay.width, H = this.overlay.height;
    ctx.clearRect(0, 0, W, H);
    if (this.mode === 'play' || this.mode === 'over') {
      this.fx.drawTexts(ctx, this.camera, W, H);
      this.drawWorldBars(ctx, W, H);
    }
  }

  drawWorldBars(ctx, W, H) {
    const v = new THREE.Vector3();
    for (const e of this.enemies) {
      if (!e.alive || e.isBoss || e.hidden || !e.ready) continue;
      if (e.hp >= e.maxHp && !e.elite && !e.marked) continue;
      v.set(e.pos.x, e.height + e.hover + 0.5, e.pos.z).project(this.camera);
      const x = Math.round((v.x * 0.5 + 0.5) * W), y = Math.round((-v.y * 0.5 + 0.5) * H);
      const w = e.elite ? 44 : 30;
      ctx.fillStyle = '#000'; ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, 6);
      ctx.fillStyle = e.thrall ? '#8a5cff' : '#c0302a'; ctx.fillRect(x - w / 2, y, Math.round(w * e.hp / e.maxHp), 4);
      if (e.ward > 0) { ctx.fillStyle = '#7fc8ff'; ctx.fillRect(x - w / 2, y - 3, Math.round(w * Math.min(1, e.ward / (e.maxHp * 0.3))), 2); }
      if (e.poise > 0) { ctx.fillStyle = '#ffb347'; ctx.fillRect(x - w / 2, y + 5, Math.round(w * Math.min(1, e.poise / e.poiseMax)), 2); }
      if (e.elite) { ctx.font = '14px VT323'; ctx.textAlign = 'center'; ctx.fillStyle = AFFIXES[e.affixes[0]]?.color || '#ffb347'; ctx.fillText(e.affixes.map((a) => AFFIXES[a].name).join(' · '), x, y - 8); }
      if (e.marked) { ctx.fillStyle = '#9db35c'; ctx.font = '16px VT323'; ctx.textAlign = 'center'; ctx.fillText('◎', x + w / 2 + 8, y + 3); }
    }
    // downed heroes: death save pips
    for (const h of this.heroes) {
      if (!h.downed) continue;
      v.set(h.pos.x, 2.6, h.pos.z).project(this.camera);
      const x = Math.round((v.x * 0.5 + 0.5) * W), y = Math.round((-v.y * 0.5 + 0.5) * H);
      ctx.font = '16px VT323'; ctx.textAlign = 'center';
      ctx.fillStyle = '#7dff8a'; ctx.fillText('✓'.repeat(h.deathSaves.s) + '·'.repeat(3 - h.deathSaves.s), x - 16, y);
      ctx.fillStyle = '#ff4a4a'; ctx.fillText('✗'.repeat(Math.min(3, h.deathSaves.f)) + '·'.repeat(Math.max(0, 3 - h.deathSaves.f)), x + 16, y);
      const reviver = this.heroes.find((o) => o.reviveTarget === h);
      if (reviver) { ctx.fillStyle = '#000'; ctx.fillRect(x - 21, y + 8, 42, 6); ctx.fillStyle = '#7dff8a'; ctx.fillRect(x - 20, y + 9, Math.round(40 * Math.min(1, reviver.reviveProgress / 1.3)), 4); }
    }
  }
}
