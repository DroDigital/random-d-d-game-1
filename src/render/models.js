// Character/monster model library: KayKit heroes & skeletons share the KayKit
// animation rigs; Quaternius monsters bring their own clips.
import * as THREE from 'three';
import { loadGLTF, loadTexture, cloneSkinned } from '../core/assets.js';
import { retroify, psxify, addRim } from './psx.js';

const RIGS = {
  Rig_Medium: ['General', 'MovementBasic', 'MovementAdvanced', 'CombatMelee', 'CombatRanged', 'Special'],
  Rig_Large: ['General', 'MovementBasic', 'CombatMelee'],
};

export class ModelLib {
  constructor() { this.rigClips = {}; this.templates = {}; this.gear = {}; this.skins = {}; }

  async loadRigs() {
    for (const rig in RIGS) {
      const clips = {};
      await Promise.all(RIGS[rig].map(async (part) => {
        const g = await loadGLTF(`assets/models/anims/${rig}_${part}.glb`);
        for (const c of g.animations) if (c.name !== 'T-Pose') clips[c.name] = c;
      }));
      this.rigClips[rig] = clips;
    }
  }

  async template(path) {
    if (this.templates[path]) return this.templates[path];
    const g = await loadGLTF('assets/models/' + path);
    retroify(g.scene);
    const box = new THREE.Box3().setFromObject(g.scene);
    const t = { scene: g.scene, clips: g.animations, height: Math.max(0.01, box.max.y - box.min.y), minY: box.min.y };
    this.templates[path] = t;
    return t;
  }

  async gearModel(name, folder) {
    const key = folder + name;
    if (!this.gear[key]) {
      const g = await loadGLTF(`assets/models/${folder}/${name}.gltf`);
      this.gear[key] = retroify(g.scene);
    }
    return this.gear[key].clone();
  }

  async skinTexture(base, skin) {
    const key = base + skin;
    if (!this.skins[key]) {
      const t = await loadTexture(`assets/models/heroes/skins/${base}_${skin}.png`);
      t.flipY = false;
      this.skins[key] = t;
    }
    return this.skins[key];
  }

  // Build an animated instance. opts: {path, rig, height, gear:{r,l}, gearFolder, skin:{base,name}}
  async instance({ path, rig = null, height = 2.4, gear = null, gearFolder = 'gear', skin = null, tint = null, lift = 0.3, rim = 'foe' }) {
    const t = await this.template(path);
    const scene = cloneSkinned(t.scene);
    const root = new THREE.Group();
    const scale = height / t.height;
    scene.scale.setScalar(scale);
    scene.position.y = -t.minY * scale;
    root.add(scene);
    // per-instance materials so we can flash / tint each actor
    const mats = [];
    scene.traverse((o) => {
      if (o.isMesh) {
        o.material = o.material.clone();
        o.material.userData.psx = false; // re-psxify cloned material
        mats.push(o.material);
      }
    });
    // readability lift: characters faintly self-illuminate their own texture so
    // dark robes never vanish into dark floors (classic PS1 trick)
    mats.forEach((m) => {
      if (rim) addRim(m, rim); else psxify(m);
      if (m.map && m.emissive && m.emissive.getHex() === 0) { m.emissiveMap = m.map; m.emissive.setRGB(lift, lift, lift); m.needsUpdate = true; }
      m.userData.baseEmissive = m.emissive ? m.emissive.clone() : null;
    });
    if (skin && skin.name) {
      const tex = await this.skinTexture(skin.base, skin.name);
      mats.forEach((m) => { if (m.map) { m.map = tex; m.needsUpdate = true; } });
    }
    if (tint) mats.forEach((m) => m.color.multiply(new THREE.Color(tint)));
    if (gear) {
      for (const side of ['r', 'l']) {
        if (!gear[side]) continue;
        const slot = scene.getObjectByName('handslot.' + side);
        if (!slot) continue;
        const gm = await this.gearModel(gear[side], gearFolder);
        gm.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); if (rim) addRim(o.material, rim); else { o.material.userData.psx = false; psxify(o.material); } mats.push(o.material); } });
        slot.add(gm);
      }
    }
    const mixer = new THREE.AnimationMixer(scene);
    const clips = {};
    if (rig && this.rigClips[rig]) Object.assign(clips, this.rigClips[rig]);
    for (const c of t.clips) clips[c.name] = c;
    return new Animated(root, scene, mixer, clips, mats);
  }
}

export class Animated {
  constructor(root, scene, mixer, clips, mats) {
    this.root = root; this.scene = scene; this.mixer = mixer; this.clips = clips; this.mats = mats;
    this.actions = {}; this.current = null; this.currentName = null; this.flash = 0; this.flashColor = new THREE.Color(1, 1, 1);
    this.oneShot = null;
  }
  has(name) { return !!this.clips[name]; }
  action(name) {
    if (!this.actions[name] && this.clips[name]) this.actions[name] = this.mixer.clipAction(this.clips[name]);
    return this.actions[name];
  }
  // play a looping base animation
  loop(name, { speed = 1, fade = 0.18 } = {}) {
    if (!this.has(name)) return;
    if (this.oneShot) { this.pendingLoop = { name, speed }; return; }
    if (this.currentName === name) { this.current.timeScale = speed; return; }
    const a = this.action(name);
    a.reset(); a.setLoop(THREE.LoopRepeat, Infinity); a.timeScale = speed; a.clampWhenFinished = false;
    a.enabled = true; a.setEffectiveWeight(1);
    if (this.current) a.crossFadeFrom(this.current, fade, false); else a.play();
    a.play();
    this.current = a; this.currentName = name;
  }
  // play once, then fall back to the last requested loop
  once(name, { speed = 1, fade = 0.08, duration = null, hold = false } = {}) {
    if (!this.has(name)) return 0;
    const a = this.action(name);
    const clipDur = this.clips[name].duration;
    const ts = duration ? clipDur / duration : speed;
    a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.timeScale = ts; a.enabled = true;
    if (this.current && this.current !== a) a.crossFadeFrom(this.current, fade, false);
    a.play();
    const prevLoop = this.oneShot ? this.pendingLoop : { name: this.currentName, speed: this.current ? this.current.timeScale : 1 };
    this.current = a; this.currentName = name;
    this.oneShot = { action: a, until: clipDur / ts, t: 0, hold };
    this.pendingLoop = prevLoop;
    return clipDur / ts;
  }
  stopOneShot() {
    if (!this.oneShot) return;
    this.oneShot = null;
    const p = this.pendingLoop; this.pendingLoop = null;
    if (p && p.name) { const cn = this.currentName; this.currentName = null; this.loop(p.name, { speed: p.speed, fade: 0.15 }); if (!this.currentName) this.currentName = cn; }
  }
  update(dt) {
    this.mixer.update(dt);
    if (this.oneShot && !this.oneShot.hold) {
      this.oneShot.t += dt;
      if (this.oneShot.t >= this.oneShot.until - 0.02) this.stopOneShot();
    }
    if (this.flash > 0) {
      this.flash -= dt;
      const k = Math.max(0, this.flash / 0.15);
      for (const m of this.mats) if (m.emissive) m.emissive.copy(m.userData.baseEmissive || new THREE.Color(0, 0, 0)).lerp(this.flashColor, k);
    }
  }
  hitFlash(color = 0xffffff) { this.flash = 0.15; this.flashColor.set(color); }
  setGlow(color, k) { for (const m of this.mats) if (m.emissive) { m.userData.baseEmissive = new THREE.Color(color).multiplyScalar(k).add(m.userData.baseEmissive || new THREE.Color()); m.emissive.copy(m.userData.baseEmissive); } }
  setOpacity(o) { for (const m of this.mats) { m.transparent = o < 1; m.opacity = o; m.depthWrite = o >= 1; } }
}
