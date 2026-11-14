// Visual effects: Kenney particle sprites, ground telegraphs, slash arcs, the
// physical d20s that tumble out of every attack, floating combat text drawn on
// a low-res overlay canvas, and a fixed pool of point lights.
import * as THREE from 'three';
import { loadTexture, loadGLTF } from '../core/assets.js';
import { psxify, retroify } from './psx.js';
import { frand } from '../core/rules.js';
import { t, canvasFont } from '../i18n/index.js';

const FX_TEX = ['slash_02', 'slash_03', 'magic_02', 'magic_04', 'magic_05', 'fire_01', 'flame_03', 'flame_05', 'spark_04', 'spark_06', 'smoke_03', 'smoke_07',
  'star_05', 'star_07', 'circle_03', 'circle_05', 'light_02', 'twirl_02', 'scorch_02', 'symbol_01', 'symbol_02', 'trace_04', 'flare_01', 'dirt_02', 'scratch_01'];
const CRAWL_FX = ['effect_magic_dart0', 'effect_flame0', 'effect_icicle0', 'effect_drain0', 'effect_orb_glow0', 'effect_cloud_poison0', 'effect_cloud_fire0', 'effect_sanctuary', 'effect_cloud_spectral0', 'effect_bolt04',
  'dngn_floor_sigil_circle', 'dngn_floor_cobble_blood3', 'dngn_floor_cobble_blood7', 'dngn_altars_nemelex1', 'dngn_altars_makhleb_flame1'];

export class FX {
  constructor(game) {
    this.game = game; this.scene = game.scene;
    this.tex = {}; this.particles = []; this.decals = []; this.texts = []; this.dice = []; this.lights = [];
    this.group = new THREE.Group(); this.scene.add(this.group);
  }

  async load() {
    await Promise.all(FX_TEX.map(async (n) => { this.tex[n] = await loadTexture('assets/fx/' + n + '.png', { pixel: false }); }));
    await Promise.all(CRAWL_FX.map(async (n) => { this.tex[n] = await loadTexture('assets/sprites/crawl/' + n + '.png'); }));
    this.tex.lightmask = await loadTexture('assets/fx/lightmask.png', { pixel: false });
    this.diceModels = {};
    for (const c of ['red', 'blue', 'green', 'yellow']) {
      const g = await loadGLTF('assets/models/dice/D20_' + c + '.gltf');
      this.diceModels[c] = retroify(g.scene);
    }
    // shared blob shadow
    this.shadowMat = new THREE.MeshBasicMaterial({ map: this.tex.circle_05, color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false });
    this.shadowGeo = new THREE.PlaneGeometry(1, 1); this.shadowGeo.rotateX(-Math.PI / 2);
    // light pool (fixed count => shaders compile once)
    for (let i = 0; i < 12; i++) {
      const l = new THREE.PointLight(0xffaa66, 0, 14, 1.3);
      l.userData = { life: 0, max: 0, base: 0, flicker: 0, owner: null };
      this.scene.add(l); this.lights.push(l);
    }
  }

  blobShadow(size = 1.6) {
    const m = new THREE.Mesh(this.shadowGeo, this.shadowMat);
    m.scale.set(size, 1, size); m.position.y = 0.06; m.renderOrder = 1;
    return m;
  }

  // ---- lights
  light({ x, y = 2, z, color = 0xffaa66, intensity = 6, distance = 12, life = 0.3, flicker = 0, owner = null }) {
    let l = this.lights.find((q) => q.userData.life <= 0 && !q.userData.persistent);
    if (!l) l = this.lights.filter((q) => !q.userData.persistent).sort((a, b) => a.userData.life - b.userData.life)[0];
    if (!l) return null;
    l.position.set(x, y, z); l.color.set(color); l.distance = distance;
    Object.assign(l.userData, { life, max: life, base: intensity, flicker, owner });
    l.intensity = intensity;
    return l;
  }
  persistentLight(opts) {
    const l = this.light({ ...opts, life: 1 });
    if (l) { l.userData.persistent = true; l.userData.life = 1e9; }
    return l;
  }
  freeLight(l) { if (l) { l.userData.persistent = false; l.userData.life = 0; l.intensity = 0; } }
  clearLights() { for (const l of this.lights) { l.userData.persistent = false; l.userData.life = 0; l.intensity = 0; } }

  // ---- particles
  spawn(tex, { x, y = 1, z, vx = 0, vy = 0, vz = 0, life = 0.6, size = 1, grow = 0, color = 0xffffff, additive = true, gravity = 0, spin = 0, fade = true, opacity = 1 }) {
    const t = this.tex[tex];
    if (!t) return null;
    let p = this.particles.find((q) => !q.alive && q.tex === tex && q.additive === additive);
    if (!p) {
      const mat = new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
      const s = new THREE.Sprite(mat);
      p = { sprite: s, tex, additive, alive: false };
      this.group.add(s); this.particles.push(p);
    }
    Object.assign(p, { alive: true, x, y, z, vx, vy, vz, life, max: life, size, grow, gravity, spin, fade, opacity, rot: frand(0, 6.28) });
    p.sprite.visible = true;
    p.sprite.material.color.set(color);
    p.sprite.material.opacity = opacity;
    p.sprite.position.set(x, y, z);
    p.sprite.scale.set(size, size, 1);
    return p;
  }
  burst(tex, x, y, z, n, { speed = 4, life = 0.5, size = 0.8, color = 0xffffff, up = 2, gravity = 0, additive = true, spread = 1 } = {}) {
    for (let i = 0; i < n; i++) {
      const a = frand(0, Math.PI * 2), s = frand(0.3, 1) * speed;
      this.spawn(tex, { x: x + frand(-0.3, 0.3) * spread, y, z: z + frand(-0.3, 0.3) * spread, vx: Math.cos(a) * s, vz: Math.sin(a) * s, vy: frand(0.2, 1) * up,
        life: life * frand(0.7, 1.2), size: size * frand(0.7, 1.3), color, gravity, additive, grow: -size * 0.5 });
    }
  }
  blood(x, z, color = 0x8a1020, n = 8) {
    this.burst('dirt_02', x, 1.4, z, n, { speed: 5, life: 0.5, size: 0.5, color, up: 4, gravity: -14, additive: false });
  }

  // ---- ground decals (telegraphs, scorch, sigils)
  decal(tex, { x, z, size = 3, color = 0xffffff, life = 1, opacity = 0.8, additive = true, rot = 0, fadeIn = 0, y = 0.08, grow = 0 }) {
    const mat = new THREE.MeshBasicMaterial({ map: this.tex[tex] || null, color, transparent: true, opacity: 0, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
    m.rotation.x = -Math.PI / 2; m.rotation.z = rot; m.position.set(x, y, z);
    this.group.add(m);
    const d = { mesh: m, life, max: life, opacity, fadeIn, grow };
    this.decals.push(d);
    return d;
  }
  // red danger telegraph: circle / cone / line that fills as the attack charges
  telegraph(shape, { x, z, radius = 3, angle = 0, arc = Math.PI / 2, length = 6, width = 2, time = 0.8, color = 0xff2a1a }) {
    let geo;
    if (shape === 'circle') geo = new THREE.CircleGeometry(radius, 28);
    else if (shape === 'ring') geo = new THREE.RingGeometry(radius * 0.82, radius, 36);
    else if (shape === 'cone') geo = new THREE.CircleGeometry(radius, 24, -arc / 2, arc);
    else { geo = new THREE.PlaneGeometry(width, length); geo.translate(0, length / 2, 0); }
    geo.rotateX(-Math.PI / 2);
    const isLine = shape === 'line';
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uFill: { value: 0 }, uColor: { value: new THREE.Color(color) }, uTime: { value: 0 }, uR: { value: isLine ? length : radius }, uLine: { value: isLine ? 1 : 0 } },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float uFill; uniform vec3 uColor; uniform float uTime; uniform float uR; uniform float uLine; varying vec3 vP;
        void main(){
          float d = uLine > 0.5 ? -vP.z : length(vP.xz);
          float stripe = step(0.5, fract((vP.x + vP.z) * 0.9 - uTime * 2.5));
          float a = 0.16 + 0.1 * stripe;
          float fill = step(d, uR * uFill) * 0.5;
          float rim = smoothstep(uR * 0.9, uR, d) * 0.5;
          gl_FragColor = vec4(uColor * (a + fill + rim), 1.0);
        }`,
    });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, 0.1, z);
    m.rotation.y = isLine ? -angle - Math.PI / 2 : -angle;
    this.group.add(m);
    const t = { mesh: m, life: time, max: time, tele: true };
    this.decals.push(t);
    return t;
  }
  removeDecal(d) { if (d) d.life = 0; }

  // a flat slash arc sprite in front of an attacker
  slash(x, z, angle, { size = 4, color = 0xfff1d0, tex = 'slash_03', life = 0.2, y = 1.3 } = {}) {
    const mat = new THREE.MeshBasicMaterial({ map: this.tex[tex], color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
    m.rotation.x = -Math.PI / 2; m.rotation.z = angle - Math.PI / 2;
    m.position.set(x + Math.cos(angle) * size * 0.35, y, z + Math.sin(angle) * size * 0.35);
    this.group.add(m);
    this.decals.push({ mesh: m, life, max: life, opacity: 1, slash: true });
  }

  // ---- floating text (drawn on the overlay canvas each frame)
  text(str, x, y, z, { color = '#fff', size = 1, life = 1.0, vy = 1.6, big = false, drift = 0, shake = false } = {}) {
    this.texts.push({ str: t(String(str)), x, y, z, color, size, life, max: life, vy: vy * (big ? 1.3 : 1), big, shake, drift: drift || frand(-0.4, 0.4) });
  }

  // ---- 3D d20 that tumbles and lands showing the roll
  die({ x, y = 3, z, value, color = 'red', label = null, good = null }) {
    const model = this.diceModels[color] || this.diceModels.red;
    const m = model.clone();
    m.scale.setScalar(0.9);
    m.position.set(x, y, z);
    this.group.add(m);
    const d = { mesh: m, value, x, y, z, vy: 6, life: 0.95, max: 0.95, spin: new THREE.Vector3(frand(8, 14), frand(8, 14), frand(6, 12)), label, good, shown: false };
    this.dice.push(d);
    if (this.dice.length > 14) { const o = this.dice.shift(); this.group.remove(o.mesh); }
  }

  update(dt, camera) {
    for (const p of this.particles) {
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) { p.alive = false; p.sprite.visible = false; continue; }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.gravity && p.y < 0.1) { p.y = 0.1; p.vx *= 0.5; p.vz *= 0.5; p.vy = 0; }
      p.vx *= 0.96; p.vz *= 0.96;
      const k = p.life / p.max;
      const s = Math.max(0.01, p.size + p.grow * (1 - k));
      p.sprite.position.set(p.x, p.y, p.z);
      p.sprite.scale.set(s, s, 1);
      p.rot += p.spin * dt; p.sprite.material.rotation = p.rot;
      p.sprite.material.opacity = p.fade ? p.opacity * Math.min(1, k * 2) : p.opacity;
    }
    for (let i = this.decals.length - 1; i >= 0; i--) {
      const d = this.decals[i];
      d.life -= dt;
      const k = Math.max(0, d.life / d.max);
      if (d.tele) { d.mesh.material.uniforms.uFill.value = 1 - k; d.mesh.material.uniforms.uTime.value += dt; }
      else if (d.slash) { d.mesh.material.opacity = k; d.mesh.scale.setScalar(1 + (1 - k) * 0.3); }
      else {
        const fin = d.fadeIn ? Math.min(1, (d.max - d.life) / d.fadeIn) : 1;
        d.mesh.material.opacity = d.opacity * Math.min(1, k * 3) * fin;
        if (d.grow) d.mesh.scale.setScalar(1 + (1 - k) * d.grow);
      }
      if (d.life <= 0) { this.group.remove(d.mesh); d.mesh.geometry.dispose(); d.mesh.material.dispose(); this.decals.splice(i, 1); }
    }
    for (let i = this.dice.length - 1; i >= 0; i--) {
      const d = this.dice[i];
      d.life -= dt;
      const t = 1 - d.life / d.max;
      if (t < 0.55) {
        d.vy -= 26 * dt; d.y += d.vy * dt; if (d.y < 1.2) { d.y = 1.2; d.vy = Math.abs(d.vy) * 0.35; }
        d.mesh.rotation.x += d.spin.x * dt * (1 - t); d.mesh.rotation.y += d.spin.y * dt * (1 - t); d.mesh.rotation.z += d.spin.z * dt * (1 - t);
      } else if (!d.shown) {
        d.shown = true;
        const col = d.value === 20 ? '#ffd23f' : d.value === 1 ? '#ff3b3b' : d.good === true ? '#f4ecd6' : d.good === false ? '#9aa0a8' : '#f4ecd6';
        this.text(d.value, d.x, d.y + 1.2, d.z, { color: col, big: true, life: 0.7, vy: 0.6, drift: 0.001 });
      }
      d.mesh.position.set(d.x, d.y, d.z);
      if (d.life < 0.15) d.mesh.scale.setScalar(Math.max(0.01, d.life / 0.15) * 0.9);
      if (d.life <= 0) { this.group.remove(d.mesh); this.dice.splice(i, 1); }
    }
    for (const l of this.lights) {
      const u = l.userData;
      if (u.persistent) {
        if (u.flicker) l.intensity = u.base * (1 - u.flicker * 0.5 + Math.sin(performance.now() * 0.013 + l.id) * u.flicker * 0.25 + Math.random() * u.flicker * 0.25);
        if (u.owner) { l.position.set(u.owner.pos.x, (u.ownerY || 3), u.owner.pos.z); }
        continue;
      }
      if (u.life > 0) { u.life -= dt; l.intensity = u.base * Math.max(0, u.life / u.max); if (u.life <= 0) l.intensity = 0; }
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt; t.y += t.vy * dt; t.x += t.drift * dt; t.vy *= 0.96;
      if (t.life <= 0) this.texts.splice(i, 1);
    }
  }

  drawTexts(ctx, camera, w, h) {
    const v = new THREE.Vector3();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const t of this.texts) {
      v.set(t.x, t.y, t.z).project(camera);
      if (v.z > 1) continue;
      const sx = Math.round((v.x * 0.5 + 0.5) * w), sy = Math.round((-v.y * 0.5 + 0.5) * h);
      const k = t.life / t.max, age = t.max - t.life;
      // punch in big, settle, then fade; crits shudder for a moment
      const pop = age < 0.16 ? 1 + (1 - age / 0.16) * (t.big ? 1.1 : 0.55) : 1;
      const px = Math.round((t.big ? 22 : 14) * t.size * pop);
      const jx = t.shake && age < 0.35 ? Math.round(Math.sin(age * 90) * 3) : 0;
      ctx.font = canvasFont(px);
      ctx.globalAlpha = Math.min(1, k * 3);
      ctx.fillStyle = '#000';
      const o = t.big ? 2 : 1;
      ctx.fillText(t.str, sx + jx + o, sy + o); ctx.fillText(t.str, sx + jx - o, sy + o); ctx.fillText(t.str, sx + jx, sy - o);
      ctx.fillStyle = age < 0.05 ? '#ffffff' : t.color;
      ctx.fillText(t.str, sx + jx, sy);
    }
    ctx.globalAlpha = 1;
  }

  clear() {
    for (const d of this.decals) { this.group.remove(d.mesh); }
    this.decals.length = 0;
    for (const d of this.dice) this.group.remove(d.mesh);
    this.dice.length = 0;
    for (const p of this.particles) { p.alive = false; p.sprite.visible = false; }
    this.texts.length = 0;
  }
}
