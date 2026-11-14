// Biomes ("Depths"), room types, vows (difficulty pacts) and meta unlocks.
export const DEPTHS = [
  { id: 'crypt', name: 'The Sunken Crypt', sub: 'Depth I', texture: 'dungeon_texture', palette: 'crypt', music: 'crypt', fog: 0x0a0d14,
    ambient: 0x4a5a70, torch: 0xffa560, floorAlt: ['floor_tile_large', 'floor_tile_large', 'floor_tile_large_rocks', 'floor_tile_large', 'floor_tile_large_rocks', 'floor_tile_large', 'floor_tile_big_grate'],
    common: ['skel_minion', 'skel_minion', 'skel_warrior', 'skel_rogue', 'skel_mage', 'skel_archer', 'ghost'],
    elites: ['skel_warrior', 'ghost_skull', 'skel_rogue', 'ghost'], boss: 'necromancer',
    banners: ['banner_patternA_red', 'banner_triple_white'], props: ['barrel_large', 'crates_stacked', 'box_stacked', 'rubble_large', 'bookcase_double_decoratedA', 'candle_triple', 'sword_shield_broken', 'trunk_large_A'],
    look: { ambientI: 3.0, hemiSky: 0x8fa6d0, hemiGround: 0x2a2018, hemiI: 1.5, dir: 0xa8b8ff, dirI: 1.2, rim: 0x8fb4ff, tint: [0.98, 1.0, 1.06], lift: 0.025, bloom: 0.9, motes: 'dust', moteColor: 0xbfd0ff, shaft: 0x9fb8ff, fogY: 0x24304a, decals: ['scratch_01', 'dirt_02', 'dngn_floor_cobble_blood3'] } },
  { id: 'ossuary', name: 'The Fungal Ossuary', sub: 'Depth II', texture: 'alt_texture_3_SepiaA', palette: 'ossuary', music: 'ossuary', fog: 0x120a06,
    ambient: 0x6a4a36, torch: 0xffb070, floorAlt: ['floor_dirt_large_rocky', 'floor_tile_large_rocks', 'floor_dirt_large_rocky', 'floor_tile_large', 'floor_dirt_large_rocky'],
    common: ['orc', 'mushnub', 'mushnub', 'mushnub_big', 'pink_blob', 'spiky_blob', 'wasp', 'skel_warrior', 'hexling'],
    elites: ['orc_skull', 'mush_king', 'yeti', 'spiky_blob'], boss: 'golem',
    banners: ['banner_patternC_blue', 'banner_patternA_red'], props: ['rocks_decorated', 'rubble_half', 'barrel_small_stack', 'keg_decorated', 'rocks', 'crates_stacked', 'shelves_decorated', 'bed_floor'],
    look: { ambientI: 2.8, hemiSky: 0x9cae80, hemiGround: 0x2a1a10, hemiI: 1.4, dir: 0xe8d8a0, dirI: 0.9, rim: 0x9dff9a, tint: [1.0, 1.01, 0.95], lift: 0.025, bloom: 0.7, lantern: 17, motes: 'spores', moteColor: 0x9dff7a, shaft: 0xffd090, fogY: 0x22301a, decals: ['dirt_02', 'scratch_01', 'dngn_floor_cobble_blood7'] } },
  { id: 'abyss', name: 'The Ember Abyss', sub: 'Depth III', texture: 'alt_texture_6_NightB', palette: 'abyss', music: 'abyss', fog: 0x10060c,
    ambient: 0x6a4060, torch: 0xff7a3a, floorAlt: ['floor_tile_large', 'floor_tile_large_rocks', 'floor_tile_large', 'floor_tile_big_grate', 'floor_tile_large', 'floor_tile_large_rocks'],
    common: ['imp', 'imp', 'frost_fiend', 'wisp', 'drake', 'ghost_skull', 'hexling', 'orc_skull', 'wasp'],
    elites: ['yeti', 'frost_fiend', 'drake', 'orc_skull'], boss: 'wyrm',
    banners: ['banner_triple_white', 'banner_patternC_blue'], props: ['coin_stack_large', 'chest_large_gold', 'rubble_large', 'rocks_decorated', 'candle_triple', 'table_long_decorated_A', 'barrel_large'],
    look: { ambientI: 3.6, hemiSky: 0xc890d0, hemiGround: 0x401010, hemiI: 1.8, dir: 0xff9a70, dirI: 1.3, rim: 0xff7a4a, tint: [1.06, 0.98, 1.02], lift: 0.035, bloom: 1.25, motes: 'embers', moteColor: 0xff7a2a, shaft: 0xff6a3a, fogY: 0x4a1418, decals: ['scorch_02', 'scratch_01', 'dirt_02'] } },
];

export const ROOMS_PER_DEPTH = 7; // then a boss room
export const SHRINE_AT = [0, 4];  // room indices (0 = entrance shrine)

export const ROOM_TYPES = {
  combat: { name: 'Battle', icon: 'crossed-swords', reward: 'boon', weight: 46, desc: 'Fight. Each hero drafts a boon.' },
  ash: { name: 'Ash Cache', icon: 'campfire', reward: 'ash', weight: 14, desc: 'Fight. Big pile of Ash.' },
  elite: { name: 'Elite', icon: 'crowned-skull', reward: 'rare_boon', weight: 14, desc: 'An empowered foe. Rare+ boons.' },
  treasure: { name: 'Vault', icon: 'open-treasure-chest', reward: 'treasure', weight: 9, desc: 'A guarded chest... probably a chest.' },
  peddler: { name: 'Peddler', icon: 'shop', reward: 'shop', weight: 8, desc: 'Spend Ash on potions and relics.' },
  altar: { name: "Dicer's Altar", icon: 'rolling-dices', reward: 'gamble', weight: 8, desc: 'Roll the d20. Fortune or curse.' },
  trial: { name: 'Trial of Ash', icon: 'skull-crossed-bones', reward: 'double', weight: 6, desc: 'Survive 3 waves. Two boons each.' },
  shrine: { name: 'Ember Shrine', icon: 'candle-flame', reward: 'shrine', weight: 0, desc: 'Rest. Level up. Checkpoint.' },
  boss: { name: 'Boss', icon: 'dragon-head', reward: 'boss', weight: 0, desc: 'The guardian of this depth.' },
  descend: { name: 'Descend', icon: 'stairs-goal', reward: 'none', weight: 0, desc: 'Deeper into the dark.' },
  victory: { name: 'The Surface', icon: 'sun', reward: 'none', weight: 0, desc: 'Fulfil the oath.' },
};

// Vows: Hades-style heat. Each adds Oath Marks at the end of a run.
export const VOWS = [
  { id: 'iron', name: 'Vow of Iron', desc: 'Foes have +2 AC.', marks: 2 },
  { id: 'teeth', name: 'Vow of Teeth', desc: 'Foes deal +30% damage.', marks: 2 },
  { id: 'horde', name: 'Vow of the Horde', desc: '+35% more foes per room.', marks: 2 },
  { id: 'haste', name: 'Vow of Haste', desc: 'Foes move and attack 20% faster.', marks: 2 },
  { id: 'elite', name: 'Vow of Champions', desc: 'Every room has an elite. Elites get 2 affixes.', marks: 3 },
  { id: 'ember', name: 'Vow of the Last Ember', desc: 'The party starts with 1 Ember instead of 3.', marks: 3 },
  { id: 'scarcity', name: 'Vow of Scarcity', desc: 'Potions heal half. Shrines do not refill them.', marks: 2 },
];

// Reliquary: permanent unlocks bought with Oath Marks.
export const UNLOCKS = [
  { id: 'barbarian', name: 'The Barbarian', desc: 'Unlock the Barbarian class.', cost: 6 },
  { id: 'ranger', name: 'The Ranger', desc: 'Unlock the Ranger class.', cost: 6 },
  { id: 'skins', name: 'Ashen Wardrobe', desc: 'Unlock alternate colour schemes for all classes.', cost: 4 },
  { id: 'flask', name: 'Deep Flask', desc: 'Heroes start with +1 potion.', cost: 8 },
  { id: 'kindled', name: 'Kindled Start', desc: 'Each hero starts the run with a random uncommon boon.', cost: 12 },
  { id: 'reroll', name: 'Gambler\'s Coin', desc: 'Each hero starts with 1 boon reroll.', cost: 6 },
  { id: 'ash_tithe', name: 'Ash Tithe', desc: 'Start each run with 300 Ash.', cost: 8 },
  { id: 'fourth_ember', name: 'The Fourth Ember', desc: 'The party starts with an extra Ember.', cost: 15 },
];
