// Player heroes: souls-like controls (stamina, dodge i-frames, light/heavy
// attacks, flasks) wrapped around 5e character sheets.
import * as THREE from 'three';
import { Actor } from './actor.js';
import { CLASSES, DICE_COLORS, slotsForLevel } from '../data/classes.js';
import { mod, profBonus, rollDice, d20 } from '../core/rules.js';
import { heroAttack, heroAutoHit, heroSaveDamage, applyDamage, typeColor } from './combat.js';
import { audio } from '../core/audio.js';
import { input } from '../core/input.js';
import { frand } from '../core/rules.js';
import { t } from '../i18n/index.js';

const STAM_MAX = 100;
const LOCK_RANGE = 28;
export const RAISE_TIME = 2.6; // seconds of holding Interact to raise a slain ally
const DODGE_COST = 24;

export class Hero extends Actor {
  constructor(game, slot, classId, controllerId, skin = '') {
    super(game);
    this.isHero = true;
    this.slot = slot;
    this.cls = CLASSES[classId];
    this.controllerId = controllerId;
    this.skin = skin;
    this.color = ['#e05a47', '#4f8fe0', '#59c06b', '#e8c547'][slot];
    this.diceColor = DICE_COLORS[slot];
    this.level = 1;
    this.boons = [];
    this.flags = new Set();
    this.onHit = [];
    this.pacts = new Set();
    this.rerolls = 0;
    this.radius = 0.75;
    this.height = 2.5;
    this.state = 'free';
    this.stateT = 0;
    this.combo = 0;
    this.queued = null;
    this.stamina = STAM_MAX;
    this.staminaDelay = 0;
    this.exhausted = false;
    this.cooldowns = [0, 0];
    this.potionAnim = 0;
    this.deathSaves = { s: 0, f: 0, t: 2.2 };
    this.downed = false;
    this.dead = false;
    this.reviveProgress = 0;
    this.tempHp = 0;
    this.uncanny = 0; this.indomitable = 1; this.luck = 0;
    this.attackCount = 0; this.hitCount = 0;
    this.stepT = 0;
    this.counters = { moved: 0, attacks: 0, heavy: 0, dodges: 0, skills: 0, potions: 0, lock: 0, revives: 0 };
    this.lockTarget = null;
    this.stats = { dealt: 0, taken: 0, kills: 0, crits: 0, nat20: 0, nat1: 0, revives: 0, downs: 0 };
    this.recompute(true);
    this.potions = this.potionsMax;
    this.slots = this.slotsMax;
  }

  get label() { return `P${this.slot + 1} ${t(this.cls.name)}`; }
  get ctrl() { return input.byId(this.controllerId); }
  get canAct() { return this.alive && !this.downed && !this.dead; }
  get invulnerable() { return this.iframes > 0 || this.game.cinematic; }

  recompute(initial = false) {
    const c = this.cls;
    const ab = { ...c.abilities };
    const m = { ac: 0, toHit: 0, dmg: 0, saveBonus: 0, speedMul: 1, maxHpPerLevel: 0, maxHpFlat: 0, critRange: 0, regen: 0, lifesteal: 0, slots: 0, potions: 0, dodgeCostMul: 1, cooldownMul: 1, tempHpPerRoom: 0 };
    this.flags = new Set(); this.onHit = [];
    for (const b of this.boons) {
      const bm = b.mods || {};
      for (const k in bm) {
        if (k === 'setStat') for (const s in bm.setStat) ab[s] = Math.max(ab[s], bm.setStat[s]);
        else if (k === 'statAdd') for (const s in bm.statAdd) { const key = s === 'primary' ? c.primary : s; ab[key] = Math.min(22, ab[key] + bm.statAdd[s]); }
        else if (k.endsWith('Mul')) m[k] *= bm[k];
        else m[k] = (m[k] || 0) + bm[k];
      }
      (b.flags || []).forEach((f) => this.flags.add(f));
      (b.onHit || []).forEach((o) => this.onHit.push(o));
    }
    if (this.flags.has('luck_blade')) this.flags.add('lucky');
    this.abilities = ab;
    this.mods = {}; for (const k in ab) this.mods[k] = mod(ab[k]);
    this.prof = profBonus(this.level);
    const hd = c.hitDie, conM = this.mods.con;
    const oldMax = this.maxHp || 0;
    // 5e hit points plus 'Vigor' (+6, +2/level): a buffer for real-time action
    this.maxHp = hd + conM + (Math.floor(hd / 2) + 1 + conM) * (this.level - 1) + m.maxHpPerLevel * this.level + m.maxHpFlat + 6 + 2 * this.level;
    const ar = c.armor;
    this.ac = ar.base + Math.min(this.mods.dex, ar.dexCap) + ar.shield + (ar.conToAc ? conM : 0) + m.ac + (c.id === 'fighter' && this.level >= 7 ? 1 : 0);
    this.toHit = this.prof + this.mods[c.attack.stat] + m.toHit;
    this.dmgBonus = m.dmg;
    this.saves = {};
    for (const k of ['str', 'dex', 'con', 'int', 'wis', 'cha']) this.saves[k] = this.mods[k] + ((c.saves.includes(k) || this.flags.has('resilient')) ? this.prof : 0) + m.saveBonus;
    let spd = 6.4 * m.speedMul;
    if ((c.id === 'fighter' || c.id === 'ranger') && this.level >= 7) spd *= 1.1;
    if (c.id === 'barbarian' && this.level >= 7) spd *= 1.15;
    this.speed = spd;
    this.critRange = 20 - m.critRange - (c.id === 'fighter' && this.level >= 3 ? 1 : 0);
    this.spellDC = 8 + this.prof + this.mods[c.caster || c.primary];
    this.slotsMax = c.caster ? slotsForLevel(this.level) + m.slots + (c.id === 'wizard' && this.level >= 3 ? 1 : 0) : m.slots;
    this.potionsMax = 3 + m.potions + (this.game.meta.has('flask') ? 1 : 0);
    this.regen = m.regen; this.lifesteal = m.lifesteal;
    this.dodgeCost = DODGE_COST * m.dodgeCostMul * (c.id === 'rogue' ? 0.8 : 1) * (c.id === 'rogue' && this.level >= 3 ? 0.85 : 1);
    this.cooldownMul = m.cooldownMul;
    this.tempHpPerRoom = m.tempHpPerRoom;
    this.extraAttack = (['fighter', 'barbarian', 'ranger'].includes(c.id) && this.level >= 5);
    if (initial) this.hp = this.maxHp;
    else if (this.maxHp > oldMax) this.hp += this.maxHp - oldMax;
    this.hp = Math.min(this.hp, this.maxHp);
  }

  async spawnModel(lib) {
    const c = this.cls;
    this.model = await lib.instance({ path: 'heroes/' + c.model + '.glb', rig: 'Rig_Medium', rim: 'hero', height: 2.55, gear: c.gear, skin: this.skin ? { base: c.skinBase, name: this.skin } : null });
    this.model.loop('Idle_A');
    this.game.scene.add(this.model.root);
    this.shadow = this.game.fx.blobShadow(1.8);
    this.game.scene.add(this.shadow);
    // player ring
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.08, 24), new THREE.MeshBasicMaterial({ color: this.color, transparent: true, opacity: 0.7, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.09;
    this.ring = ring; this.game.scene.add(ring);
    // lock-on marker: a rotating dashed ring under the locked target
    const lr = new THREE.Mesh(new THREE.RingGeometry(1.25, 1.55, 6, 1, 0, Math.PI * 2), new THREE.MeshBasicMaterial({ color: this.color, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
    lr.rotation.x = -Math.PI / 2; lr.visible = false;
    this.lockRing = lr; this.game.scene.add(lr);
    this.lantern = this.game.fx.persistentLight({ x: this.pos.x, y: 3.2, z: this.pos.z, color: 0xffc890, intensity: 26, distance: 18, flicker: 0.2 });
    if (this.lantern) { this.lantern.userData.owner = this; this.lantern.userData.ownerY = 3.4; }
  }

  removeModel() {
    if (this.lockRing) this.game.scene.remove(this.lockRing);
    if (this.model) this.game.scene.remove(this.model.root);
    if (this.shadow) this.game.scene.remove(this.shadow);
    if (this.ring) this.game.scene.remove(this.ring);
  }

  placeAt(x, z, facing = -Math.PI / 2) {
    this.pos.set(x, 0, z); this.facing = this.visualFacing = facing; this.knock.set(0, 0, 0);
  }

  // ---------------- per room / rest -----------------
  onRoomStart() {
    this.lockTarget = null;
    this.luck = this.flags.has('luck_blade') ? 2 : this.flags.has('lucky') ? 3 : 0;
    this.indomitable = 1;
    if (this.tempHpPerRoom) this.tempHp = Math.max(this.tempHp, this.tempHpPerRoom);
    if (this.flags.has('alert')) this.addCond('alert', 5);
  }
  onRoomClear() {
    if (this.cls.caster) this.slots = Math.min(this.slotsMax, this.slots + 1); // arcane recovery
    if (this.dead || this.downed) this.revive(this.dead ? Math.ceil(this.maxHp * 0.25) : Math.ceil(this.maxHp * 0.15), true);
  }
  fullRest(refillPotions = true) {
    this.hp = this.maxHp; this.slots = this.slotsMax; if (refillPotions) this.potions = this.potionsMax;
    this.cooldowns = [0, 0]; this.stamina = STAM_MAX; this.cond = {};
    if (this.downed || this.dead) this.revive(this.maxHp, true);
  }
  useLuck() { if (this.luck > 0) { this.luck--; this.game.fx.text('LUCKY!', this.pos.x, 3.8, this.pos.z, { color: '#c8f06a' }); return true; } return false; }

  heal(n, src = null) {
    if (this.dead || n <= 0) return 0;
    if (this.downed) { this.revive(n); return n; }
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + n);
    const h = this.hp - before;
    if (h > 0) this.game.fx.text('+' + h, this.pos.x, 3.2, this.pos.z, { color: '#7dff8a' });
    return h;
  }

  revive(hp, quiet = false) {
    this.downed = false; this.dead = false; this.alive = true;
    this.hp = Math.max(1, Math.min(this.maxHp, hp));
    this.deathSaves = { s: 0, f: 0, t: 2.2 };
    this.state = 'free'; this.iframes = 1.2;
    this.model.stopOneShot();
    this.model.loop('Idle_A');
    this.model.once('Spawn_Ground', { duration: 0.8 });
    this.model.setOpacity(1);
    if (!quiet) { this.game.fx.text('REVIVED', this.pos.x, 3.4, this.pos.z, { color: '#7dff8a', big: true }); audio.play('levelUp', { vol: 0.5 }); }
    this.game.fx.burst('star_05', this.pos.x, 1, this.pos.z, 14, { color: 0xfff0b0, speed: 3, up: 4 });
  }

  takeDamage(amount, source, { crit = false, knock = 0, angle = null, heavy = false } = {}) {
    if (this.dead) return;
    this.stats.taken += amount;
    this.game.roomStats.hitsTaken++;
    if (this.downed) {
      this.deathSaves.f += crit ? 2 : 1;
      this.game.fx.text('DEATH SAVE ✗', this.pos.x, 2.2, this.pos.z, { color: '#ff4a4a' });
      if (this.deathSaves.f >= 3) this.die();
      return;
    }
    // Armor of Agathys retaliation
    if (this.tempHp > 0 && this.flags.has('agathys') && source && source.alive && !source.isHero) applyDamage(this.game, this, source, [{ amount: 5, type: 'cold' }], { silent: false });
    if (this.tempHp > 0) { const ab = Math.min(this.tempHp, amount); this.tempHp -= ab; amount -= ab; }
    this.hp -= amount;
    // getting hit should hurt to watch too: scaled to how much of your health it took
    const g = this.game, rel = Math.min(1, amount / this.maxHp), sev = Math.min(1.3, 0.3 + rel * 2.2 + (crit ? 0.4 : 0));
    this.model.hitFlash(0xff3020);
    this.pop = Math.min(1, 0.45 + sev * 0.5);
    g.shake(0.18 + sev * 0.35);
    g.flash(0.08 + sev * 0.06, '#ff2010', 0.05 + sev * 0.06);
    g.hurtVignette = Math.min(1, (g.hurtVignette || 0) + 0.3 + sev * 0.4);
    if (sev > 0.6) { g.hitstop(0.04 + sev * 0.05); g.aberr = Math.max(g.aberr, sev * 0.6); }
    if (angle !== null) { g.punch.x += Math.cos(angle) * sev * 0.7; g.punch.z += Math.sin(angle) * sev * 0.7; }
    audio.play('hitFlesh', { vol: 0.8 });
    if (sev > 0.7) audio.play('hitHeavy', { vol: 0.5, rate: 0.75 });
    input.rumble(this.controllerId, Math.min(1, 0.35 + sev * 0.5), 90 + sev * 160);
    g.fx.blood(this.pos.x, this.pos.z, 0x8a1020, 6 + Math.round(sev * 10));
    g.fx.spawn('flare_01', { x: this.pos.x, y: 1.5, z: this.pos.z, life: 0.1, size: 1.6 + sev * 1.5, grow: 2, color: 0xff4030 });
    g.ui.hurt && g.ui.hurt(this, sev);
    if (angle !== null && knock) { this.knock.x += Math.cos(angle) * knock * (1 + sev * 0.4); this.knock.z += Math.sin(angle) * knock * (1 + sev * 0.4); }
    if (source && !source.isHero && this.flags.has('rebuke') && (this.rebukeCd || 0) <= 0 && source.alive) {
      this.rebukeCd = 3;
      heroSaveDamage(this.game, this, source, { dice: '2d10', type: 'fire', ability: 'dex' });
      this.game.fx.burst('flame_03', source.pos.x, 1.5, source.pos.z, 10, { color: 0xff7a2f, speed: 3, up: 3 });
    }
    if (this.hp <= 0) this.goDown();
    else if (heavy || amount >= this.maxHp * 0.3) { this.interrupt(); this.state = 'stagger'; this.stateT = 0.35; this.model.once('Hit_A', { duration: 0.35 }); }
  }

  interrupt() { this.queued = null; if (this.castFx) this.castFx = null; }

  goDown() {
    // solo: a second chance once per depth (recharged at shrines), at a price
    const run = this.game.run;
    if (this.game.heroes.length === 1 && run && run.secondChance > 0) { this.secondChance(); return; }
    this.hp = 0; this.downed = true; this.state = 'downed'; this.interrupt();
    this.stats.downs++;
    this.deathSaves = { s: 0, f: 0, t: 2.4 };
    this.model.once('Death_A', { duration: 0.9, hold: true });
    this.game.fx.text('DOWNED', this.pos.x, 3.4, this.pos.z, { color: '#ff4a4a', big: true });
    this.game.log(t('{0} falls! Death saves begin.', this.label), '#ff4a4a');
    audio.play('downed', { vol: 0.7 });
    this.game.hitstop(0.12);
  }
  secondChance() {
    const g = this.game, run = g.run;
    run.secondChance--;
    const lost = Math.floor(run.ash * 0.25);
    run.ash -= lost;
    const potionLost = this.potions > 0;
    if (potionLost) this.potions--;
    this.hp = Math.ceil(this.maxHp * 0.5);
    this.iframes = 2.2; this.state = 'free'; this.interrupt();
    this.model.stopOneShot(); this.model.once('Spawn_Ground', { duration: 0.8 });
    g.hitstop(0.35); g.flash(0.35, '#ffb060'); g.shake(0.6);
    g.fx.burst('flame_05', this.pos.x, 1, this.pos.z, 30, { color: 0xffb060, speed: 8, up: 5, size: 1.4 });
    g.fx.light({ x: this.pos.x, z: this.pos.z, color: 0xffb060, intensity: 20, life: 0.6, distance: 18 });
    for (const e of g.enemies) if (e.alive && e.distTo(this) < 6) { const a = this.dirTo(e); e.knock.x += Math.cos(a) * 16; e.knock.z += Math.sin(a) * 16; e.addCond('prone', 1); }
    g.ui.banner('Second Chance', potionLost ? t('You rise again — lost {0} Ash and a potion.', lost) : t('You rise again — lost {0} Ash.', lost), 2.6);
    g.log(t('{0} refuses to fall (-{1} Ash).', this.label, lost), '#ffb060');
    audio.play('levelUp', { vol: 0.8 });
    g.ui.refreshHud();
  }

  die() {
    this.downed = false; this.dead = true; this.state = 'dead';
    this.model.setOpacity(0.35);
    this.game.fx.text('SLAIN', this.pos.x, 3.4, this.pos.z, { color: '#ff2a2a', big: true });
    this.game.fx.burst('smoke_07', this.pos.x, 1, this.pos.z, 12, { color: 0x553344, speed: 2, up: 2, additive: false });
    this.game.log(t('{0} has died. They return when the room is cleared.', this.label), '#ff2a2a');
  }

  // ---------------- targeting helpers -----------------
  autoTarget(range, coneDeg, dirAngle = this.facing) {
    // a locked-on target always wins (if it is still reasonably in range)
    if (this.lockValid() && this.distTo(this.lockTarget) <= range * 1.5 + this.lockTarget.radius) return this.lockTarget;
    let best = null, bestScore = 1e9;
    for (const e of this.game.enemies) {
      if (!e.alive || e.hidden) continue;
      const d = this.distTo(e);
      if (d > range + e.radius) continue;
      const ad = Math.abs(this.angleDiff(this.dirTo(e), dirAngle));
      if (ad > coneDeg * Math.PI / 360) continue;
      const score = d + ad * 4;
      if (score < bestScore) { bestScore = score; best = e; }
    }
    return best;
  }
  nearestEnemy(range = 99) {
    let best = null, bd = range;
    for (const e of this.game.enemies) if (e.alive && !e.hidden) { const d = this.distTo(e); if (d < bd) { bd = d; best = e; } }
    return best;
  }
  desiredAngle() {
    if (this.lockValid()) return this.dirTo(this.lockTarget);
    const c = this.ctrl;
    if (c && c.aim) return Math.atan2(c.aim.y, c.aim.x);
    if (c && (c.move.x || c.move.y)) return Math.atan2(c.move.y, c.move.x);
    return this.facing;
  }

  // ---------------- lock-on (ranged classes) -----------------
  get canLock() { return this.cls.attack.kind !== 'melee'; }
  lockValid() { const e = this.lockTarget; return !!(e && e.alive && !e.hidden && !e.gone); }
  lockCandidates() {
    return this.game.enemies.filter((e) => e.alive && !e.hidden && !e.thrall && this.distTo(e) < LOCK_RANGE);
  }
  setLock(e) {
    this.lockTarget = e || null;
    if (e) { this.counters.lock++; audio.play('select', { vol: 0.35, rate: 1.3 }); }
  }
  // tap: lock onto the best target in front, or cycle to the next one; hold: release
  updateLock(c, dt) {
    if (!this.canLock) return;
    if (this.lockTarget && !this.lockValid()) {
      // target died: hop to the nearest remaining foe, souls-style
      const next = this.lockCandidates().sort((a, b) => this.distTo(a) - this.distTo(b))[0];
      this.lockTarget = next && this.distTo(next) < 20 ? next : null;
    }
    if (this.lockValid() && this.distTo(this.lockTarget) > LOCK_RANGE + 6) this.lockTarget = null;
    if (!c || this.game.inputLocked) return;
    if (c.pressed('lock')) this.lockHold = 0;
    if (c.held.lock) {
      this.lockHold = (this.lockHold || 0) + dt;
      if (this.lockHold > 0.45 && this.lockTarget) { this.lockTarget = null; this.lockHold = -99; audio.play('back', { vol: 0.3 }); }
    }
    if (c.released('lock') && this.lockHold >= 0) {
      const cands = this.lockCandidates();
      if (!cands.length) { this.lockTarget = null; return; }
      if (!this.lockValid()) {
        // prefer what we're facing, then the closest
        cands.sort((a, b) => (this.distTo(a) + Math.abs(this.angleDiff(this.dirTo(a), this.facing)) * 6) - (this.distTo(b) + Math.abs(this.angleDiff(this.dirTo(b), this.facing)) * 6));
        this.setLock(cands[0]);
      } else {
        // cycle clockwise by angle around the hero
        const cur = this.dirTo(this.lockTarget);
        const rel = (e) => { let d = this.dirTo(e) - cur; while (d <= 0) d += Math.PI * 2; return d; };
        const next = cands.filter((e) => e !== this.lockTarget).sort((a, b) => rel(a) - rel(b))[0];
        if (next) this.setLock(next);
      }
    }
    // gamepad: flick the right stick to switch to the foe in that direction
    if (this.lockValid() && c.aim) {
      if (!this.aimFlicked) {
        this.aimFlicked = true;
        const want = Math.atan2(c.aim.y, c.aim.x);
        const best = this.lockCandidates().filter((e) => e !== this.lockTarget)
          .map((e) => ({ e, d: Math.abs(this.angleDiff(this.dirTo(e), want)) })).filter((o) => o.d < 0.9).sort((a, b) => a.d - b.d)[0];
        if (best) this.setLock(best.e);
      }
    } else this.aimFlicked = false;
  }

  spendStamina(n) {
    this.stamina -= n; this.staminaDelay = 0.65;
    if (this.stamina <= 0) { this.stamina = Math.max(this.stamina, -20); this.exhausted = true; }
  }

  // ---------------- main update -----------------
  update(dt) {
    const g = this.game;
    this.tickConds(dt);
    this.iframes = Math.max(0, (this.iframes || 0) - dt);
    this.uncanny -= dt; this.rebukeCd = (this.rebukeCd || 0) - dt;
    if (this.model) this.model.update(dt);
    if (this.ring) { this.ring.position.set(this.pos.x, 0.09, this.pos.z); this.ring.visible = !this.dead; }
    if (this.lockRing) {
      const lt = this.lockValid() ? this.lockTarget : null;
      this.lockRing.visible = !!lt && !this.dead;
      if (lt) { const s2 = Math.max(1, lt.radius * 1.3); this.lockRing.scale.set(s2, s2, s2); this.lockRing.position.set(lt.pos.x, 0.12, lt.pos.z); this.lockRing.rotation.z += dt * 2.5; }
    }
    if (this.lantern) this.lantern.intensity = this.dead ? 0 : this.lantern.intensity;

    if (this.dead) { this.syncModel(dt); return; }
    // a player with a menu panel open steers the panel, not the hero
    const c = this.menuLock ? null : this.ctrl;

    if (this.downed) { this.lockTarget = null; this.updateDowned(dt, c); this.syncModel(dt); return; }
    this.updateLock(c, dt);

    // regen / auras / timers
    if (this.regen) { this.regenAcc = (this.regenAcc || 0) + this.regen * dt; if (this.regenAcc >= 1) { this.regenAcc -= 1; if (this.hp < this.maxHp) this.hp++; } }
    if (this.flags.has('aura_vitality')) { this.auraT = (this.auraT || 6) - dt; if (this.auraT <= 0) { this.auraT = 6; for (const h of g.heroes) if (h.canAct && h.distTo(this) < 8) h.heal(rollDice('1d6')); g.fx.burst('star_07', this.pos.x, 1, this.pos.z, 10, { color: 0xffe48a, speed: 5, up: 1 }); } }
    if (this.flags.has('wand_mm') && g.combatActive) { this.wandT = (this.wandT || 5) - dt; if (this.wandT <= 0) { const t = this.nearestEnemy(16); if (t) { this.wandT = 5; for (let i = 0; i < 2; i++) g.spawnProjectile({ kind: 'missile', owner: this, x: this.pos.x, z: this.pos.z, target: t, auto: { dice: '1d4+1', type: 'force' }, speed: 18, delay: i * 0.12 }); } } }
    for (let i = 0; i < 2; i++) this.cooldowns[i] = Math.max(0, this.cooldowns[i] - dt);

    // stamina
    this.staminaDelay -= dt;
    if (this.staminaDelay <= 0 && this.state !== 'dodge') this.stamina = Math.min(STAM_MAX, this.stamina + (this.has('surge') ? 90 : 45) * dt);
    if (this.exhausted && this.stamina >= STAM_MAX * 0.35) this.exhausted = false;

    this.stateT -= dt;
    let moveMul = 1;
    const mv = c ? c.move : { x: 0, y: 0 };

    switch (this.state) {
      case 'free': {
        if (!c || g.inputLocked) break;
        if (c.pressed('dodge')) { this.startDodge(mv); break; }
        if (c.pressed('attack')) { this.startAttack(false); break; }
        if (c.pressed('heavy')) { this.startAttack(true); break; }
        if (c.pressed('skill1')) { this.useSkill(0); break; }
        if (c.pressed('skill2')) { this.useSkill(1); break; }
        if (c.pressed('potion')) { this.drinkPotion(); break; }
        break;
      }
      case 'attack': {
        moveMul = 0.22;
        const atk = this.atk;
        atk.t += dt;
        if (atk.t < atk.windup) {
          // allow re-aiming during windup
          if (c && (c.aim || c.move.x || c.move.y) && atk.t < atk.windup * 0.6) this.turnTowards(this.desiredAngle(), 12, dt);
          if (atk.lunge) this.move(Math.cos(this.facing) * atk.lunge * dt / atk.windup, Math.sin(this.facing) * atk.lunge * dt / atk.windup);
        } else if (!atk.struck) {
          atk.struck = true; this.strike(atk);
        } else if (atk.t >= atk.windup + atk.recover) {
          this.state = 'free';
          if (this.queued) { const q = this.queued; this.queued = null; if (q === 'attack') this.startAttack(false); else if (q === 'heavy') this.startAttack(true); else if (q === 'dodge') this.startDodge(mv); }
        }
        if (c && !g.inputLocked) {
          if (c.pressed('attack')) this.queued = 'attack';
          if (c.pressed('heavy')) this.queued = 'heavy';
          if (c.pressed('dodge')) { if (atk.struck) { this.state = 'free'; this.startDodge(mv); } else this.queued = 'dodge'; }
        }
        break;
      }
      case 'dodge': {
        moveMul = 0;
        const t = 1 - Math.max(0, this.stateT) / this.dodgeDur;
        const sp = this.dodgeSpeed * (1 - t * 0.7);
        this.move(Math.cos(this.dodgeDir) * sp * dt, Math.sin(this.dodgeDir) * sp * dt);
        // speed trail in the hero's colour
        this.trailT = (this.trailT || 0) - dt;
        if (this.trailT <= 0) {
          this.trailT = 0.025;
          g.fx.spawn('smoke_03', { x: this.pos.x, y: 1.15, z: this.pos.z, life: 0.3, size: 1.9, grow: -1.1, color: this.color, opacity: 0.9 });
          g.fx.spawn('spark_04', { x: this.pos.x + frand(-0.3, 0.3), y: frand(0.6, 1.8), z: this.pos.z + frand(-0.3, 0.3), life: 0.3, size: 0.25, color: 0xffffff, opacity: 0.8 });
        }
        if (this.stateT <= 0) { this.state = 'free'; if (this.queued === 'attack') { this.queued = null; this.startAttack(false); } }
        if (c && c.pressed('attack')) this.queued = 'attack';
        break;
      }
      case 'cast': {
        moveMul = 0.35;
        if (this.stateT <= this.castAt && this.castFn) { const f = this.castFn; this.castFn = null; f(); }
        if (this.stateT <= 0) this.state = 'free';
        break;
      }
      case 'potion': {
        moveMul = 0.4;
        if (this.stateT <= this.potionAt && !this.potionDone) { this.potionDone = true; this.applyPotion(); }
        if (this.stateT <= 0) this.state = 'free';
        break;
      }
      case 'stagger': { moveMul = 0.1; if (this.stateT <= 0) this.state = 'free'; break; }
      case 'revive': {
        moveMul = 0;
        const tgt = this.reviveTarget;
        if (!c || !c.held.interact || !tgt || !(tgt.downed || tgt.dead) || this.distTo(tgt) > 3) { this.state = 'free'; this.reviveTarget = null; break; }
        this.reviveProgress += dt * (this.flags.has('durable') ? 1.4 : 1);
        if (tgt.dead && this.reviveProgress >= RAISE_TIME) {
          // co-op: raise a slain ally mid-fight by burning part of the party's Ash
          const cost = g.raiseCost();
          g.run.ash = Math.max(0, g.run.ash - cost);
          tgt.revive(Math.ceil(tgt.maxHp * 0.3));
          g.fx.burst('flame_05', tgt.pos.x, 1, tgt.pos.z, 24, { color: 0xffb060, speed: 4, up: 6 });
          g.log(t('{0} raises {1} from the ashes (-{2} Ash).', this.label, tgt.label, cost), '#ffb060');
          this.stats.revives++;
          this.state = 'free'; this.reviveTarget = null;
        } else if (tgt.downed && this.reviveProgress >= 1.3) {
          const r = d20(); const medicine = r.roll + this.mods.wis + (this.cls.id === 'druid' ? this.prof : 0);
          g.fx.die({ x: this.pos.x, y: 3.4, z: this.pos.z, value: r.roll, color: this.diceColor, good: medicine >= 10 });
          g.log(`${this.label} ${t('Medicine check')}: d20 ${r.roll} + ${medicine - r.roll} = ${medicine} ${t('vs DC {0}', 10)}`, this.color);
          tgt.revive(medicine >= 10 ? Math.max(1, Math.floor(tgt.maxHp * (medicine >= 20 ? 0.5 : 0.25))) : 1);
          this.stats.revives++;
          this.state = 'free'; this.reviveTarget = null;
        }
        break;
      }
    }

    // interact (revive / world interactions)
    if (c && !g.inputLocked && this.state === 'free' && c.pressed('interact')) {
      const tgt = g.heroes.find((h) => h !== this && h.downed && h.distTo(this) < 3) || g.heroes.find((h) => h !== this && h.dead && h.distTo(this) < 3);
      if (tgt) { this.state = 'revive'; this.reviveTarget = tgt; this.reviveProgress = 0; this.counters.revives++; this.model.loop('Interact'); }
      else g.interact(this);
    }

    // movement
    let speed = this.speed * moveMul;
    if (this.has('slowed')) speed *= 0.6;
    if (this.exhausted) speed *= 0.8;
    if (this.has('rage')) speed *= 1.05;
    if (this.has('dash')) speed *= 1.6;
    const ml = Math.hypot(mv.x, mv.y);
    if (ml > 0.05 && moveMul > 0 && !g.inputLocked) {
      this.move(mv.x * speed * dt, mv.y * speed * dt);
      this.counters.moved += ml * speed * dt;
      if (this.state === 'free') this.turnTowards(this.desiredAngle(), 16, dt);
      this.stepT -= dt * ml * speed;
      if (this.stepT <= 0) {
        this.stepT = 2.6; audio.play('step', { vol: 0.18 });
        if (speed > 5) g.fx.spawn('smoke_03', { x: this.pos.x - mv.x * 0.6, y: 0.25, z: this.pos.z - mv.y * 0.6, vy: 0.4, life: 0.45, size: 0.7, grow: 0.8, color: 0x8a7a68, additive: false, opacity: 0.45 });
      }
    } else if (this.state === 'free' && ((c && c.aim) || this.lockValid())) this.turnTowards(this.desiredAngle(), 16, dt);
    this.applyKnock(dt);
    // leash to party centroid so the shared camera works
    const lc = g.leashCenter;
    if (lc && g.heroes.length > 1) {
      const dx = this.pos.x - lc.x, dz = this.pos.z - lc.z, dd = Math.hypot(dx, dz), max = 11;
      if (dd > max) this.move(-dx / dd * (dd - max), -dz / dd * (dd - max));
    }
    this.separate(g.heroes, 6, dt);

    // animation base loop
    if (this.state === 'free' || this.state === 'potion' || this.state === 'cast') {
      if (ml > 0.05 && this.lockValid()) {
        // locked on: strafe / backpedal while facing the target
        const rel = this.angleDiff(Math.atan2(mv.y, mv.x), this.facing);
        const anim = Math.abs(rel) < 0.8 ? (this.cls.id === 'ranger' ? 'Running_HoldingBow' : 'Running_A') : Math.abs(rel) > 2.3 ? 'Walking_Backwards' : rel > 0 ? 'Running_Strafe_Right' : 'Running_Strafe_Left';
        this.model.loop(anim, { speed: Math.max(0.6, speed / 6.2) });
      } else if (ml > 0.05) this.model.loop(this.cls.id === 'ranger' ? 'Running_HoldingBow' : (speed > 5 ? 'Running_A' : 'Walking_A'), { speed: Math.max(0.6, speed / 6.2) });
      else this.model.loop(this.cls.id === 'barbarian' ? 'Melee_2H_Idle' : 'Idle_A');
    }
    this.syncModel(dt);
  }

  updateDowned(dt, c) {
    const g = this.game;
    // crawl slowly
    if (c && (c.move.x || c.move.y)) { this.move(c.move.x * 0.9 * dt, c.move.y * 0.9 * dt); }
    this.applyKnock(dt);
    if (this.deathSaves.s >= 3) return; // stable
    this.deathSaves.t -= dt;
    if (this.deathSaves.t <= 0) {
      this.deathSaves.t = 2.4;
      const r = d20(this.flags.has('periapt') ? 1 : 0);
      const v = r.roll;
      g.fx.die({ x: this.pos.x, y: 3, z: this.pos.z, value: v, color: this.diceColor, good: v >= 10 });
      if (v === 20) { g.log(t('{0} rolls a natural 20 on a death save and rises!', this.label), '#ffd23f'); this.revive(1); return; }
      if (v === 1) this.deathSaves.f += 2; else if (v >= 10) this.deathSaves.s++; else this.deathSaves.f++;
      g.log(`${this.label} ${t('death save')}: ${v} (${this.deathSaves.s}✓ ${this.deathSaves.f}✗)`, v >= 10 ? '#cfc7b4' : '#ff4a4a');
      if (this.deathSaves.f >= 3) this.die();
      else if (this.deathSaves.s >= 3) { g.fx.text('STABLE', this.pos.x, 3, this.pos.z, { color: '#cfc7b4' }); }
    }
  }

  // ---------------- actions -----------------
  startDodge(mv) {
    if (this.stamina <= 0 && !this.has('surge')) { audio.play('error', { vol: 0.3 }); return; }
    const ml = Math.hypot(mv.x, mv.y);
    this.dodgeDir = ml > 0.1 ? Math.atan2(mv.y, mv.x) : this.facing + Math.PI;
    if (!this.has('surge')) this.spendStamina(this.dodgeCost);
    this.counters.dodges++;
    this.interrupt();
    if (this.flags.has('blink_dodge')) {
      // misty step: instant short teleport
      const d = 6.5; let tx = this.pos.x, tz = this.pos.z;
      for (let s = 0.5; s <= d; s += 0.5) { const nx = this.pos.x + Math.cos(this.dodgeDir) * s, nz = this.pos.z + Math.sin(this.dodgeDir) * s; if (this.blocked(nx, nz)) break; tx = nx; tz = nz; }
      this.game.fx.burst('smoke_03', this.pos.x, 1.2, this.pos.z, 8, { color: 0x9ad8ff, speed: 2 });
      this.pos.x = tx; this.pos.z = tz;
      this.game.fx.burst('smoke_03', tx, 1.2, tz, 8, { color: 0x9ad8ff, speed: 2 });
      this.state = 'dodge'; this.dodgeDur = 0.18; this.stateT = 0.18; this.dodgeSpeed = 0; this.iframes = 0.3;
    } else {
      this.facing = this.dodgeDir; this.visualFacing = this.dodgeDir;
      this.state = 'dodge'; this.dodgeDur = 0.44; this.stateT = 0.44; this.dodgeSpeed = 15.5; this.iframes = 0.3;
      this.model.once('Dodge_Forward', { duration: 0.44 });
    }
    audio.play('dodge', { vol: 0.5 });
    for (let i = 0; i < 6; i++) this.game.fx.spawn('smoke_03', { x: this.pos.x, y: 0.3, z: this.pos.z, vx: -Math.cos(this.dodgeDir) * frand(1, 3) + frand(-1, 1), vz: -Math.sin(this.dodgeDir) * frand(1, 3) + frand(-1, 1), vy: frand(0.3, 1), life: 0.5, size: 0.8, grow: 1, color: 0x8a7a68, additive: false, opacity: 0.5 });
    if (this.flags.has('ice_dodge')) {
      this.game.fx.burst('star_05', this.pos.x, 0.6, this.pos.z, 12, { color: 0x8fd3ff, speed: 6, up: 1 });
      for (const e of this.game.enemies) if (e.alive && e.distTo(this) < 4) heroSaveDamage(this.game, this, e, { dice: '2d6', type: 'cold', ability: 'dex' });
    }
  }
  perfectDodge(enemy) {
    if ((this.pdCd || 0) > performance.now()) return;
    this.pdCd = performance.now() + 600;
    this.stamina = Math.min(STAM_MAX, this.stamina + 15);
    this.game.fx.burst('spark_04', this.pos.x, 1.4, this.pos.z, 6, { color: 0xffffff, speed: 4 });
  }

  startAttack(heavy) {
    const a = this.cls.attack;
    const spec = heavy ? { ...a, ...a.heavy } : a;
    const cost = spec.stamina || a.stamina;
    if (this.stamina <= 0 && !this.has('surge')) { audio.play('error', { vol: 0.3 }); return; }
    if (!this.has('surge')) this.spendStamina(cost);
    // aim assist
    const ranged = a.kind !== 'melee' || spec.ranged;
    const range = ranged ? (spec.range || a.range || 22) : (spec.reach || a.reach) + 2.5;
    const tgt = this.autoTarget(range, ranged ? 70 : 110, this.desiredAngle()) || (ranged ? null : null);
    if (tgt) this.facing = this.dirTo(tgt);
    else this.facing = this.desiredAngle();
    let windup = spec.windup || a.windup;
    if (this.has('surge')) windup *= 0.5;
    const anim = heavy ? spec.anim : a.combo[this.combo % a.combo.length];
    this.combo = heavy ? 0 : this.combo + 1;
    const recover = (a.recover || 0.2) * (heavy ? 1.4 : 1) * (this.has('surge') ? 0.5 : 1);
    this.atk = { t: 0, windup, recover, heavy, struck: false, spec, target: tgt, lunge: !ranged ? (tgt && this.distTo(tgt) > 2 ? 1.4 : 0.5) : 0 };
    this.state = 'attack';
    const total = windup + recover;
    if (this.cls.id === 'ranger') this.model.once(heavy ? 'Ranged_Bow_Draw' : 'Ranged_Bow_Release', { duration: total });
    else this.model.once(anim, { duration: total * 1.05 });
    if (!ranged) setTimeout(() => audio.play('swing', { vol: 0.45 }), windup * 600);
    if (heavy) this.game.fx.burst('spark_06', this.pos.x, 1.6, this.pos.z, 5, { color: 0xffe0a0, speed: 1.5, up: 1, size: 0.6 });
    this.attackCount++;
    this.counters.attacks++; if (heavy) this.counters.heavy++;
  }

  strike(atk) {
    const g = this.game, a = this.cls.attack, spec = atk.spec;
    const ranged = a.kind !== 'melee' || spec.ranged;
    const swings = this.extraAttack ? 2 : 1;
    if (!ranged) {
      const reach = spec.reach || a.reach, arc = spec.arc || a.arc;
      g.fx.slash(this.pos.x, this.pos.z, this.facing, { size: reach * (atk.heavy ? 1.85 : 1.55), color: atk.heavy ? 0xffd28a : 0xfff1d0, tex: arc >= 360 ? 'twirl_02' : 'slash_03', life: atk.heavy ? 0.26 : 0.2 });
      if (atk.heavy) g.fx.slash(this.pos.x, this.pos.z, this.facing + 0.25, { size: reach * 1.6, color: 0xff9a50, tex: 'slash_02', life: 0.22 });
      let hitAny = false;
      const targets = g.enemies.filter((e) => e.alive && !e.hidden && this.inArc(e, arc, reach));
      for (const e of targets) {
        for (let s = 0; s < swings && e.alive; s++) { const r = heroAttack(g, this, e, { heavy: atk.heavy, noDie: s > 0 }); if (r.hit) hitAny = true; }
      }
      // breakables
      for (const b of g.breakables) if (!b.broken && Math.hypot(b.x - this.pos.x, b.z - this.pos.z) < reach + 0.8) g.breakProp(b, this);
      if (hitAny) { audio.play(atk.heavy ? 'hitHeavy' : 'slice', { vol: 0.7 }); g.hitstop(atk.heavy ? 0.07 : 0.035); }
    } else {
      const proj = spec.projectile || a.projectile;
      const spread = swings > 1 ? [-0.08, 0.08] : [0];
      for (const off of spread) {
        g.spawnProjectile({
          kind: proj, owner: this, x: this.pos.x + Math.cos(this.facing) * 0.8, z: this.pos.z + Math.sin(this.facing) * 0.8,
          angle: this.facing + off, speed: spec.speed || a.speed || 26, range: spec.range || a.range || 22, heavy: atk.heavy,
          pierce: !!spec.pierce, target: atk.target,
        });
      }
      audio.play(a.kind === 'spell' || spec.projectile === 'produceflame' ? 'cast' : 'swing', { vol: 0.5 });
    }
  }

  afterHit(target, res, dealt, before, isSkill = false) {
    const g = this.game;
    this.stats.dealt += dealt;
    if (res.crit) this.stats.crits++;
    if (res.roll === 20) this.stats.nat20++;
    this.hitCount++;
    if (this.lifesteal && dealt > 0) this.heal(Math.max(1, Math.round(dealt * this.lifesteal)));
    if (this.pacts.has('dawn') && dealt > 0) { if (this.hp < this.maxHp) this.hp++; }
    if (!target.alive) return;
    if (this.flags.has('sentinel')) target.addCond('slowed', 1);
    if (this.flags.has('chill')) target.addCond('chilled', 2);
    if (this.flags.has('ignite')) target.burn = { t: 3, dice: '1d4', src: this };
    if (this.flags.has('wither')) target.addCond('withered', 3);
    if (this.pacts.has('rime') && Math.random() < 0.25) { target.addCond('frozen', 1.2); g.fx.text('FROZEN', target.pos.x, 2.6, target.pos.z, { color: '#8fd3ff' }); }
    if (this.pacts.has('fang') && res.crit) target.bleed = { t: 3, src: this };
    if (this.flags.has('crit_burst') && res.crit) {
      g.fx.burst('flame_05', target.pos.x, 1, target.pos.z, 16, { color: 0xff7a2f, speed: 6, up: 3 });
      for (const e of g.enemies) if (e.alive && e.distTo(target) < 3.5) heroSaveDamage(g, this, e, { dice: '3d6', type: 'fire' });
    }
    if (this.flags.has('witch_bolt') && !isSkill) {
      const o = g.enemies.find((e) => e.alive && e !== target && e.distTo(target) < 7);
      if (o) { g.fx.burst('spark_04', o.pos.x, 1.5, o.pos.z, 6, { color: 0x7ff0ff }); heroAutoHit(g, this, o, '1d12', 'lightning'); }
    }
    if (this.pacts.has('storm') && !isSkill && this.hitCount % 4 === 0) {
      const o = g.enemies.find((e) => e.alive && e !== target && e.distTo(target) < 8) || target;
      g.fx.burst('spark_04', o.pos.x, 1.5, o.pos.z, 10, { color: 0x7ff0ff, speed: 5 });
      heroAutoHit(g, this, o, '2d8', 'lightning');
    }
    if (this.flags.has('scorching_ray') && !isSkill && this.attackCount % 3 === 0 && !this.rayLock) {
      this.rayLock = true;
      for (let i = 0; i < 3; i++) g.spawnProjectile({ kind: 'ray', owner: this, x: this.pos.x, z: this.pos.z, target, speed: 30, auto: { dice: '2d6', type: 'fire' }, delay: i * 0.08 });
      setTimeout(() => { this.rayLock = false; }, 300);
    }
  }

  onKill(enemy) {
    const g = this.game;
    this.stats.kills++;
    if (this.flags.has('gwm')) this.stamina = Math.min(STAM_MAX, this.stamina + 15);
    if (this.cls.id === 'barbarian' && this.level >= 3 && this.has('rage')) this.cond.rage += 2;
    if (this.pacts.has('grave')) this.tempHp = Math.max(this.tempHp, 4);
    if (this.pacts.has('ember')) {
      g.fx.burst('flame_05', enemy.pos.x, 1, enemy.pos.z, 18, { color: 0xff7a2f, speed: 7, up: 3 });
      g.fx.light({ x: enemy.pos.x, z: enemy.pos.z, color: 0xff7a2f, intensity: 12, life: 0.4 });
      for (const e of g.enemies) if (e.alive && e !== enemy && e.distTo(enemy) < 4) heroSaveDamage(g, this, e, { dice: '2d6', type: 'fire' });
    }
    if (this.flags.has('thralls') && !enemy.isBoss && !enemy.thrall) g.raiseThrall(enemy, this);
  }

  useSkill(i) {
    const g = this.game, sk = this.cls.skills[i];
    if (this.cooldowns[i] > 0) { audio.play('error', { vol: 0.3 }); return; }
    if (sk.slot && this.slots <= 0) { g.fx.text('NO SLOTS', this.pos.x, 3.4, this.pos.z, { color: '#9aa0a8' }); audio.play('error', { vol: 0.3 }); return; }
    const ok = this.castSkill(sk.id);
    if (ok === false) return;
    this.counters.skills++;
    if (sk.slot) this.slots--;
    this.cooldowns[i] = sk.cd * this.cooldownMul;
    if (this.flags.has('thunderwave')) this.thunderwave();
  }

  cast(anim, total, at, fn) {
    this.interrupt();
    this.state = 'cast'; this.stateT = total; this.castAt = total - at; this.castFn = fn;
    this.model.once(anim, { duration: total });
  }

  thunderwave() {
    const g = this.game;
    g.fx.burst('circle_05', this.pos.x, 1, this.pos.z, 1, { size: 9, speed: 0, life: 0.3, color: 0xd0e0ff });
    for (const e of g.enemies) if (e.alive && e.distTo(this) < 4.5) {
      heroSaveDamage(g, this, e, { dice: '2d8', type: 'thunder', ability: 'con' });
      const a = this.dirTo(e); e.knock.x += Math.cos(a) * 14; e.knock.z += Math.sin(a) * 14;
    }
    audio.play('explode', { vol: 0.5 });
  }

  castSkill(id) {
    const g = this.game;
    const L = this.level;
    switch (id) {
      case 'second_wind': {
        this.cast('Use_Item', 0.5, 0.25, () => {
          const h = rollDice('1d10') + L;
          this.heal(h); this.addCond('surge', 3); g.fx.text('ACTION SURGE', this.pos.x, 3.8, this.pos.z, { color: '#d8b46a' });
          g.fx.burst('star_07', this.pos.x, 1.2, this.pos.z, 14, { color: 0xffe0a0, speed: 3, up: 3 });
          audio.play('potion', { vol: 0.6 });
        });
        return true;
      }
      case 'shield_rush': {
        const t = this.autoTarget(10, 90, this.desiredAngle()); if (t) this.facing = this.dirTo(t); else this.facing = this.desiredAngle();
        this.state = 'dodge'; this.dodgeDir = this.facing; this.dodgeDur = 0.32; this.stateT = 0.32; this.dodgeSpeed = 22; this.iframes = 0.2;
        this.model.once('Melee_Block_Attack', { duration: 0.4 });
        const hitSet = new Set();
        const tick = () => {
          for (const e of g.enemies) if (e.alive && !hitSet.has(e) && e.distTo(this) < 2.2) {
            hitSet.add(e);
            const r = heroAttack(g, this, e, {});
            if (r.hit) {
              const save = d20().roll + (e.saves?.str || 0);
              if (save < this.spellDC && !e.isBoss) { e.addCond('prone', 1.5); g.fx.text('PRONE', e.pos.x, 2.6, e.pos.z, { color: '#ffb347' }); }
              const a = this.dirTo(e); e.knock.x += Math.cos(a) * 12; e.knock.z += Math.sin(a) * 12;
              audio.play('hitHeavy', { vol: 0.8 }); g.shake(0.3);
            }
          }
          if (this.state === 'dodge') requestAnimationFrame(tick);
        };
        tick();
        return true;
      }
      case 'rage': {
        this.addCond('rage', 9);
        this.model.once('Melee_Unarmed_Attack_Punch_A', { duration: 0.4 });
        g.fx.burst('flame_03', this.pos.x, 1.5, this.pos.z, 20, { color: 0xff3a1a, speed: 4, up: 4 });
        g.fx.text('RAGE!', this.pos.x, 3.6, this.pos.z, { color: '#ff3a1a', big: true });
        audio.play('hitHeavy', { vol: 0.8 }); g.shake(0.3);
        return true;
      }
      case 'whirlwind': {
        this.addCond('whirl', 0.6); this.addCond('reckless', 2);
        this.interrupt(); this.state = 'attack';
        this.atk = { t: 0, windup: 0.18, recover: 0.35, heavy: false, struck: false, spec: { ...this.cls.attack, arc: 360, reach: 3.6 }, lunge: 0 };
        this.model.once('Melee_2H_Attack_Spinning', { duration: 0.55 });
        return true;
      }
      case 'shadow_step': {
        const t = this.autoTarget(14, 360, this.desiredAngle()) || this.nearestEnemy(14);
        if (!t) { audio.play('error', { vol: 0.3 }); return false; }
        g.fx.burst('smoke_07', this.pos.x, 1.2, this.pos.z, 10, { color: 0x302838, speed: 2, additive: false });
        const behind = t.facing + Math.PI;
        let tx = t.pos.x + Math.cos(behind) * 1.8, tz = t.pos.z + Math.sin(behind) * 1.8;
        if (this.blocked(tx, tz)) { tx = t.pos.x - Math.cos(this.dirTo(t)) * 1.8; tz = t.pos.z - Math.sin(this.dirTo(t)) * 1.8; }
        if (!this.blocked(tx, tz)) { this.pos.x = tx; this.pos.z = tz; }
        this.facing = this.visualFacing = this.dirTo(t);
        this.addCond('shadowAdv', 1.5); this.iframes = 0.25;
        g.fx.burst('smoke_07', this.pos.x, 1.2, this.pos.z, 10, { color: 0x302838, speed: 2, additive: false });
        audio.play('dodge', { vol: 0.6 });
        return true;
      }
      case 'fan_knives': {
        this.cast('Throw', 0.35, 0.12, () => {
          const base = this.autoTarget(16, 120, this.desiredAngle()); const a0 = base ? this.dirTo(base) : this.desiredAngle(); this.facing = a0;
          for (let k = -2; k <= 2; k++) g.spawnProjectile({ kind: 'knife', owner: this, x: this.pos.x, z: this.pos.z, angle: a0 + k * 0.16, speed: 28, range: 16, skill: true });
          audio.play('swing', { vol: 0.6 });
        });
        return true;
      }
      case 'hunters_mark': {
        const t = this.autoTarget(24, 120, this.desiredAngle()) || this.nearestEnemy(24);
        if (!t) { audio.play('error', { vol: 0.3 }); return false; }
        for (const e of g.enemies) if (e.marked && e.marked.owner === this) e.marked = null;
        t.marked = { owner: this, time: 14 };
        g.fx.text('MARKED', t.pos.x, (t.height || 2) + 1, t.pos.z, { color: '#9db35c', big: true });
        this.cast('Ranged_Bow_Aiming_Idle', 0.3, 0.1, () => {});
        return true;
      }
      case 'volley': {
        const t = this.autoTarget(24, 120, this.desiredAngle()) || this.nearestEnemy(24);
        const tx = t ? t.pos.x : this.pos.x + Math.cos(this.facing) * 10, tz = t ? t.pos.z : this.pos.z + Math.sin(this.facing) * 10;
        this.facing = Math.atan2(tz - this.pos.z, tx - this.pos.x);
        const tele = g.fx.telegraph('circle', { x: tx, z: tz, radius: 4, time: 0.7, color: 0x9db35c });
        this.cast('Ranged_Bow_Release_Up', 0.45, 0.2, () => {
          setTimeout(() => {
            g.fx.burst('trace_04', tx, 4, tz, 18, { color: 0xe8e0c0, speed: 3, up: -14, life: 0.3, spread: 6, additive: false });
            for (const e of g.enemies) if (e.alive && Math.hypot(e.pos.x - tx, e.pos.z - tz) < 4) heroSaveDamage(g, this, e, { dice: '3d8', type: 'piercing', ability: 'dex' });
            audio.play('slice', { vol: 0.7 }); g.shake(0.15);
          }, 450);
        });
        return true;
      }
      case 'magic_missile': {
        const n = 3 + Math.floor((L - 1) / 2) + (L >= 9 ? 2 : 0);
        this.cast('Ranged_Magic_Spellcasting', 0.35, 0.15, () => {
          const targets = g.enemies.filter((e) => e.alive && !e.hidden && e.distTo(this) < 26);
          if (!targets.length) return;
          targets.sort((a, b) => a.distTo(this) - b.distTo(this));
          for (let k = 0; k < n; k++) g.spawnProjectile({ kind: 'missile', owner: this, x: this.pos.x, z: this.pos.z, target: targets[k % Math.min(targets.length, 3)], auto: { dice: '1d4+1', type: 'force' }, speed: 20, delay: k * 0.06, skill: true, spell: true, angle: this.facing + (k - n / 2) * 0.35 });
          audio.play('cast', { vol: 0.6 });
        });
        return true;
      }
      case 'burning_hands': {
        if (L >= 5) {
          // Fireball
          const t = this.autoTarget(26, 120, this.desiredAngle()) || this.nearestEnemy(26);
          const tx = t ? t.pos.x : this.pos.x + Math.cos(this.facing) * 12, tz = t ? t.pos.z : this.pos.z + Math.sin(this.facing) * 12;
          this.facing = Math.atan2(tz - this.pos.z, tx - this.pos.x);
          this.cast('Ranged_Magic_Spellcasting_Long', 0.55, 0.25, () => {
            g.spawnProjectile({ kind: 'fireball', owner: this, x: this.pos.x, z: this.pos.z, tx, tz, speed: 22, skill: true, spell: true });
          });
        } else {
          this.facing = this.desiredAngle();
          const t = this.autoTarget(8, 120, this.facing); if (t) this.facing = this.dirTo(t);
          this.cast('Ranged_Magic_Shoot', 0.4, 0.15, () => {
            for (let k = 0; k < 16; k++) { const a = this.facing + (Math.random() - 0.5) * 1.1; g.fx.spawn('flame_05', { x: this.pos.x + Math.cos(this.facing), y: 1.3, z: this.pos.z + Math.sin(this.facing), vx: Math.cos(a) * 14, vz: Math.sin(a) * 14, life: 0.4, size: 1.6, grow: 1.5, color: 0xff8a3a }); }
            g.fx.light({ x: this.pos.x, z: this.pos.z, color: 0xff7a2f, intensity: 10, life: 0.35 });
            for (const e of g.enemies) if (e.alive && this.inArc(e, 90, 6.5)) heroSaveDamage(g, this, e, { dice: '3d6', type: 'fire', ability: 'dex' });
            audio.play('cast', { vol: 0.7 });
          });
        }
        return true;
      }
      case 'healing_word': {
        this.cast('Ranged_Magic_Raise', 0.35, 0.12, () => {
          const extra = L >= 5 ? this.mods.wis : 0;
          for (const h of g.heroes) {
            if (h.dead || h.distTo(this) > 12) continue;
            const amt = rollDice(`${1 + Math.floor((L - 1) / 2)}d4`) + this.mods.wis + extra;
            h.heal(amt);
            if (L >= 9) h.tempHp = Math.max(h.tempHp, 8);
            g.fx.burst('star_07', h.pos.x, 1.4, h.pos.z, 10, { color: 0x7dffb0, speed: 2.5, up: 3 });
          }
          audio.play('potion', { vol: 0.6 });
        });
        return true;
      }
      case 'moonbeam': {
        const t = this.autoTarget(22, 140, this.desiredAngle()) || this.nearestEnemy(22);
        const tx = t ? t.pos.x : this.pos.x + Math.cos(this.facing) * 6, tz = t ? t.pos.z : this.pos.z + Math.sin(this.facing) * 6;
        this.cast('Ranged_Magic_Summon', 0.4, 0.2, () => g.spawnZone({ kind: 'moonbeam', owner: this, x: tx, z: tz, follow: L >= 3, radius: 2.6, life: 8 }));
        return true;
      }
    }
    return false;
  }

  drinkPotion() {
    if (this.potions <= 0) { this.game.fx.text('NO POTIONS', this.pos.x, 3.4, this.pos.z, { color: '#9aa0a8' }); audio.play('error', { vol: 0.3 }); return; }
    this.potions--;
    this.counters.potions++;
    const fast = this.cls.id === 'rogue' && this.level >= 3;
    this.state = 'potion'; this.stateT = fast ? 0.15 : 0.7; this.potionAt = fast ? 0.1 : 0.35; this.potionDone = false;
    if (!fast) this.model.once('Use_Item', { duration: 0.7 });
    if (this.flags.has('thunderwave')) this.thunderwave();
  }
  applyPotion() {
    const g = this.game;
    let amt = rollDice('2d4+2') + 2 * (this.level - 1);
    if (this.flags.has('periapt')) amt *= 2;
    if (g.vows.has('scarcity')) amt = Math.ceil(amt / 2);
    this.heal(amt);
    audio.play('potion', { vol: 0.7 });
    g.fx.burst('star_07', this.pos.x, 1.2, this.pos.z, 10, { color: 0xff6a6a, speed: 2, up: 3 });
    if (this.flags.has('healer')) for (const h of g.heroes) if (h !== this && h.canAct && h.distTo(this) < 6) h.heal(Math.ceil(amt / 2));
  }
}
