// Boons: 5e feats, magic items and spell-pacts drafted after every room.
// Each belongs to a PACT tag. 3 boons of one pact = Attunement (solo synergy).
// Two different players with 2+ of the same pact = Pact Bond (co-op synergy):
// both gain that pact's Attunement power.
const C = (p) => 'assets/sprites/crawl/item_' + p.replace(/\//g, '_') + '.png';

export const RARITY = {
  common: { name: 'Common', color: '#cfc7b4', weight: 60 },
  uncommon: { name: 'Uncommon', color: '#6fd06f', weight: 32 },
  rare: { name: 'Rare', color: '#5fa8ff', weight: 14 },
  very_rare: { name: 'Very Rare', color: '#c27bff', weight: 5 },
  legendary: { name: 'Legendary', color: '#ffb347', weight: 1.4 },
};

export const PACTS = {
  ember: { name: 'Ember', color: '#ff7a2f', attune: 'Pyre: slain foes erupt for 2d6 fire (DEX half).' },
  rime: { name: 'Rime', color: '#8fd3ff', attune: 'Hoarfrost: 25% of hits freeze foes for 1.2s.' },
  dawn: { name: 'Dawn', color: '#ffe48a', attune: 'Daybreak: every hit heals you for 1 HP.' },
  grave: { name: 'Grave', color: '#b07cff', attune: 'Last Rites: kills grant 4 temporary HP.' },
  storm: { name: 'Storm', color: '#7ff0ff', attune: 'Arc: every 4th hit chains 2d8 lightning.' },
  fang: { name: 'Fang', color: '#ff5a6a', attune: 'Bloodletting: crits make foes bleed 1d6/s for 3s.' },
};

export const BOONS = [
  // --- Fang: martial feats & weapons
  { id: 'savage', name: 'Savage Attacker', rarity: 'common', pact: 'fang', icon: C('weapon/artefact/urand_skullcrusher'), desc: 'Roll weapon damage twice, keep the higher.', flags: ['savage'] },
  { id: 'gwm', name: 'Great Weapon Master', rarity: 'uncommon', pact: 'fang', icon: C('weapon/artefact/urand_axe_of_woe'), desc: 'Heavy attacks: -5 to hit, +10 damage. Kills refund 15 stamina.', flags: ['gwm'] },
  { id: 'sentinel', name: 'Sentinel', rarity: 'common', pact: 'fang', icon: C('weapon/artefact/urand_guard'), desc: 'Foes you hit are slowed to a crawl for 1s.', flags: ['sentinel'] },
  { id: 'berserker_axe', name: 'Berserker Axe', rarity: 'rare', pact: 'fang', icon: C('weapon/artefact/urand_morg'), desc: '+1 to hit and damage, +1 max HP per level. Below half HP: +3 damage.', mods: { toHit: 1, dmg: 1, maxHpPerLevel: 1 }, flags: ['berserker'] },
  { id: 'vorpal', name: 'Vorpal Edge', rarity: 'legendary', pact: 'fang', icon: C('weapon/artefact/spwpn_sword_of_power'), desc: '+3 to hit. A natural 20 beheads non-boss foes outright.', mods: { toHit: 3 }, flags: ['vorpal'] },
  { id: 'hunters_prey', name: "Hunter's Prey", rarity: 'common', pact: 'fang', icon: C('weapon/artefact/urand_snakebite'), desc: '+1d8 damage against foes below full HP, once per second.', flags: ['prey'] },
  { id: 'sharpshooter', name: 'Sharpshooter', rarity: 'uncommon', pact: 'fang', icon: C('weapon/artefact/urand_storm_bow'), desc: 'Crit range +1. Ranged attacks gain +2 damage.', mods: { critRange: 1 }, flags: ['sharpshooter'] },
  // --- Ember
  { id: 'flame_tongue', name: 'Flame Tongue', rarity: 'rare', pact: 'ember', icon: C('weapon/artefact/urand_firestarter'), desc: 'Your attacks deal an extra 2d6 fire damage.', onHit: [{ dice: '2d6', type: 'fire' }] },
  { id: 'staff_fire', name: 'Staff of Fire', rarity: 'uncommon', pact: 'ember', icon: C('staff/i-staff_fire'), desc: 'Hits set foes ablaze: 1d4 fire per second for 3s.', flags: ['ignite'] },
  { id: 'scorching_ray', name: 'Scorching Ray', rarity: 'uncommon', pact: 'ember', icon: C('rod/i-rod_ignition'), desc: 'Every 3rd attack also fires 3 rays of 2d6 fire.', flags: ['scorching_ray'] },
  { id: 'hellish_rebuke', name: 'Hellish Rebuke', rarity: 'common', pact: 'ember', icon: C('amulet/i-rage'), desc: 'When hit, the attacker takes 2d10 fire (DEX half). 3s cooldown.', flags: ['rebuke'] },
  { id: 'dragon_scale', name: 'Dragon Scale Mail', rarity: 'very_rare', pact: 'ember', icon: C('armour/artefact/urand_dragonskin'), desc: '+1 AC, resistance to fire, advantage on DEX saves.', mods: { ac: 1 }, flags: ['resist_fire', 'adv_dex_saves'] },
  { id: 'wyrmbane', name: 'Ashbrand', rarity: 'rare', pact: 'ember', icon: C('weapon/artefact/urand_wyrmbane'), desc: '+1 to hit. Crits detonate for 3d6 fire around the target.', mods: { toHit: 1 }, flags: ['crit_burst'] },
  // --- Rime
  { id: 'frost_brand', name: 'Frost Brand', rarity: 'very_rare', pact: 'rime', icon: C('weapon/artefact/urand_chilly_death'), desc: '+1d6 cold on hit and foes are slowed. Resist fire.', onHit: [{ dice: '1d6', type: 'cold' }], flags: ['chill', 'resist_fire'] },
  { id: 'ray_frost', name: 'Ray of Frost', rarity: 'common', pact: 'rime', icon: C('staff/i-staff_cold'), desc: 'Hits chill foes: -40% speed for 2s.', flags: ['chill'] },
  { id: 'agathys', name: 'Armor of Agathys', rarity: 'uncommon', pact: 'rime', icon: C('ring/i-r-cold'), desc: 'Start each room with 8 temp HP. While it holds, attackers take 5 cold.', mods: { tempHpPerRoom: 8 }, flags: ['agathys'] },
  { id: 'ice_storm', name: 'Ice Knife', rarity: 'common', pact: 'rime', icon: C('ring/i-ice'), desc: 'Dodging leaves a shard burst: 2d6 cold to nearby foes (DEX half).', flags: ['ice_dodge'] },
  { id: 'cloak_night', name: 'Cloak of Winter Night', rarity: 'rare', pact: 'rime', icon: C('armour/artefact/urand_night'), desc: '+1 AC and +1 to all saves. Frozen foes take +1d10.', mods: { ac: 1, saveBonus: 1 }, flags: ['shatter'] },
  // --- Dawn
  { id: 'sun_blade', name: 'Sun Blade', rarity: 'rare', pact: 'dawn', icon: C('weapon/artefact/urand_eos'), desc: '+2 to hit. +1d8 radiant (doubled against undead).', mods: { toHit: 2 }, onHit: [{ dice: '1d8', type: 'radiant', undeadX2: true }] },
  { id: 'holy_avenger', name: 'Holy Avenger', rarity: 'legendary', pact: 'dawn', icon: C('weapon/artefact/urand_undeadhunter'), desc: '+3 hit/damage, +2d10 radiant vs undead & fiends. Allies near you gain +2 to saves.', mods: { toHit: 3, dmg: 3 }, onHit: [{ dice: '2d10', type: 'radiant', only: ['undead', 'fiend'] }], flags: ['aura_saves'] },
  { id: 'divine_smite', name: 'Divine Smite', rarity: 'uncommon', pact: 'dawn', icon: C('amulet/i-faith'), desc: 'Heavy attacks that hit add 2d8 radiant.', flags: ['smite'] },
  { id: 'aura_vitality', name: 'Aura of Vitality', rarity: 'rare', pact: 'dawn', icon: C('amulet/celtic_yellow'), desc: 'Every 6s, you and nearby allies heal 1d6.', flags: ['aura_vitality'] },
  { id: 'ring_regen', name: 'Ring of Regeneration', rarity: 'very_rare', pact: 'dawn', icon: C('ring/i-regeneration'), desc: 'Regain 1 HP every 2 seconds.', mods: { regen: 0.5 } },
  { id: 'periapt', name: 'Periapt of Wound Closure', rarity: 'uncommon', pact: 'dawn', icon: C('amulet/i-spirit'), desc: 'Potions heal double. When downed, death saves are made with advantage.', flags: ['periapt'] },
  // --- Grave
  { id: 'vampiric', name: 'Vampiric Touch', rarity: 'rare', pact: 'grave', icon: C('amulet/artefact/urand_bloodlust'), desc: 'Heal for 15% of damage you deal.', mods: { lifesteal: 0.15 } },
  { id: 'finger_death', name: 'Finger of Death', rarity: 'legendary', pact: 'grave', icon: C('amulet/artefact/urand_finger'), desc: 'Foes you slay rise as spectral thralls for 12s.', flags: ['thralls'] },
  { id: 'toll_dead', name: 'Toll the Dead', rarity: 'common', pact: 'grave', icon: C('book/book_of_the_dead'), desc: '+1d8 necrotic against wounded foes.', onHit: [{ dice: '1d8', type: 'necrotic', wounded: true }] },
  { id: 'staff_death', name: 'Staff of Withering', rarity: 'uncommon', pact: 'grave', icon: C('staff/i-staff_death'), desc: 'Hits wither foes: -2 AC for 3s.', flags: ['wither'] },
  { id: 'amulet_health', name: 'Amulet of Health', rarity: 'rare', pact: 'grave', icon: C('amulet/artefact/urand_vitality'), desc: 'Your Constitution becomes 19.', mods: { setStat: { con: 19 } } },
  // --- Storm
  { id: 'witch_bolt', name: 'Witch Bolt', rarity: 'uncommon', pact: 'storm', icon: C('rod/i-rod_lightning'), desc: 'Hits arc to a second foe for 1d12 lightning.', flags: ['witch_bolt'] },
  { id: 'thunderwave', name: 'Thunderwave', rarity: 'uncommon', pact: 'storm', icon: C('misc/misc_horn'), desc: 'Drinking a potion or using a skill unleashes 2d8 thunder + knockback.', flags: ['thunderwave'] },
  { id: 'misty_step', name: 'Misty Step', rarity: 'rare', pact: 'storm', icon: C('ring/i-c-teleport'), desc: 'Your dodge becomes a short teleport. Dodge costs 30% less.', mods: { dodgeCostMul: 0.7 }, flags: ['blink_dodge'] },
  { id: 'boots_speed', name: 'Boots of Speed', rarity: 'rare', pact: 'storm', icon: C('armour/artefact/urand_faerie'), desc: '+25% speed, +1 AC.', mods: { speedMul: 1.25, ac: 1 } },
  { id: 'wand_mm', name: 'Wand of Magic Missiles', rarity: 'uncommon', pact: 'storm', icon: C('rod/i-rod_striking'), desc: 'Every 5s, fire 2 force darts (1d4+1) at a nearby foe.', flags: ['wand_mm'] },
  { id: 'four_winds', name: 'Talisman of Four Winds', rarity: 'very_rare', pact: 'storm', icon: C('amulet/artefact/urand_four_winds'), desc: 'Skills recharge 30% faster. +15% speed.', mods: { cooldownMul: 0.7, speedMul: 1.15 } },
  // --- Neutral-ish feats (assigned to pacts so every boon builds toward something)
  { id: 'tough', name: 'Tough', rarity: 'common', pact: 'grave', icon: C('ring/i-life-protection'), desc: '+2 max HP per level.', mods: { maxHpPerLevel: 2 } },
  { id: 'lucky', name: 'Lucky', rarity: 'uncommon', pact: 'storm', icon: C('misc/i-deck_wonders'), desc: '3 luck points per room: a missed attack is rerolled.', flags: ['lucky'] },
  { id: 'mobile', name: 'Mobile', rarity: 'common', pact: 'storm', icon: C('amulet/i-c-flight'), desc: '+15% speed. Dodge costs 20% less stamina.', mods: { speedMul: 1.15, dodgeCostMul: 0.8 } },
  { id: 'alert', name: 'Alert', rarity: 'common', pact: 'fang', icon: C('amulet/eye_cyan'), desc: 'First 5s of every room: advantage on attacks.', flags: ['alert'] },
  { id: 'resilient', name: 'Resilient', rarity: 'common', pact: 'dawn', icon: C('amulet/i-warding'), desc: 'Proficiency in all saving throws.', flags: ['resilient'] },
  { id: 'war_caster', name: 'War Caster', rarity: 'uncommon', pact: 'ember', icon: C('book/artefact/vellum'), desc: '+1 spell slot. Skills deal +1d6 damage.', mods: { slots: 1 }, flags: ['war_caster'] },
  { id: 'healer', name: 'Healer', rarity: 'common', pact: 'dawn', icon: C('misc/misc_phial'), desc: '+1 potion. Your potions also heal nearby allies for half.', mods: { potions: 1 }, flags: ['healer'] },
  { id: 'durable', name: 'Durable', rarity: 'common', pact: 'rime', icon: C('amulet/i-regeneration'), desc: '+1 CON and +1 max HP per level. Revives from you are faster.', mods: { statAdd: { con: 1 }, maxHpPerLevel: 1 } },
  { id: 'cloak_protection', name: 'Cloak of Protection', rarity: 'uncommon', pact: 'rime', icon: C('armour/artefact/urand_resistance'), desc: '+1 AC and +1 to saving throws.', mods: { ac: 1, saveBonus: 1 } },
  { id: 'bracers', name: 'Brooch of Shielding', rarity: 'uncommon', pact: 'dawn', icon: C('amulet/artefact/urand_brooch_of_shielding'), desc: '+2 AC. Immune to force damage.', mods: { ac: 2 } },
  { id: 'gauntlets_ogre', name: 'Gauntlets of Ogre Power', rarity: 'uncommon', pact: 'fang', icon: C('ring/i-str'), desc: 'Strength becomes 19. Heavy attacks break poise faster.', mods: { setStat: { str: 19 } }, flags: ['ogre'] },
  { id: 'luck_blade', name: 'Luck Blade', rarity: 'very_rare', pact: 'fang', icon: C('weapon/artefact/urand_knife_of_accuracy'), desc: '+1 to hit and saves. Luck: reroll misses (2/room).', mods: { toHit: 1, saveBonus: 1 }, flags: ['luck_blade'] },
  { id: 'asi', name: 'Ability Score Improvement', rarity: 'uncommon', pact: 'fang', icon: C('ring/i-protection'), desc: '+2 to your primary ability.', mods: { statAdd: { primary: 2 } }, stack: true },
];

export const SHOP_ITEMS = [
  { id: 'potion', name: 'Potion of Healing', icon: 'assets/sprites/crawl/item_potion_i-heal-wounds.png', cost: 120, desc: 'Refill one potion charge (all heroes).' },
  { id: 'greater', name: 'Alchemist\'s Draught', icon: 'assets/sprites/crawl/item_potion_i-might.png', cost: 260, desc: '+1 maximum potion charge (all heroes).' },
  { id: 'ember', name: 'Ember of Return', icon: 'assets/sprites/crawl/item_misc_misc_lamp.png', cost: 700, desc: '+1 Ember (an extra life for the party).' },
  { id: 'reroll', name: 'Deck of Fates', icon: 'assets/sprites/crawl/item_misc_misc_deck.png', cost: 150, desc: 'Every hero gains 1 boon reroll.' },
  { id: 'boon', name: 'Relic (random boon)', icon: 'assets/sprites/crawl/item_misc_misc_orb.png', cost: 380, desc: 'One hero drafts an uncommon-or-better boon.' },
  { id: 'scroll', name: 'Scroll of Restoration', icon: 'assets/sprites/crawl/item_potion_i-magic.png', cost: 90, desc: 'Restore all spell slots and heal 50%.' },
];

export function boonById(id) { return BOONS.find((b) => b.id === id); }
