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
  // KayKit Dungeon Remastered extras (share the dungeon atlas, so they retexture per depth)
  'barrel_small', 'barrel_large_decorated', 'box_small', 'box_small_decorated', 'box_large', 'crate_small', 'crate_large', 'crate_large_decorated', 'keg',
  'bottle_A_brown', 'bottle_B_green', 'bucket', 'bucket_pickaxes', 'pickaxe', 'wall_inset_shelves_decoratedA', 'wall_inset_shelves_decoratedB', 'wall_inset_shelves_broken',
  'wall_gated', 'wall_archedwindow_gated', 'wall_shelves', 'banner_shield_red', 'banner_shield_blue', 'banner_thin_red', 'banner_patternB_green', 'banner_patternA_brown',
  'floor_tile_small_decorated', 'floor_tile_grate_open', 'floor_tile_extralarge_grates', 'floor_tile_small_broken_B', 'floor_tile_small_weeds_B', 'floor_dirt_small_weeds', 'floor_dirt_large',
  'bookcase_single_decoratedA', 'bookcase_single_decoratedB', 'shelf_small_candles', 'table_medium_broken', 'table_long_broken', 'table_small_decorated_A', 'chair', 'stool', 'bench',
  'candle_melted', 'candle_thin_lit', 'sword_shield', 'sword_shield_gold', 'rocks_small', 'rocks_gold', 'coin_stack_medium', 'coin_stack_small', 'keyring_hanging', 'trunk_medium_A',
  'scaffold_frame_small', 'scaffold_pillar_wall_torch', 'post', 'barrier', 'barrier_column', 'plate_food_A', 'table_round_small',
];

// Props from other packs keep their own textures: KayKit Halloween Bits (hw:)
// and the Codepawl pixel-art atlas (px:, 16x16 textures, meshopt-compressed).
const HALLOWEEN = ['coffin', 'coffin_decorated', 'grave_A', 'grave_A_destroyed', 'grave_B', 'gravestone', 'gravemarker_A', 'gravemarker_B', 'ribcage', 'skull', 'skull_candle',
  'bone_A', 'bone_B', 'bone_C', 'candle_triple', 'candle_melted', 'plaque_candles', 'shrine_candles', 'lantern_standing', 'lantern_hanging', 'post_skull', 'post_lantern',
  'fence', 'fence_broken', 'fence_pillar', 'fence_pillar_broken', 'tree_dead_small', 'tree_dead_medium', 'arch', 'arch_gate', 'crypt', 'floor_dirt_grave'];
const PIXEL = ['powder_keg', 'gunpowder_pile', 'urn', 'vase', 'storage_pot', 'lidded_urn', 'crock', 'mimic_pot', 'spider_web', 'spider_egg_sac', 'cocoon', 'swinging_axe_trap',
  'saw_blade_trap', 'flame_jet_trap', 'spike_trap', 'bear_trap', 'poison_dart_trap', 'glowcap_mushroom', 'ghost_mushroom', 'lantern_mushroom', 'giant_mushroom_tree',
  'mushroom_cluster', 'skull_mushroom', 'shadowcap_mushroom', 'bracket_fungus', 'crystal_cluster', 'crystal_formation', 'crystal_spike', 'crystal_pillar', 'obsidian_shard',
  'jagged_rock', 'pointed_rock', 'rock_cluster', 'brazier', 'wall_sconce_torch', 'statue_on_pedestal', 'gargoyle_statue', 'skull_idol', 'tombstone', 'bone', 'cow_skull',
  'animal_skull', 'jar_of_embers', 'coal_chunk', 'burning_log', 'ore_filled_mine_cart', 'smelting_furnace', 'chain', 'hanging_banner', 'war_banner', 'candle_chandelier', 'dynamite_bundle'];

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
    const extras = [...HALLOWEEN.map((n) => ['hw:' + n, 'assets/models/halloween/' + n + '.gltf']), ...PIXEL.map((n) => ['px:' + n, 'assets/models/pixel/' + n + '.glb'])];
    await Promise.all(extras.map(async ([name, path]) => {
      const g = await loadGLTF(path);
      retroify(g.scene);
      const parts = [];
      g.scene.updateMatrixWorld(true);
      g.scene.traverse((o) => { if (o.isMesh) parts.push({ geometry: o.geometry, material: Array.isArray(o.material) ? o.material[0] : o.material, matrix: o.matrixWorld.clone() }); });
      this.pieces[name] = { scene: g.scene, parts, fixed: true };
    }));
    for (const t of ['dungeon_texture', 'alt_texture_3_SepiaA', 'alt_texture_6_NightB', 'alt_texture_1_Golden', 'alt_texture_5_NightA']) {
      const tex = await loadTexture(DUNGEON + t + '.png');
      tex.flipY = false;
      this.textures[t] = tex;
    }
    this.matCache = {};
  }

  // a glowing variant of a fixed-texture material (mushrooms, crystals, embers)
  glowMaterial(src, color, k = 0.8) {
    const key = src.uuid + 'glow' + color + k;
    if (this.matCache[key]) return this.matCache[key];
    const m = src.clone(); m.userData.psx = false;
    m.emissive = new THREE.Color(color).multiplyScalar(k); m.emissiveMap = m.map; m.emissiveIntensity = 1;
    psxify(m);
    this.matCache[key] = m;
    return m;
  }

  partMaterial(piece, part, textureKey, glow) {
    if (piece.fixed) return glow ? this.glowMaterial(part.material, glow.color, glow.k) : part.material;
    return glow ? this.glowMaterial(this.material(part.material, textureKey), glow.color, glow.k) : this.material(part.material, textureKey);
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

  begin(textureKey) { this.batch = {}; this.glowBatch = {}; this.textureKey = textureKey; }

  place(name, x, y, z, rotY = 0, scale = 1, sy = null, glow = null) {
    if (!this.pieces[name]) { console.warn('no piece', name); return; }
    if (glow) { (this.glowBatch[name] = this.glowBatch[name] || { glow, mats: [] }).mats.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY), new THREE.Vector3(scale, sy ?? scale, scale))); return; }
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY),
      new THREE.Vector3(scale, sy ?? scale, scale));
    (this.batch[name] = this.batch[name] || []).push(m);
  }

  end() {
    const group = new THREE.Group();
    const emit = (name, mats, glow) => {
      const piece = this.pieces[name];
      for (const part of piece.parts) {
        const im = new THREE.InstancedMesh(part.geometry, this.partMaterial(piece, part, this.textureKey, glow), mats.length);
        mats.forEach((m, i) => im.setMatrixAt(i, m.clone().multiply(part.matrix)));
        im.instanceMatrix.needsUpdate = true;
        im.computeBoundingSphere();
        group.add(im);
      }
    };
    for (const name in this.batch) emit(name, this.batch[name], null);
    for (const name in this.glowBatch) emit(name, this.glowBatch[name].mats, this.glowBatch[name].glow);
    this.batch = null; this.glowBatch = null;
    return group;
  }

  // a clone with its own materials, so it can fade when it hides a hero
  cloneFadable(name, textureKey, glow = null) {
    const g = this.clone(name, textureKey, glow);
    const mats = [];
    g.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.userData.psx = false; psxify(o.material); mats.push(o.material); } });
    g.userData.mats = mats;
    return g;
  }

  // a standalone (non-instanced) clone, e.g. chests, breakables, doors
  clone(name, textureKey, glow = null) {
    const p = this.pieces[name];
    if (!p) { console.warn('no piece', name); return new THREE.Group(); }
    const g = new THREE.Group();
    for (const part of p.parts) {
      const mesh = new THREE.Mesh(part.geometry, this.partMaterial(p, part, textureKey || this.textureKey || 'dungeon_texture', glow));
      mesh.applyMatrix4(part.matrix);
      g.add(mesh);
    }
    return g;
  }
}

export function retroScene(root) { return retroify(root); }
