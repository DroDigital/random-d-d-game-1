// Playable classes (5e-inspired, level 1-10). Models: KayKit Adventurers.
export const CLASSES = {
  fighter: {
    id: 'fighter', name: 'Fighter', title: 'Oathsworn Knight', model: 'Knight', skinBase: 'knight',
    color: '#d8b46a', hitDie: 10, primary: 'str', saves: ['str', 'con'],
    abilities: { str: 16, dex: 12, con: 15, int: 9, wis: 13, cha: 11 },
    armor: { base: 16, dexCap: 0, shield: 2, label: 'Chain mail + shield' },
    gear: { r: 'sword_1handed', l: 'shield_badge_color' },
    blurb: 'Steel, shield and stubbornness. Hard to kill, harder to move.',
    attack: {
      kind: 'melee', dice: '1d8', stat: 'str', type: 'slashing', reach: 2.9, arc: 120, stamina: 12,
      windup: 0.12, recover: 0.26, combo: ['Melee_1H_Attack_Slice_Diagonal', 'Melee_1H_Attack_Slice_Horizontal', 'Melee_1H_Attack_Chop'],
      heavy: { anim: 'Melee_1H_Attack_Jump_Chop', extraDice: 1, stamina: 26, windup: 0.42, reach: 3.3, arc: 140, poise: 3 },
    },
    skills: [
      { id: 'second_wind', name: 'Second Wind', icon: 'heart-plus', cd: 20, desc: 'Heal 1d10 + level, then Action Surge: 3s of fast, free attacks.' },
      { id: 'shield_rush', name: 'Shield Rush', icon: 'shield-bash', cd: 7, desc: 'Charge forward. 1d6+STR bludgeoning; STR save or knocked prone.' },
    ],
    features: { 3: 'Improved Critical: crit on 19-20.', 5: 'Extra Attack: every swing rolls twice.', 7: 'Remarkable Athlete: +1 AC, +10% speed.', 9: 'Indomitable: reroll a failed save (per room).' },
  },
  barbarian: {
    id: 'barbarian', name: 'Barbarian', title: 'Ash-Blooded Reaver', model: 'Barbarian', skinBase: 'barbarian',
    color: '#c8553d', hitDie: 12, primary: 'str', saves: ['str', 'con'], unlock: 'barbarian',
    abilities: { str: 17, dex: 13, con: 16, int: 8, wis: 12, cha: 10 },
    armor: { base: 10, dexCap: 99, conToAc: true, shield: 0, label: 'Unarmored Defense (10+DEX+CON)' },
    gear: { r: 'axe_2handed' },
    blurb: 'Rage turns blows into bruises. Reckless, relentless, glorious.',
    attack: {
      kind: 'melee', dice: '1d12', stat: 'str', type: 'slashing', reach: 3.1, arc: 140, stamina: 15,
      windup: 0.2, recover: 0.3, combo: ['Melee_2H_Attack_Slice', 'Melee_2H_Attack_Chop'],
      heavy: { anim: 'Melee_2H_Attack_Spin', extraDice: 1, stamina: 28, windup: 0.4, reach: 3.4, arc: 360, poise: 3 },
    },
    skills: [
      { id: 'rage', name: 'Rage', icon: 'shouting', cd: 26, desc: '9s: +2 damage, resist physical damage, advantage on STR.' },
      { id: 'whirlwind', name: 'Reckless Whirl', icon: 'sword-spin', cd: 8, desc: 'Spin attack with advantage on everything around you.' },
    ],
    features: { 3: 'Frenzy: kills extend Rage by 2s.', 5: 'Extra Attack: every swing rolls twice.', 7: 'Feral Instinct: +15% speed.', 9: 'Brutal Critical: crits roll one extra die.' },
  },
  rogue: {
    id: 'rogue', name: 'Rogue', title: 'Gravecut Shade', model: 'Rogue_Hooded', skinBase: 'rogue',
    color: '#7fae8e', hitDie: 8, primary: 'dex', saves: ['dex', 'int'],
    abilities: { str: 10, dex: 17, con: 14, int: 12, wis: 13, cha: 8 },
    armor: { base: 11, dexCap: 99, shield: 0, label: 'Leather armor' },
    gear: { r: 'dagger', l: 'dagger' },
    blurb: 'Sneak Attack when you have advantage or an ally flanks the target.',
    attack: {
      kind: 'melee', dice: '1d4', stat: 'dex', type: 'piercing', reach: 2.5, arc: 100, stamina: 8,
      windup: 0.07, recover: 0.14, combo: ['Melee_Dualwield_Attack_Stab', 'Melee_Dualwield_Attack_Slice', 'Melee_Dualwield_Attack_Chop'],
      heavy: { anim: 'Melee_1H_Attack_Stab', extraDice: 1, stamina: 20, windup: 0.3, reach: 2.8, arc: 90, poise: 2, alwaysAdv: true },
    },
    skills: [
      { id: 'shadow_step', name: 'Shadow Step', icon: 'backstab', cd: 6, desc: 'Teleport behind the nearest foe. Next hit has advantage.' },
      { id: 'fan_knives', name: 'Fan of Knives', icon: 'daggers', cd: 5, desc: 'Throw 5 daggers in a fan: 1d4+DEX each.' },
    ],
    features: { 3: 'Fast Hands: potions are instant, dodge is cheaper.', 5: 'Uncanny Dodge: halve a hit every 8s.', 7: 'Evasion: DEX saves take no damage on success.', 9: 'Reliable Talent: attack rolls below 6 count as 6.' },
  },
  ranger: {
    id: 'ranger', name: 'Ranger', title: 'Lantern Warden', model: 'Ranger', skinBase: 'ranger',
    color: '#9db35c', hitDie: 10, primary: 'dex', saves: ['str', 'dex'], unlock: 'ranger',
    abilities: { str: 12, dex: 17, con: 14, int: 10, wis: 14, cha: 8 },
    armor: { base: 12, dexCap: 99, shield: 0, label: 'Studded leather' },
    gear: { l: 'bow_withString' },
    blurb: 'Longbow, Hunter\'s Mark and the patience of a grave.',
    attack: {
      kind: 'ranged', dice: '1d8', stat: 'dex', type: 'piercing', range: 26, speed: 34, stamina: 9, projectile: 'arrow',
      windup: 0.18, recover: 0.2, combo: ['Ranged_Bow_Release'], drawAnim: 'Ranged_Bow_Draw',
      heavy: { anim: 'Ranged_Bow_Release', extraDice: 1, stamina: 20, windup: 0.5, pierce: true, poise: 2 },
    },
    skills: [
      { id: 'hunters_mark', name: "Hunter's Mark", icon: 'targeted', cd: 10, desc: 'Mark a foe for 14s: your hits deal +1d6. Allies gain advantage on it.' },
      { id: 'volley', name: 'Volley', icon: 'arrow-flights', cd: 9, desc: 'Rain arrows on an area: 3d8 piercing, DEX save for half.' },
    ],
    features: { 3: 'Colossus Slayer: +1d8 vs wounded foes.', 5: 'Extra Attack: every shot fires twice.', 7: 'Fleet of Foot: +10% speed.', 9: 'Foe Slayer: +WIS to damage.' },
  },
  wizard: {
    id: 'wizard', name: 'Wizard', title: 'Cinder Scholar', model: 'Mage', skinBase: 'mage',
    color: '#8f7fd8', hitDie: 6, primary: 'int', saves: ['int', 'wis'], caster: 'int',
    abilities: { str: 8, dex: 14, con: 14, int: 17, wis: 12, cha: 10 },
    armor: { base: 13, dexCap: 99, shield: 0, label: 'Mage Armor (13+DEX)' },
    gear: { r: 'staff', l: 'spellbook_open' },
    blurb: 'Fragile, brilliant, explosive. Spell slots refill as rooms fall.',
    attack: {
      kind: 'spell', dice: '1d10', stat: 'int', type: 'fire', range: 24, speed: 26, stamina: 9, projectile: 'firebolt',
      windup: 0.16, recover: 0.22, combo: ['Ranged_Magic_Shoot'], cantripScale: true,
      heavy: { anim: 'Ranged_Magic_Spellcasting', extraDice: 0, stamina: 18, windup: 0.4, projectile: 'frostray', type: 'cold', dice: '1d8', slow: true },
    },
    skills: [
      { id: 'magic_missile', name: 'Magic Missile', icon: 'magic-swirl', slot: 1, cd: 1.2, desc: '1 slot: 3 darts (+1 per 2 levels) of 1d4+1 force. Never misses.' },
      { id: 'burning_hands', name: 'Burning Hands', icon: 'fireball', slot: 1, cd: 1.5, desc: '1 slot: 15ft cone, 3d6 fire, DEX save half. Becomes FIREBALL at level 5.' },
    ],
    features: { 3: 'Sculpt Spells: your spells never hurt allies (and +1 slot).', 5: 'Fireball & 2d10 Fire Bolt.', 7: 'Empowered Evocation: +INT to spell damage.', 9: 'Overchannel: Magic Missile fires 2 extra darts.' },
  },
  druid: {
    id: 'druid', name: 'Druid', title: 'Moss-Circle Keeper', model: 'Druid', skinBase: 'druid',
    color: '#5fb3a1', hitDie: 8, primary: 'wis', saves: ['int', 'wis'], caster: 'wis',
    abilities: { str: 10, dex: 13, con: 14, int: 12, wis: 17, cha: 8 },
    armor: { base: 12, dexCap: 2, shield: 2, label: 'Hide armor + wooden shield' },
    gear: { r: 'druid_staff' },
    blurb: 'Healing Word lifts fallen friends from range. The party glue.',
    attack: {
      kind: 'melee', dice: '1d8', stat: 'wis', type: 'bludgeoning', reach: 2.9, arc: 110, stamina: 11,
      windup: 0.14, recover: 0.26, combo: ['Melee_2H_Attack_Slice', 'Melee_2H_Attack_Chop'],
      heavy: { anim: 'Ranged_Magic_Shoot', extraDice: 0, stamina: 16, windup: 0.3, ranged: true, projectile: 'produceflame', type: 'fire', dice: '1d8', range: 20, speed: 22 },
    },
    skills: [
      { id: 'healing_word', name: 'Healing Word', icon: 'healing', slot: 1, cd: 2, desc: '1 slot: allies within 12m heal 1d4+WIS (+1d4 per 2 levels). Revives the downed!' },
      { id: 'moonbeam', name: 'Moonbeam', icon: 'sunbeams', slot: 1, cd: 2, desc: '1 slot: a radiant beam scorches foes for 2d10 each second (CON half). 8s.' },
    ],
    features: { 3: 'Circle of the Moon-ash: Moonbeam follows the nearest foe.', 5: 'Healing Word heals +WIS again.', 7: 'Elemental Fury: +1d8 radiant on staff hits.', 9: 'Beast Spells: Healing Word also grants 8 temp HP.' },
  },
};

export const CLASS_ORDER = ['fighter', 'rogue', 'wizard', 'druid', 'barbarian', 'ranger'];
export const SKINS = ['', 'alt_A', 'alt_B', 'alt_C'];
export const PLAYER_COLORS = ['#e05a47', '#4f8fe0', '#59c06b', '#e8c547'];
export const DICE_COLORS = ['red', 'blue', 'green', 'yellow'];

export function slotsForLevel(level) { return [0, 2, 3, 4, 4, 5, 5, 6, 6, 7, 7][Math.min(10, level)]; }
