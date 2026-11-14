// Loads the KayKit Dungeon kit and assembles rooms from instanced pieces.
import * as THREE from 'three';
import { loadGLTF, loadTexture } from '../core/assets.js';
import { retroify, psxify } from '../render/psx.js';

const DUNGEON = 'assets/models/dungeon/';
export const PIECES = [
  'wall', 'wall_corner', 'wall_doorway', 'wall_cracked', 'wall_broken', 'wall_arched', 'wall_inset_candles', 'wall_window_closed', 'wall_half', 'wall_pillar',
  'floor_tile_large', 'floor_tile_large_rocks', 'floor_tile_small_broken_A', 'floor_tile_small_weeds_A', 'floor_tile_big_grate', 'floor_tile_big_spikes', 'floor_dirt_large_rocky',
  'pillar', 'pillar_decorated', 'column', 'torch_mounted', 'torch_lit', 'candle_triple', 'candle_lit', 'chest', 'chest_gold', 'chest_large_gold', 'chest_mimic',
  'barrel_large', 'barrel_small_stack', 'crates_stacked', 'box_stacked', 'banner_patternA_red', 'banner_patternC_blue', 'banner_triple_white', 'rubble_large', 'rubble_half',
  'rocks', 'rocks_decorated', 'coin_stack_large', 'coin', 'bookcase_double_decoratedA', 'table_long_decorated_A', 'sword_shield_broken', 'stairs', 'keg_decorated',
  'shelves_decorated', 'bed_floor', 'trunk_large_A', 'bar_straight_A',
];

export class Kit {
  constructor() { this.pieces = {}; this.textures = {}; this.current = null; }

  async load(onProgress) {
    let n = 0;
    await Promise.all(PIECES.map(async (name) => {
      const g = await loadGLTF(DUNGEON + name + '.gltf');
      const parts = [];
      g.scene.updateMatrixWorld(true);
      g.scene.traverse((o) => {
        if (o.isMesh) {
          const m = Array.isArray(o.material) ? o.material[0] : o.material;
          parts.push({ geometry: o.geometry, material: m, matrix: o.matrixWorld.clone() });
        }
      });
      this.pieces[name] = { scene: g.scene, parts };
      n++; onProgress && onProgress(n / PIECES.length);
    }));
    for (const t of ['dungeon_texture', 'alt_texture_3_SepiaA', 'alt_texture_6_NightB', 'alt_texture_1_Golden', 'alt_texture_5_NightA']) {
      const tex = await loadTexture(DUNGEON + t + '.png');
      tex.flipY = false;
      this.textures[t] = tex;
    }
    this.matCache = {};
  }

  material(src, textureKey) {
    const key = src.uuid + textureKey;
    if (this.matCache[key]) return this.matCache[key];
    const m = new THREE.MeshLambertMaterial({
      map: src.map ? this.textures[textureKey] : null,
      color: src.color ? src.color.clone() : 0xffffff,
      transparent: src.transparent, alphaTest: src.alphaTest || 0,
    });
    if (src.emissive && src.emissive.getHex()) { m.emissive = src.emissive.clone(); m.emissiveIntensity = 1.6; m.emissiveMap = m.map; }
    psxify(m);
    this.matCache[key] = m;
    return m;
  }

  begin(textureKey) { this.batch = {}; this.textureKey = textureKey; }

  place(name, x, y, z, rotY = 0, scale = 1, sy = null) {
    if (!this.pieces[name]) { console.warn('no piece', name); return; }
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY),
      new THREE.Vector3(scale, sy ?? scale, scale));
    (this.batch[name] = this.batch[name] || []).push(m);
  }

  end() {
    const group = new THREE.Group();
    for (const name in this.batch) {
      const mats = this.batch[name];
      for (const part of this.pieces[name].parts) {
        const im = new THREE.InstancedMesh(part.geometry, this.material(part.material, this.textureKey), mats.length);
        mats.forEach((m, i) => im.setMatrixAt(i, m.clone().multiply(part.matrix)));
        im.instanceMatrix.needsUpdate = true;
        im.computeBoundingSphere();
        group.add(im);
      }
    }
    this.batch = null;
    return group;
  }

  // a clone with its own materials, so it can fade when it hides a hero
  cloneFadable(name, textureKey) {
    const g = this.clone(name, textureKey);
    const mats = [];
    g.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.userData.psx = false; psxify(o.material); mats.push(o.material); } });
    g.userData.mats = mats;
    return g;
  }

  // a standalone (non-instanced) clone, e.g. chests, breakables, doors
  clone(name, textureKey) {
    const p = this.pieces[name];
    const g = new THREE.Group();
    for (const part of p.parts) {
      const mesh = new THREE.Mesh(part.geometry, this.material(part.material, textureKey || this.textureKey || 'dungeon_texture'));
      mesh.applyMatrix4(part.matrix);
      g.add(mesh);
    }
    return g;
  }
}

export function retroScene(root) { return retroify(root); }
