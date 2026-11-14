// Combat resolution: 5e attack rolls, damage types, resistances, saves,
// criticals, sneak attack, poise, and boon hooks.
import { attackRoll, savingThrow, rollDice, netAdvantage, rng, frand } from '../core/rules.js';
import { audio } from '../core/audio.js';
import { PACTS } from '../data/boons.js';

const TYPE_COLOR = { fire: '#ff8a3a', cold: '#8fd3ff', radiant: '#ffe48a', necrotic: '#b07cff', lightning: '#7ff0ff', thunder: '#d0e0ff', poison: '#9be36a', acid: '#c8f06a', force: '#c8a0ff', psychic: '#ff9ad8' };

export function typeColor(t) { return TYPE_COLOR[t] || '#f4ecd6'; }

function damageMultiplier(target, type) {
  if (target.immune && target.immune.includes(type)) return 0;
  let m = 1;
  if (target.resist && target.resist.includes(type)) m *= 0.5;
  if (target.vuln && target.vuln.includes(type)) m *= 2;
  if (target.isHero) {
    if (target.has('rage') && ['slashing', 'piercing', 'bludgeoning'].includes(type)) m *= 0.5;
    if (target.flags.has('resist_fire') && type === 'fire') m *= 0.5;
  }
  return m;
}

// Apply typed damage parts [{amount, type}] to a target. Returns total dealt.
export function applyDamage(game, source, target, parts, { crit = false, poise = 1, knock = 0, angle = null, silent = false, heavy = false } = {}) {
  if (!target.alive) return 0;
  let total = 0;
  const shown = [];
  for (const p of parts) {
    const m = damageMultiplier(target, p.type);
    let amt = Math.floor(p.amount * m);
    if (m === 0) shown.push({ str: 'IMMUNE', color: '#888' });
    if (amt <= 0) continue;
    total += amt;
    shown.push({ str: String(amt), color: crit ? '#ffd23f' : (target.isHero ? '#ff5a4a' : typeColor(p.type)), resist: m < 1, vuln: m > 1 });
  }
  if (total > 0) {
    // uncanny dodge (rogue L5)
    if (target.isHero && target.cls.id === 'rogue' && target.level >= 5 && target.uncanny <= 0) {
      total = Math.ceil(total / 2); target.uncanny = 8;
      game.fx.text('UNCANNY', target.pos.x, 3, target.pos.z, { color: '#7fae8e' });
    }
    target.takeDamage(total, source, { crit, poise: poise * total, knock, angle, heavy });
  }
  if (!silent) {
    let y = (target.height || 2.4) + 0.4;
    for (const s of shown) {
      game.fx.text(s.str + (s.vuln ? '!' : ''), target.pos.x, y, target.pos.z, { color: s.color, big: crit, size: crit ? 1.2 : 1 });
      y += 0.5;
    }
  }
  return total;
}

function heroAdvantage(hero, target, opts) {
  let adv = 0, dis = 0;
  if (opts.heavy && hero.cls.attack.heavy.alwaysAdv) adv++;
  if (target.has && (target.has('prone') || target.has('stagger') || target.has('frozen'))) adv++;
  if (hero.has('shadowAdv')) adv++;
  if (hero.has('alert')) adv++;
  if (hero.has('whirl')) adv++;
  if (target.marked && target.marked.time > 0) adv++; // hunter's mark grants allies advantage
  if (hero.behind && hero.behind(target) && opts.melee) adv++; // backstab
  // flanking: an ally on the opposite side of the target
  if (opts.melee) for (const h of hero.game.heroes) {
    if (h === hero || !h.canAct) continue;
    if (h.distTo(target) < 3.5 && Math.abs(hero.angleDiff(target.dirTo(h), target.dirTo(hero))) > Math.PI * 0.6) { adv++; opts.flanked = true; break; }
  }
  if (hero.exhausted) dis++;
  if (hero.has('poisoned') || hero.has('frightened') || hero.has('hexed')) dis++;
  if (opts.ranged && hero.game.enemies.some((e) => e.alive && e !== target && e.distTo(hero) < 2.2)) dis++; // ranged in melee
  return netAdvantage(adv, dis);
}

// A hero attacks an enemy with weapon or spell attack. Returns result.
export function heroAttack(game, hero, target, opts = {}) {
  const a = hero.cls.attack;
  const heavy = !!opts.heavy;
  const spec = heavy ? { ...a, ...a.heavy } : a;
  const adv = heroAdvantage(hero, target, { ...opts, melee: spec.kind === 'melee' && !spec.ranged, ranged: spec.kind !== 'melee' || spec.ranged });
  let bonus = hero.toHit;
  if (heavy && hero.flags.has('gwm')) bonus -= 5;
  let ac = target.effectiveAC ? target.effectiveAC(hero) : target.ac;
  const critRange = target.has && target.has('stagger') ? Math.min(hero.critRange, 18) : hero.critRange;
  const res = attackRoll({ bonus, ac, adv, critRange, luckyReroll: () => hero.useLuck() });
  if (hero.cls.id === 'rogue' && hero.level >= 9 && !res.hit && res.roll < 6 && 6 + bonus >= ac) { res.hit = true; res.total = 6 + bonus; }
  if (!opts.noDie) game.fx.die({ x: hero.pos.x, y: 3.4, z: hero.pos.z, value: res.roll, color: hero.diceColor, good: res.hit });
  const advTxt = adv > 0 ? ' (adv)' : adv < 0 ? ' (dis)' : '';
  if (!res.hit) {
    game.log(`${hero.label}: d20 ${res.rolls.join('/')}${advTxt} +${bonus} = ${res.total} vs AC ${ac} — ${res.fumble ? 'FUMBLE' : 'miss'}`, hero.color);
    game.fx.text(res.fumble ? 'FUMBLE' : 'MISS', target.pos.x, (target.height || 2) + 0.6, target.pos.z, { color: '#9aa0a8' });
    audio.play('miss', { vol: 0.5 });
    if (res.fumble) hero.addCond('fumbled', 0.5);
    return res;
  }
  // damage
  const parts = [];
  let dice = spec.dice || a.dice;
  if (a.cantripScale && hero.level >= 5 && !heavy) dice = '2d10';
  const extra = heavy && spec.extraDice ? spec.extraDice : 0;
  const p = /^(\d*)d(\d+)$/.exec(dice);
  const nDice = (p[1] ? +p[1] : 1) + extra;
  const brutal = res.crit && hero.cls.id === 'barbarian' && hero.level >= 9 ? 1 : 0;
  const diceExpr = `${nDice + brutal}d${p[2]}`;
  const statMod = hero.mods[spec.stat || a.stat] ?? 0;
  let base = rollDice(diceExpr, { crit: res.crit, savage: hero.flags.has('savage'), maxDice: res.crit && hero.flags.has('vorpal') }) + statMod + hero.dmgBonus;
  if (hero.has('rage') && spec.kind === 'melee') base += hero.level >= 9 ? 3 : 2;
  if (heavy && hero.flags.has('gwm')) base += 10;
  if (hero.flags.has('sharpshooter') && spec.kind !== 'melee') base += 2;
  if (hero.flags.has('berserker') && hero.hp < hero.maxHp / 2) base += 3;
  if (hero.cls.id === 'wizard' && hero.level >= 7) base += hero.mods.int;
  if (hero.cls.id === 'ranger' && hero.level >= 9) base += hero.mods.wis;
  parts.push({ amount: Math.max(1, base), type: spec.type || a.type });
  // sneak attack
  if (hero.cls.id === 'rogue' && (adv > 0 || opts.flanked || game.heroes.some((h) => h !== hero && h.canAct && h.distTo(target) < 3.2)) && (target.sneakCd || 0) <= 0) {
    const n = Math.ceil(hero.level / 2);
    parts.push({ amount: rollDice(`${n}d6`, { crit: res.crit }), type: spec.type || a.type });
    target.sneakCd = 0.6;
    game.fx.text('SNEAK', target.pos.x, (target.height || 2) + 1.1, target.pos.z, { color: '#7fae8e', size: 0.9 });
  }
  if (target.marked && target.marked.owner === hero && target.marked.time > 0) parts.push({ amount: rollDice('1d6', { crit: res.crit }), type: 'force' });
  if (hero.cls.id === 'ranger' && hero.level >= 3 && target.hp < target.maxHp && (target.colossusCd || 0) <= 0) { parts.push({ amount: rollDice('1d8', { crit: res.crit }), type: spec.type || a.type }); target.colossusCd = 1; }
  if (hero.cls.id === 'druid' && hero.level >= 7 && spec.kind === 'melee') parts.push({ amount: rollDice('1d8', { crit: res.crit }), type: 'radiant' });
  if (heavy && hero.flags.has('smite')) parts.push({ amount: rollDice('2d8', { crit: res.crit }), type: 'radiant' });
  if (hero.flags.has('prey') && target.hp < target.maxHp && (target.preyCd || 0) <= 0) { parts.push({ amount: rollDice('1d8'), type: spec.type || a.type }); target.preyCd = 1; }
  if (hero.flags.has('shatter') && target.has && target.has('frozen')) parts.push({ amount: rollDice('1d10'), type: 'cold' });
  for (const oh of hero.onHit) {
    if (oh.only && !(target.tags || []).some((t) => oh.only.includes(t))) continue;
    if (oh.wounded && target.hp >= target.maxHp) continue;
    let amt = rollDice(oh.dice, { crit: res.crit });
    if (oh.undeadX2 && (target.tags || []).includes('undead')) amt *= 2;
    parts.push({ amount: amt, type: oh.type });
  }
  // vorpal
  if (res.roll === 20 && hero.flags.has('vorpal') && !target.isBoss) parts.push({ amount: 9999, type: 'slashing' });
  const before = target.hp;
  const total = applyDamage(game, hero, target, parts, { crit: res.crit, poise: heavy ? (spec.poise || 2) * (hero.flags.has('ogre') ? 1.5 : 1) : 1, knock: heavy ? 7 : 2.5, angle: hero.dirTo(target), heavy });
  game.log(`${hero.label}: d20 ${res.rolls.join('/')}${advTxt} +${bonus} = ${res.total} vs AC ${ac} — ${res.crit ? 'CRIT' : 'hit'} for ${total}`, hero.color);
  hero.afterHit(target, res, total, before);
  if (res.crit) { game.hitstop(0.09); game.shake(0.35); audio.play('crit', { vol: 0.6 }); game.fx.text('CRITICAL', target.pos.x, (target.height || 2) + 1.6, target.pos.z, { color: '#ffd23f', big: true }); }
  return { ...res, damage: total };
}

// Auto-hit damage (magic missile etc.)
export function heroAutoHit(game, hero, target, dice, type, opts = {}) {
  let amt = rollDice(dice);
  if (hero.flags.has('war_caster') && opts.skill) amt += rollDice('1d6');
  if (hero.cls.id === 'wizard' && hero.level >= 7 && opts.spell) amt += hero.mods.int;
  const before = target.hp;
  const total = applyDamage(game, hero, target, [{ amount: amt, type }], { poise: 1, knock: 1.5, angle: hero.dirTo(target) });
  hero.afterHit(target, { hit: true, crit: false, roll: 0 }, total, before, true);
  return total;
}

// Area spell with a saving throw (from hero onto enemies)
export function heroSaveDamage(game, hero, target, { dice, type, ability = 'dex', half = true, dc = null, extra = null }) {
  dc = dc ?? hero.spellDC;
  const res = savingThrow({ bonus: target.saves?.[ability] ?? 0, dc });
  let amt = rollDice(dice);
  if (hero.flags.has('war_caster')) amt += rollDice('1d6');
  if (hero.cls.id === 'wizard' && hero.level >= 7) amt += hero.mods.int;
  if (res.success) amt = half ? Math.floor(amt / 2) : 0;
  const before = target.hp;
  const total = applyDamage(game, hero, target, [{ amount: amt, type }], { poise: 1.5, knock: 4, angle: hero.dirTo(target) });
  if (extra && !res.success) extra(target);
  hero.afterHit(target, { hit: true, crit: false, roll: 0 }, total, before, true);
  game.fx.text(res.success ? 'SAVED' : 'FAILED', target.pos.x, (target.height || 2) + 1.2, target.pos.z, { color: res.success ? '#9aa0a8' : '#ffb347', size: 0.8 });
  return total;
}

// An enemy attacks a hero
export function enemyAttack(game, enemy, hero, { dice = enemy.def.dmg, type = enemy.def.type, bonus = enemy.atk, label = null, adv = 0 } = {}) {
  if (!hero.alive || hero.downed) return null;
  if (hero.invulnerable) {
    game.fx.text('DODGED', hero.pos.x, 3, hero.pos.z, { color: '#f4ecd6' });
    hero.perfectDodge && hero.perfectDodge(enemy);
    return { hit: false, dodged: true };
  }
  let a = adv, dis = 0;
  if (enemy.has('poisoned') || enemy.has('frightened') || enemy.has('hexed')) dis++;
  if (hero.has('prone') || hero.has('whirl') || hero.has('reckless')) a++;
  const res = attackRoll({ bonus, ac: hero.ac, adv: netAdvantage(a, dis) });
  game.fx.die({ x: enemy.pos.x, y: (enemy.height || 2.4) + 0.8, z: enemy.pos.z, value: res.roll, color: 'red', good: !res.hit });
  if (!res.hit) {
    game.fx.text('BLOCKED', hero.pos.x, 3, hero.pos.z, { color: '#c8c2b0', size: 0.9 });
    game.log(`${enemy.name}: d20 ${res.roll}+${bonus} = ${res.total} vs your AC ${hero.ac} — miss`, '#9aa0a8');
    audio.play('hitArmor', { vol: 0.5 });
    hero.model && hero.model.hitFlash(0x8fb0ff);
    return res;
  }
  let amt = rollDice(dice, { crit: res.crit });
  if (game.vows.has('teeth')) amt = Math.ceil(amt * 1.3);
  if (enemy.has('warcry')) amt += 2;
  const total = applyDamage(game, enemy, hero, [{ amount: amt, type }], { crit: res.crit, knock: 6, angle: enemy.dirTo(hero) });
  game.log(`${enemy.name}: d20 ${res.roll}+${bonus} = ${res.total} vs AC ${hero.ac} — ${res.crit ? 'CRIT' : 'hit'} ${total} ${type}`, '#ff6a5a');
  if (total > 0) {
    if (enemy.affixes && enemy.affixes.includes('vampiric')) enemy.heal(Math.ceil(total / 2));
    if (enemy.def.drain) enemy.heal(Math.ceil(total / 2));
    enemy.onHitHero && enemy.onHitHero(hero, total);
  }
  return { ...res, damage: total };
}

// A saving throw a hero makes against an enemy/hazard effect
export function heroSave(game, hero, { ability = 'dex', dc = 12, dice, type, half = true, source = null, onFail = null, label = '' }) {
  if (!hero.alive || hero.downed) return null;
  if (hero.invulnerable) { game.fx.text('DODGED', hero.pos.x, 3, hero.pos.z, { color: '#f4ecd6' }); return { success: true }; }
  let adv = 0;
  if (ability === 'dex' && (hero.flags.has('adv_dex_saves') || hero.cls.id === 'barbarian')) adv = 1;
  if (game.heroes.some((h) => h !== hero && h.flags.has('aura_saves') && h.distTo(hero) < 8)) hero.tempSaveBonus = 2; else hero.tempSaveBonus = 0;
  let res = savingThrow({ bonus: hero.saves[ability] + hero.tempSaveBonus, dc, adv, autoSucceed: false });
  if (!res.success && hero.cls.id === 'fighter' && hero.level >= 9 && hero.indomitable > 0) { hero.indomitable--; res = savingThrow({ bonus: hero.saves[ability], dc }); game.fx.text('INDOMITABLE', hero.pos.x, 3.6, hero.pos.z, { color: '#d8b46a' }); }
  if (!res.success && ability === 'dex' && hero.flags.has('evasion_ring')) res.success = true;
  game.fx.die({ x: hero.pos.x, y: 3.4, z: hero.pos.z, value: res.roll, color: hero.diceColor, good: res.success });
  game.log(`${hero.label} ${ability.toUpperCase()} save ${label}: d20 ${res.rolls.join('/')} +${hero.saves[ability]} = ${res.total} vs DC ${dc} — ${res.success ? 'success' : 'fail'}`, hero.color);
  if (dice) {
    let amt = rollDice(dice);
    if (game.vows.has('teeth')) amt = Math.ceil(amt * 1.3);
    if (res.success) amt = half ? Math.floor(amt / 2) : 0;
    if (res.success && ability === 'dex' && hero.cls.id === 'rogue' && hero.level >= 7) amt = 0; // Evasion
    if (amt > 0) applyDamage(game, source, hero, [{ amount: amt, type }], { knock: 5, angle: source ? source.dirTo(hero) : 0 });
    else game.fx.text('EVADED', hero.pos.x, 3, hero.pos.z, { color: '#f4ecd6' });
  }
  if (!res.success && onFail) onFail(hero);
  return res;
}

// pact bookkeeping used by heroes: attunement (3 solo) or bond (2 each, two players)
export function computePacts(heroes) {
  for (const h of heroes) h.pacts = new Set();
  const counts = heroes.map((h) => {
    const c = {};
    for (const b of h.boons) c[b.pact] = (c[b.pact] || 0) + 1;
    return c;
  });
  heroes.forEach((h, i) => {
    for (const p in PACTS) {
      if ((counts[i][p] || 0) >= 3) h.pacts.add(p);
      if ((counts[i][p] || 0) >= 2 && heroes.some((o, k) => k !== i && (counts[k][p] || 0) >= 2)) { h.pacts.add(p); h.bonds = h.bonds || new Set(); h.bonds.add(p); }
    }
  });
}

export { rng, frand };
