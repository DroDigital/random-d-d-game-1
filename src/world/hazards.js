// Interactive room objects built from room.dynamic (see dress.js):
//  breakable  urns / pots / crates / barrels: block movement, shatter on any hit, drop Ash
//  keg        powder keg: a hit lights the fuse, then it blows up — hurting heroes
//             and foes alike, breaking props, burning webs and setting off other kegs
//  saw        a blade running back and forth along a groove in the floor
//  vent       a floor vent that glows, then erupts in a column of fire
//  pod        a spore pod that bursts into a poison cloud when anyone gets close
//  web        sticky webbing that slows everything in it; fire burns it away
//  lava       molten pools (impassable) with a churning surface
import * as THREE from 'three';
import { frand, rollDice } from '../core/rules.js';
import { heroSave, applyDamage } from '../entities/combat.js';
import { audio } from '../core/audio.js';
import { input } from '../core/input.js';
import { t } from '../i18n/index.js';

const POTTERY = new Set(['px:urn', 'px:vase', 'px:lidded_urn', 'px:storage_pot', 'px:crock']);

let webTex = null;
function makeWebTexture() {
  if (webTex) return webTex;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.strokeStyle = 'rgba(235,235,225,0.85)'; g.lineWidth = 1.4;
  const cx = 64, cy = 64, spokes = 11;
  const ang = []; for (let i = 0; i < spokes; i++) ang.push(i / spokes * Math.PI * 2 + (Math.random() - 0.5) * 0.25);
  for (const a of ang) { g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * 62, cy + Math.sin(a) * 62); g.stroke(); }
  for (let r = 8; r < 62; r += 7 + Math.random() * 3) {
    g.beginPath();
    ang.forEach((a, i) => { const rr = r * (0.92 + Math.random() * 0.12); const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr; if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); });
    g.closePath(); g.stroke();
  }
  webTex = new THREE.CanvasTexture(c); webTex.colorSpace = THREE.SRGBColorSpace;
  return webTex;
}

const LAVA_VS = `varying vec2 vW; void main(){
  vec4 w = vec4(position, 1.0);
  #ifdef USE_INSTANCING
    w = instanceMatrix * w;
  #endif
  w = modelMatrix * w; vW = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const LAVA_FS = `uniform float uTime; varying vec2 vW;
  float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
  void main(){
    vec2 p = vW * 0.45;
    float v = n(p + vec2(uTime * 0.12, uTime * 0.05)) * 0.55 + n(p * 2.3 - vec2(uTime * 0.2, -uTime * 0.1)) * 0.3 + n(p * 5.1 + uTime * 0.3) * 0.15;
    float crust = smoothstep(0.44, 0.56, v);
    vec3 hot = mix(vec3(1.0, 0.62, 0.16), vec3(0.78, 0.14, 0.02), smoothstep(0.18, 0.44, v));
    float pulse = 0.85 + 0.15 * sin(uTime * 2.0 + v * 9.0);
    vec3 col = mix(hot * pulse, vec3(0.09, 0.025, 0.02) + vec3(0.25, 0.05, 0.0) * (1.0 - smoothstep(0.56, 0.7, v)), crust);
    gl_FragColor = vec4(col, 1.0);
  }`;

export class Hazards {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.group = new THREE.Group();
    game.scene.add(this.group);
    this.time = 0;
    this.booms = [];
    this.lavaMat = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 } }, vertexShader: LAVA_VS, fragmentShader: LAVA_FS, fog: false });
  }

  clear() {
    for (const o of [...this.group.children]) this.group.remove(o);
    this.list = []; this.booms = []; this.lava = null;
  }

  build(room) {
    this.room = room;
    for (const d of room.dynamic || []) this.add(d);
    if (room.lavaCells && room.lavaCells.length) this.buildLava(room);
    for (const h of room.halos || []) this.game.atmos.addHalo(h.x, h.y, h.z, h.color, { size: h.size, sparks: false, opacity: 0.22 });
  }

  add(d) {
    const g = this.game, kit = g.kit;
    const o = { ...d, alive: true };
    if (d.type === 'breakable') {
      o.obj = kit.clone(d.name); o.obj.position.set(d.x, 0, d.z); o.obj.rotation.y = d.rot; o.obj.scale.setScalar(d.s);
      o.col = { x: d.x, z: d.z, r: 0.42 * d.s, on: true, haz: o }; this.room.colliders.push(o.col);
      o.hittable = true; o.pottery = POTTERY.has(d.name);
    } else if (d.type === 'keg') {
      o.obj = kit.clone('px:powder_keg'); o.obj.position.set(d.x, 0, d.z); o.obj.rotation.y = d.rot; o.obj.scale.setScalar(1.35);
      o.col = { x: d.x, z: d.z, r: 0.62, on: true, haz: o }; this.room.colliders.push(o.col);
      o.hittable = true; o.fuse = -1;
      o.mats = []; o.obj.traverse((m) => { if (m.isMesh) { m.material = m.material.clone(); m.material.emissive = new THREE.Color(0, 0, 0); o.mats.push(m.material); } });
      // a skull-and-crossbones warning mark on the floor
      o.mark = g.fx.decal('symbol_02', { x: d.x, z: d.z, size: 2.2, color: 0xff4a2a, opacity: 0.35, life: 1e9, additive: true });
    } else if (d.type === 'saw') {
      const len = Math.hypot(d.bx - d.ax, d.bz - d.az);
      const groove = new THREE.Mesh(new THREE.PlaneGeometry(len + 1.4, 0.45), new THREE.MeshBasicMaterial({ color: 0x050403, transparent: true, opacity: 0.85, depthWrite: false }));
      groove.rotation.x = -Math.PI / 2; groove.rotation.z = -Math.atan2(d.bz - d.az, d.bx - d.ax);
      groove.position.set((d.ax + d.bx) / 2, 0.075, (d.az + d.bz) / 2); this.group.add(groove);
      o.obj = new THREE.Group();
      const blade = kit.clone('px:saw_blade_trap'); blade.scale.setScalar(1.9); blade.position.y = -0.35; o.obj.add(blade); o.blade = blade;
      o.len = len; o.hitCd = new Map();
    } else if (d.type === 'vent') {
      o.scorch = g.fx.decal('scorch_02', { x: d.x, z: d.z, size: 3.4, color: 0x000000, opacity: 0.85, life: 1e9, additive: false, y: 0.09 });
      o.ring = g.fx.decal('circle_03', { x: d.x, z: d.z, size: 2.4, color: 0x7a3a20, opacity: 0.6, life: 1e9, additive: false, y: 0.1 });
      o.glow = g.fx.decal('circle_05', { x: d.x, z: d.z, size: 3.2, color: 0xff5a1a, opacity: 0.0, life: 1e9, additive: true, y: 0.12 });
      o.t = d.phase; o.state = 'idle';
    } else if (d.type === 'pod') {
      o.obj = kit.clone(Math.random() < 0.5 ? 'px:cocoon' : 'px:spider_egg_sac', null, { color: 0x7dff6a, k: 0.45 }); o.obj.position.set(d.x, 0, d.z); o.obj.scale.setScalar(1.5); o.obj.rotation.y = (Math.random() - 0.5) * 0.5;
      o.col = { x: d.x, z: d.z, r: 0.5, on: true, haz: o }; this.room.colliders.push(o.col);
      o.hittable = true; o.fuse = -1;
      this.game.atmos.addHalo(d.x, 0.9, d.z, 0x6aff5a, { size: 1.8, sparks: false, opacity: 0.25 });
    } else if (d.type === 'web') {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(d.r * 2, d.r * 2), new THREE.MeshBasicMaterial({ map: makeWebTexture(), transparent: true, opacity: 0.75, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.rotation.z = Math.random() * 6.28; m.position.set(d.x, 0.1, d.z);
      o.obj = m;
    }
    if (o.obj) this.group.add(o.obj);
    this.list.push(o);
    return o;
  }

  buildLava(room) {
    const geo = new THREE.PlaneGeometry(4.02, 4.02); geo.rotateX(-Math.PI / 2);
    const im = new THREE.InstancedMesh(geo, this.lavaMat, room.lavaCells.length);
    const m4 = new THREE.Matrix4();
    room.lavaCells.forEach((c, i) => { m4.makeTranslation(c.x, 0.16, c.z); im.setMatrixAt(i, m4); });
    im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere();
    this.group.add(im);
    this.lava = room.lavaCells;
    // a crust of rocks round the rims and a warm glow
    const kit = this.game.kit;
    for (const c of room.lavaCells) {
      this.game.atmos.addHalo(c.x, 0.8, c.z, 0xff6a1a, { size: 4.2, sparks: false, opacity: 0.3 });
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (room.lavaCells.some((q) => q.i === c.i + dx && q.j === c.j + dz)) continue;
        const r = kit.clone('rocks_small'); r.position.set(c.x + dx * 1.9 + frand(-0.6, 0.6) * (dz ? 1 : 0), 0, c.z + dz * 1.9 + frand(-0.6, 0.6) * (dx ? 1 : 0)); r.rotation.y = frand(0, 6.28);
        this.group.add(r);
      }
    }
  }

  // ---------------------------------------------------------------- triggers
  // melee swing: anything hittable in the hero's reach and arc
  hitArc(actor, reach, arc) {
    for (const o of this.list) {
      if (!o.alive || !o.hittable) continue;
      const d = Math.hypot(o.x - actor.pos.x, o.z - actor.pos.z);
      if (d > reach + 0.9) continue;
      if (arc < 360 && d > 0.8 && Math.abs(actor.angleDiff(Math.atan2(o.z - actor.pos.z, o.x - actor.pos.x), actor.facing)) > (arc / 2) * Math.PI / 180 + 0.3) continue;
      this.hit(o, actor);
    }
  }
  // a projectile in flight: returns true if it struck something solid
  projectile(p) {
    const fire = ['firebolt', 'produceflame', 'fireball', 'ray', 'necrobolt'].includes(p.kind);
    for (const o of this.list) {
      if (!o.alive) continue;
      if (o.type === 'web' && fire && Math.hypot(o.x - p.x, o.z - p.z) < o.r) { this.burnWeb(o); continue; }
      if (!o.hittable) continue;
      if (Math.hypot(o.x - p.x, o.z - p.z) < (o.col ? o.col.r : 0.5) + 0.35) { this.hit(o, p.enemy ? null : p.owner); return true; }
    }
    return false;
  }
  // an explosion / big impact: break, light and burn everything in radius
  blast(x, z, r, source) {
    for (const o of this.list) {
      if (!o.alive) continue;
      const d = Math.hypot(o.x - x, o.z - z);
      if (o.type === 'web' && d < r + o.r * 0.5) this.burnWeb(o);
      else if (o.hittable && d < r + 0.4) {
        if (o.type === 'keg' && o.fuse < 0) { o.fuse = 0.12 + d * 0.05; o.source = source; this.startFuse(o, true); }
        else if (o.type !== 'keg') this.hit(o, source);
      }
    }
  }
  // a boss smashing through a prop
  smash(col) { if (col.haz && col.haz.alive) this.hit(col.haz, null); }

  hit(o, source) {
    if (!o.alive) return;
    if (o.type === 'breakable') this.breakProp(o, source);
    else if (o.type === 'keg') { if (o.fuse < 0) { o.fuse = 0.6; o.source = source; this.startFuse(o, false); } }
    else if (o.type === 'pod') { if (o.fuse < 0) { o.fuse = 0.15; o.source = source; } }
  }

  breakProp(o, source) {
    const g = this.game;
    o.alive = false; this.group.remove(o.obj); if (o.col) o.col.on = false;
    const col = o.pottery ? 0xb86a44 : 0x8a6a4a;
    g.fx.burst('dirt_02', o.x, 0.9, o.z, 12, { color: col, speed: 6, up: 6, gravity: -16, additive: false, size: 0.6 });
    g.fx.burst('smoke_07', o.x, 0.6, o.z, 3, { color: 0x6a5a4a, speed: 1.5, up: 1, additive: false, size: 1.2 });
    audio.play(o.pottery ? 'bone' : 'hitHeavy', { vol: 0.45 });
    if (Math.random() < 0.7) g.dropAsh(o.x, o.z, Math.round(frand(6, 22)));
    const hero = source && source.isHero ? source : null;
    if (hero && Math.random() < 0.07 && hero.potions < hero.potionsMax) { hero.potions++; g.fx.text('+1 POTION', o.x, 2.5, o.z, { color: '#ff8a8a' }); g.ui.refreshHud(); }
  }

  startFuse(o, quick) {
    audio.play('cast', { vol: quick ? 0.25 : 0.5 });
    this.game.fx.text(quick ? '!' : t('FUSE LIT!'), o.x, 2.6, o.z, { color: '#ffb347', size: quick ? 1.2 : 0.9 });
  }

  burnWeb(o) {
    o.alive = false; this.group.remove(o.obj);
    this.game.fx.burst('flame_03', o.x, 0.4, o.z, 14, { color: 0xff8a3a, speed: 3, up: 3, spread: 4 });
  }

  explode(o) {
    const g = this.game, x = o.x, z = o.z, R = 3.9;
    o.alive = false; this.group.remove(o.obj); if (o.col) o.col.on = false; if (o.mark) g.fx.removeDecal(o.mark);
    // animated blast sprite (Kenney explosion strip) + fire, smoke, light, shock
    const tex = g.fx.tex.explosion.clone(); tex.needsUpdate = true; tex.repeat.set(1 / 9, 1);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    spr.position.set(x, 2.2, z); spr.scale.set(8.5, 8.5, 1); this.group.add(spr);
    this.booms.push({ spr, tex, t: 0 });
    g.fx.burst('flame_05', x, 1, z, 26, { color: 0xff7a2f, speed: 10, up: 6, size: 1.7 });
    g.fx.burst('smoke_07', x, 1.6, z, 10, { color: 0x2a2020, speed: 3.5, up: 3, size: 2.6, additive: false, life: 1.1 });
    g.fx.burst('dirt_02', x, 1, z, 14, { color: 0x5a4030, speed: 9, up: 9, gravity: -18, additive: false, size: 0.6 });
    g.fx.decal('scorch_02', { x, z, size: 7.5, color: 0x000000, opacity: 0.75, life: 30, additive: false });
    g.fx.decal('circle_05', { x, z, size: 3, color: 0xffd0a0, opacity: 0.8, life: 0.4, grow: 2.6 });
    g.fx.light({ x, y: 2.5, z, color: 0xff7a2a, intensity: 34, distance: 24, life: 0.6 });
    g.shake(0.75); g.hitstop(0.06); g.flash(0.08, '#ffb070', 0.18); g.aberr = Math.max(g.aberr || 0, 0.5);
    audio.play('explode', { vol: 1 });
    input_rumble(g, 0.6);
    const src = o.source && o.source.isHero ? o.source : null;
    for (const h of g.heroes) {
      if (!h.canAct) continue;
      const d = Math.hypot(h.pos.x - x, h.pos.z - z);
      if (d > R + h.radius * 0.5) continue;
      heroSave(g, h, { ability: 'dex', dc: 13, dice: '3d6', type: 'fire', label: t('(powder keg)') });
      const a = Math.atan2(h.pos.z - z, h.pos.x - x); h.knock.x += Math.cos(a) * 14; h.knock.z += Math.sin(a) * 14;
    }
    for (const e of g.enemies) {
      if (!e.alive || e.hidden) continue;
      const d = Math.hypot(e.pos.x - x, e.pos.z - z);
      if (d > R + e.radius * 0.5) continue;
      const a = Math.atan2(e.pos.z - z, e.pos.x - x);
      applyDamage(g, src, e, [{ amount: rollDice('4d6') + (e.isBoss ? 6 : 0), type: 'fire' }], { knock: e.isBoss ? 0 : 12, angle: a, poise: 2, heavy: true });
    }
    this.blast(x, z, R, o.source);
  }

  burstPod(o) {
    const g = this.game;
    o.alive = false; this.group.remove(o.obj); if (o.col) o.col.on = false;
    g.fx.burst('smoke_03', o.x, 0.8, o.z, 16, { color: 0x9be36a, speed: 4, up: 2, additive: false, size: 1.6, life: 0.9 });
    audio.play('magicHit', { vol: 0.5 });
    g.spawnZone({ kind: 'spores', owner: null, x: o.x, z: o.z, radius: 2.6, life: 5 });
    const src = o.source && o.source.isHero ? o.source : null;
    for (const e of g.enemies) if (e.alive && !e.flying && Math.hypot(e.pos.x - o.x, e.pos.z - o.z) < 2.8) { applyDamage(g, src, e, [{ amount: rollDice('2d6'), type: 'poison' }], { impact: false }); e.addCond('poisoned', 3); }
  }

  // ---------------------------------------------------------------- update
  update(dt) {
    const g = this.game;
    this.time += dt;
    this.lavaMat.uniforms.uTime.value = this.time;
    const live = g.mode === 'play' && g.combatActive && !g.paused;
    const actors = g.mode === 'play' ? [...g.heroes.filter((h) => h.canAct), ...g.enemies.filter((e) => e.alive && !e.hidden && e.ready)] : [];
    for (const o of this.list) {
      if (!o.alive) continue;
      if (o.type === 'keg' && o.fuse >= 0) {
        o.fuse -= dt;
        const blink = Math.sin(this.time * 40) > 0 ? 1 : 0.2;
        for (const m of o.mats) m.emissive.setRGB(blink, 0.25 * blink, 0);
        if (Math.random() < 0.7) g.fx.spawn('spark_06', { x: o.x + frand(-0.2, 0.2), y: 1.5, z: o.z + frand(-0.2, 0.2), vx: frand(-2, 2), vy: frand(2, 5), vz: frand(-2, 2), life: 0.35, size: 0.25, color: 0xffd080 });
        if (o.fuse <= 0) this.explode(o);
      } else if (o.type === 'pod') {
        if (o.fuse < 0 && actors.some((a) => !a.flying && Math.hypot(a.pos.x - o.x, a.pos.z - o.z) < 2.0)) { o.fuse = 0.6; }
        if (o.fuse >= 0) {
          o.fuse -= dt;
          const k = 1 + Math.sin(this.time * 30) * 0.12; o.obj.scale.set(1.5 * k, 1.5 / k, 1.5 * k);
          if (o.fuse <= 0) this.burstPod(o);
        }
      } else if (o.type === 'web') {
        for (const a of actors) if (!a.flying && Math.hypot(a.pos.x - o.x, a.pos.z - o.z) < o.r) a.addCond('webbed', 0.15);
      } else if (o.type === 'saw') {
        o.phase += dt * 1.1;
        const k = 0.5 - 0.5 * Math.cos(o.phase);
        const x = o.ax + (o.bx - o.ax) * k, z = o.az + (o.bz - o.az) * k;
        o.obj.position.set(x, 0, z);
        o.blade.rotation.z = -this.time * 14;
        if (Math.random() < 0.35) g.fx.spawn('spark_04', { x, y: 0.3, z, vx: frand(-3, 3), vy: frand(2, 5), vz: frand(-1, 1) + 2, life: 0.25, size: 0.2, color: 0xfff0c0 });
        if (!live) continue;
        for (const a of actors) {
          if (a.flying || Math.hypot(a.pos.x - x, a.pos.z - z) > 0.9 + a.radius * 0.5) continue;
          const last = o.hitCd.get(a) || 0;
          if (this.time - last < 0.7) continue;
          o.hitCd.set(a, this.time);
          g.fx.blood(a.pos.x, a.pos.z, 0x8a1020, 6); audio.play('slice', { vol: 0.6 });
          if (a.isHero) heroSave(g, a, { ability: 'dex', dc: 12, dice: '2d6', type: 'slashing', label: t('(saw blade)') });
          else applyDamage(g, null, a, [{ amount: rollDice('2d6'), type: 'slashing' }], { impact: false, poise: 1 });
        }
      } else if (o.type === 'vent') {
        if (!live) { o.glow.opacity = 0; continue; }
        const prev = o.t; o.t = (o.t + dt) % 3.8;
        const W0 = 2.2, F0 = 2.9, F1 = 3.8;
        if (prev < W0 && o.t >= W0) { g.fx.telegraph('circle', { x: o.x, z: o.z, radius: 1.8, time: F0 - W0, color: 0xff5a1a }); audio.play('cast', { vol: 0.25 }); }
        const warm = o.t >= W0 && o.t < F0 ? (o.t - W0) / (F0 - W0) : o.t >= F0 ? 1 - (o.t - F0) / (F1 - F0) : 0.05;
        o.glow.opacity = 0.15 + warm * 0.7;
        if (o.t >= W0 && o.t < F0 && Math.random() < 0.5) g.fx.spawn('spark_06', { x: o.x + frand(-0.6, 0.6), y: 0.3, z: o.z + frand(-0.6, 0.6), vy: frand(2, 4), life: 0.4, size: 0.25, color: 0xffa050 });
        if (o.t >= F0) {
          for (let q = 0; q < 3; q++) g.fx.spawn(Math.random() < 0.5 ? 'flame_05' : 'flame_03', { x: o.x + frand(-0.5, 0.5), y: 0.4, z: o.z + frand(-0.5, 0.5), vy: frand(8, 13), life: frand(0.35, 0.55), size: frand(1.4, 2.2), grow: 1, color: 0xff7a2f });
          if (prev < F0) {
            g.fx.light({ x: o.x, y: 3, z: o.z, color: 0xff6a1a, intensity: 22, distance: 14, life: 0.9 });
            audio.play('explode', { vol: 0.35 }); g.shake(0.12);
            for (const a of actors) {
              if (a.flying || Math.hypot(a.pos.x - o.x, a.pos.z - o.z) > 1.8 + a.radius * 0.5) continue;
              if (a.isHero) heroSave(g, a, { ability: 'dex', dc: 13, dice: '3d6', type: 'fire', label: t('(flame vent)') });
              else applyDamage(g, null, a, [{ amount: rollDice('3d6'), type: 'fire' }], { impact: false });
            }
            this.blast(o.x, o.z, 1.6, null);
          }
        }
      }
    }
    for (let i = this.booms.length - 1; i >= 0; i--) {
      const b = this.booms[i]; b.t += dt;
      const f = Math.floor(b.t / 0.055);
      if (f >= 9) { this.group.remove(b.spr); b.spr.material.dispose(); b.tex.dispose(); this.booms.splice(i, 1); continue; }
      b.tex.offset.x = f / 9; b.spr.scale.setScalar(8.5 + b.t * 3);
    }
  }
}

function input_rumble(g, k) { for (const h of g.heroes) if (h.controllerId) input.rumble(h.controllerId, k, 220); }
