// Monsters: telegraphed souls-like attacks resolved with 5e rolls.
import * as THREE from 'three';
import { Actor } from './actor.js';
import { ANIMSETS, AFFIXES } from '../data/enemies.js';
import { enemyAttack, heroSave, applyDamage } from './combat.js';
import { rollDice, rng, frand, CR_XP } from '../core/rules.js';
import { audio } from '../core/audio.js';

export class Enemy extends Actor {
  constructor(game, def, { elite = false, affixes = [], scale = 1, thrall = false } = {}) {
    super(game);
    this.def = def; this.name = def.name; this.isEnemy = true;
    this.anims = { ...ANIMSETS[def.anim], ...(def.animOverride || {}) };
    const party = game.heroes.length;
    const hpScale = (1 + 0.38 * (party - 1)) * (1 + game.depthIndex * 0.12) * (elite ? 2.2 : 1) * scale;
    this.maxHp = Math.max(3, Math.round(def.hp * hpScale)); this.hp = this.maxHp;
    this.baseAC = def.ac + (game.vows.has('iron') ? 2 : 0) + (elite ? 1 : 0);
    this.atk = def.atk + Math.floor(game.depthIndex / 1) + (elite ? 1 : 0);
    this.saves = { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0, ...(def.saves || {}) };
    this.resist = def.resist || []; this.vuln = def.vuln || []; this.immune = def.immune || []; this.tags = def.tags || [];
    this.speed = def.speed * (game.vows.has('haste') ? 1.2 : 1);
    this.cdMul = game.vows.has('haste') ? 0.8 : 1;
    this.elite = elite; this.affixes = affixes;
    this.height = def.height * (elite ? 1.2 : 1);
    this.radius = Math.max(0.6, this.height * 0.28);
    this.flying = !!(def.flying || def.anim === 'flying');
    this.hover = def.hover || 0;
    this.state = 'spawn'; this.stateT = 1.0;
    this.cd = frand(0.6, 1.6);
    this.poise = 0; this.poiseMax = def.poise * (elite ? 1.6 : 1);
    this.poiseRegenT = 0;
    this.target = null; this.retarget = 0;
    this.xp = Math.round((CR_XP[def.cr] || 50) * (elite ? 2.5 : 1));
    this.thrall = thrall;
    this.ward = affixes.includes('warded') ? Math.round(this.maxHp * 0.3) : 0;
    if (this.affixes.includes('warded')) this.baseAC += 3;
    if (this.affixes.includes('swift')) { this.speed *= 1.4; this.cdMul *= 0.7; }
    this.sneakCd = 0;
  }
  get ac() { return this.baseAC - (this.has('withered') ? 2 : 0); }
  effectiveAC(attacker) {
    let ac = this.ac;
    if (this.def.shieldFront && attacker && Math.abs(this.angleDiff(this.dirTo(attacker), this.facing)) < 0.9) ac += this.def.shieldFront;
    return ac;
  }

  async spawnModel(lib) {
    const d = this.def;
    const isProp = d.anim === 'prop';
    if (isProp) {
      const g = this.game.kit.clone('chest_mimic');
      const root = new THREE.Group(); root.add(g); g.scale.setScalar(1.25);
      this.model = { root, update() {}, loop() {}, once() { return 0; }, stopOneShot() {}, hitFlash() {}, setGlow() {}, setOpacity() {}, has: () => false, mats: [] };
      this.lid = g;
    } else {
      const gearFolder = d.model.startsWith('skeletons') ? 'skeletons' : 'gear';
      this.model = await lib.instance({ path: d.model, rig: this.anims.rig || null, height: this.height, gear: d.gear, gearFolder, tint: d.tint });
      if (d.translucent) this.model.setOpacity(d.translucent);
      this.model.loop(this.anims.idle);
    }
    if (this.elite) this.model.setGlow(AFFIXES[this.affixes[0]]?.color || '#ff3a1a', 0.35);
    if (this.thrall) { this.model.setGlow('#7a4cff', 0.6); this.model.setOpacity(0.7); }
    this.game.scene.add(this.model.root);
    this.shadow = this.game.fx.blobShadow(this.radius * 2.6);
    this.game.scene.add(this.shadow);
    this.syncModel(0);
    if (this.state === 'spawn' && !isProp) {
      if (this.anims.spawn && this.model.has(this.anims.spawn)) this.model.once(this.anims.spawn, { duration: 1.0 });
      this.game.fx.burst('smoke_07', this.pos.x, 0.5, this.pos.z, 8, { color: 0x403a48, speed: 2, up: 1.5, additive: false, size: 1.4 });
    }
  }

  remove() {
    if (this.model) this.game.scene.remove(this.model.root);
    if (this.shadow) this.game.scene.remove(this.shadow);
    if (this.tele) this.game.fx.removeDecal(this.tele);
  }

  heal(n) { this.hp = Math.min(this.maxHp, this.hp + n); this.game.fx.text('+' + n, this.pos.x, this.height + 0.5, this.pos.z, { color: '#7dff8a', size: 0.8 }); }

  takeDamage(amount, source, { crit = false, poise = 1, knock = 0, angle = null, heavy = false } = {}) {
    if (!this.alive) return;
    if (this.ward > 0) { const ab = Math.min(this.ward, amount); this.ward -= ab; amount -= ab; if (this.ward <= 0) this.game.fx.text('WARD BROKEN', this.pos.x, this.height + 1, this.pos.z, { color: '#7fc8ff' }); }
    this.hp -= amount;
    if (this.state === 'disguised') this.reveal();
    this.model.hitFlash(crit ? 0xffd23f : 0xffffff);
    this.game.fx.blood(this.pos.x, this.pos.z, this.tags.includes('undead') ? 0xd8d0c0 : this.tags.includes('ooze') || this.tags.includes('plant') ? 0x88c040 : 0x8a1020, crit ? 14 : 6);
    if (this.tags.includes('undead')) audio.play('bone', { vol: 0.35 });
    if (source && source.isHero && this.affixes.includes('thorned') && source.distTo(this) < 4) applyDamage(this.game, this, source, [{ amount: rollDice('1d6'), type: 'piercing' }]);
    if (angle !== null && knock && !this.isBoss) { const k = knock * (this.elite ? 0.5 : 1); this.knock.x += Math.cos(angle) * k; this.knock.z += Math.sin(angle) * k; }
    if (source && source.isHero) { this.target = source; this.retarget = 2; this.lastHitBy = source; }
    // poise / stagger
    this.poise += poise; this.poiseRegenT = 3;
    if (this.poise >= this.poiseMax && this.state !== 'stagger' && this.hp > 0) {
      this.poise = 0;
      this.stagger(this.isBoss ? 2.2 : 1.3);
    }
    if (this.hp <= 0) this.die(source);
  }

  stagger(t) {
    this.cancelAttack();
    this.state = 'stagger'; this.stateT = t; this.addCond('stagger', t);
    this.model.once(this.anims.hit, { duration: Math.min(t, 0.6) });
    this.game.fx.text('STAGGERED', this.pos.x, this.height + 1.2, this.pos.z, { color: '#ffb347', big: true });
    audio.play('hitHeavy', { vol: 0.6 });
  }

  cancelAttack() { if (this.tele) { this.game.fx.removeDecal(this.tele); this.tele = null; } this.pending = null; }

  die(source) {
    if (!this.alive) return;
    this.alive = false; this.hp = 0;
    this.cancelAttack();
    this.state = 'dead'; this.stateT = 2.2;
    if (this.model.has && this.model.has(this.anims.death)) this.model.once(this.anims.death, { hold: true, duration: 1.0 });
    this.game.onEnemyDeath(this, source);
    audio.play(this.tags.includes('undead') ? 'bone' : 'hitHeavy', { vol: 0.6 });
    if (this.def.split && !this.thrall) for (let i = 0; i < 2; i++) this.game.spawnEnemy(this.def.split, this.pos.x + frand(-1, 1), this.pos.z + frand(-1, 1), { noSpawnAnim: true });
    if (this.affixes.includes('splitting')) for (let i = 0; i < 2; i++) this.game.spawnEnemy(this.game.depth.common[0], this.pos.x + frand(-1.5, 1.5), this.pos.z + frand(-1.5, 1.5));
    if (this.def.spores) this.game.spawnZone({ kind: 'spores', owner: this, x: this.pos.x, z: this.pos.z, radius: 2.6, life: 4 });
  }

  reveal() {
    if (this.state !== 'disguised') return;
    this.state = 'chase'; this.hidden = false;
    this.game.fx.text('MIMIC!', this.pos.x, 2.6, this.pos.z, { color: '#ff3a1a', big: true });
    audio.play('chest', { vol: 0.8 }); this.game.shake(0.3);
  }

  // choose a hero to chase
  pickTarget() {
    const heroes = this.game.heroes.filter((h) => h.canAct);
    if (this.thrall) {
      let best = null, bd = 1e9;
      for (const e of this.game.enemies) if (e.alive && !e.thrall && !e.hidden) { const d = this.distTo(e); if (d < bd) { bd = d; best = e; } }
      return best;
    }
    if (!heroes.length) return null;
    let best = null, bd = 1e9;
    for (const h of heroes) {
      let d = this.distTo(h);
      if (h === this.target) d -= 3; // stickiness
      if (d < bd) { bd = d; best = h; }
    }
    return best;
  }

  update(dt) {
    const g = this.game;
    this.tickConds(dt);
    this.sneakCd -= dt; this.colossusCd = (this.colossusCd || 0) - dt; this.preyCd = (this.preyCd || 0) - dt;
    if (this.marked) { this.marked.time -= dt; if (this.marked.time <= 0) this.marked = null; }
    this.model.update(dt * (this.has('frozen') ? 0 : this.has('chilled') ? 0.6 : 1));
    if (this.state === 'dead') {
      this.stateT -= dt;
      if (this.stateT < 0.8) this.model.root.position.y -= dt * 1.5;
      if (this.stateT <= 0) { this.remove(); this.gone = true; }
      return;
    }
    // damage over time
    if (this.burn) { this.burn.t -= dt; this.burnTick = (this.burnTick || 1) - dt; if (this.burnTick <= 0) { this.burnTick = 1; applyDamage(g, this.burn.src, this, [{ amount: rollDice(this.burn.dice), type: 'fire' }]); g.fx.burst('flame_03', this.pos.x, 1.2, this.pos.z, 3, { color: 0xff7a2f, speed: 1, up: 2 }); } if (this.burn && this.burn.t <= 0) this.burn = null; }
    if (this.bleed) { this.bleed.t -= dt; this.bleedTick = (this.bleedTick || 1) - dt; if (this.bleedTick <= 0) { this.bleedTick = 1; applyDamage(g, this.bleed.src, this, [{ amount: rollDice('1d6'), type: 'slashing' }]); } if (this.bleed && this.bleed.t <= 0) this.bleed = null; }
    if (!this.alive) return;
    if (this.thrall) { this.thrallT -= dt; if (this.thrallT <= 0) { this.die(null); return; } }
    if (this.poiseRegenT > 0) this.poiseRegenT -= dt; else this.poise = Math.max(0, this.poise - this.poiseMax * 0.3 * dt);
    if (this.affixes.includes('ember')) { this.emberT = (this.emberT || 0) - dt; if (this.emberT <= 0) { this.emberT = 1.2; g.spawnZone({ kind: 'fire', owner: this, x: this.pos.x, z: this.pos.z, radius: 1.4, life: 4 }); } }

    const frozen = this.has('frozen') || this.has('prone');
    let speedMul = (this.has('slowed') ? 0.25 : 1) * (this.has('chilled') ? 0.6 : 1) * (frozen ? 0 : 1);

    this.retarget -= dt;
    if (!this.target || !this.target.alive || (this.target.isHero && !this.target.canAct) || this.retarget <= 0) { this.target = this.pickTarget(); this.retarget = 1.5; }
    const t = this.target;

    this.stateT -= dt; this.cd -= dt * (frozen ? 0 : 1);
    switch (this.state) {
      case 'spawn': if (this.stateT <= 0) this.state = 'chase'; break;
      case 'disguised': {
        const near = g.heroes.find((h) => h.canAct && h.distTo(this) < 3.2);
        if (near) this.reveal();
        this.syncModel(dt);
        return;
      }
      case 'stagger': if (this.stateT <= 0) this.state = 'chase'; speedMul = 0; break;
      case 'windup': {
        speedMul = 0;
        if (t && this.stateT > this.pending.lockAt) this.turnTowards(this.dirTo(t), 5, dt);
        if (this.pending.lunge && this.stateT <= this.pending.lungeAt) {
          this.move(Math.cos(this.facing) * this.pending.lunge * dt, Math.sin(this.facing) * this.pending.lunge * dt);
          if (this.pending.contact) for (const h of g.heroes) if (h.canAct && h.distTo(this) < this.radius + h.radius + 0.4 && !this.pending.hit.has(h)) { this.pending.hit.add(h); enemyAttack(g, this, h); }
        }
        if (this.stateT <= 0) { this.release(); this.state = 'recover'; this.stateT = this.pending ? this.pending.recover : 0.5; this.pending = null; }
        break;
      }
      case 'recover': speedMul *= 0.2; if (this.stateT <= 0) this.state = 'chase'; break;
      case 'chase': this.think(dt, t, speedMul); break;
    }
    if (this.state !== 'chase' && this.state !== 'recover') { /* standing */ }
    this.applyKnock(dt);
    this.separate(g.enemies, 5, dt);
    for (const h of g.heroes) if (h.canAct && !this.flying) {
      const dx = this.pos.x - h.pos.x, dz = this.pos.z - h.pos.z, min = this.radius + h.radius, d = Math.hypot(dx, dz);
      if (d < min && d > 0.01) this.move(dx / d * (min - d) * 0.6, dz / d * (min - d) * 0.6);
    }
    if (this.hover) this.model.root.position.y = this.hover + Math.sin(g.time * 3 + this.pos.x) * 0.25;
    this.syncModel(dt);
    if (this.hover) this.model.root.position.y = this.hover + Math.sin(g.time * 3 + this.pos.x) * 0.25;
  }

  // movement + attack decisions while chasing
  think(dt, t, speedMul) {
    const g = this.game, d = this.def;
    if (!t) { this.model.loop(this.anims.idle); return; }
    const dist = this.distTo(t);
    const ai = this.thrall ? 'brute' : d.ai;
    const ranged = ai === 'caster' || ai === 'archer';
    let want = 0; // 1 approach, -1 retreat, 0 hold
    if (ranged) {
      const los = g.room.lineOfSight(this.pos.x, this.pos.z, t.pos.x, t.pos.z);
      if (dist > d.range * 0.85 || !los) want = 1; else if (dist < d.range * 0.4) want = -1;
      if (los && dist < d.range && this.cd <= 0) { this.startAttack(t); return; }
      if (d.blink && dist < 4 && this.cd < 1 && rng.chance(dt * 1.5)) { this.blinkAway(t); return; }
    } else {
      want = dist > (d.reach || 2) * 0.85 + t.radius ? 1 : 0;
      if (dist < (d.reach || 2) + t.radius + 0.2 && this.cd <= 0) { this.startAttack(t); return; }
      if (ai === 'skirmisher' && dist < 8 && dist > 3.5 && this.cd <= 0) { this.startAttack(t, true); return; }
      if (ai === 'summoner' && this.cd <= 0 && rng.chance(0.4) && g.enemies.filter((e) => e.alive).length < 10) { this.summon(); return; }
      if (d.breath && dist < 7 && this.cd <= 0 && rng.chance(0.5)) { this.startBreath(t); return; }
      if ((d.roar || d.warcry) && this.cd <= 0 && !this.roared && dist < 9) { this.doRoar(); return; }
    }
    let dir = null;
    if (want !== 0) {
      if (this.flying || g.room.lineOfSight(this.pos.x, this.pos.z, t.pos.x, t.pos.z)) {
        const a = this.dirTo(t); dir = { x: Math.cos(a) * want, z: Math.sin(a) * want };
      } else dir = g.room.flowDir(this.pos.x, this.pos.z);
      if (want < 0 && dir && this.blocked(this.pos.x + dir.x, this.pos.z + dir.z)) dir = { x: -dir.z, z: dir.x };
    }
    // circle-strafe a bit when waiting for cooldown
    if (!dir && !ranged && this.cd > 0 && dist < 5) { const a = this.dirTo(t) + Math.PI / 2 * (this.pos.x > 0 ? 1 : -1); dir = { x: Math.cos(a) * 0.35, z: Math.sin(a) * 0.35 }; }
    const hop = ai === 'blob' ? Math.max(0, Math.sin(g.time * 6 + this.pos.z)) : 1;
    if (dir) {
      const sp = this.speed * speedMul * hop;
      this.move(dir.x * sp * dt, dir.z * sp * dt);
      this.turnTowards(Math.atan2(dir.z, dir.x) + (want < 0 ? Math.PI : 0), 8, dt);
      this.model.loop(this.speed * speedMul > 3.8 && this.anims.run ? this.anims.run : this.anims.walk, { speed: Math.max(0.5, speedMul) });
    } else {
      this.turnTowards(this.dirTo(t), 6, dt);
      this.model.loop(this.anims.idle);
    }
  }

  startAttack(t, lunge = false) {
    const d = this.def, g = this.game;
    const windup = (d.windup || 0.7) * (this.affixes.includes('swift') ? 0.8 : 1);
    this.state = 'windup'; this.stateT = windup;
    this.facing = this.dirTo(t);
    this.pending = { kind: d.ai === 'caster' || d.ai === 'archer' ? 'ranged' : 'melee', target: t, lockAt: windup * 0.35, recover: 0.45, hit: new Set() };
    if (lunge) { this.pending.lunge = d.lunge || 7; this.pending.lungeAt = windup * 0.45; this.pending.contact = true; this.pending.kind = 'lunge'; }
    const animName = this.pending.kind === 'ranged' ? (this.anims.cast && this.model.has(this.anims.cast) ? this.anims.cast : this.anims.shoot || this.anims.attack) : (rng.chance(0.5) && this.anims.attack2 ? this.anims.attack2 : this.anims.attack);
    this.model.once(animName, { duration: windup + 0.3 });
    // telegraph
    if (this.pending.kind === 'melee') {
      const big = this.height > 2.6 || this.elite;
      if (big) this.tele = g.fx.telegraph('cone', { x: this.pos.x, z: this.pos.z, radius: (d.reach || 2.4) + 1.2, angle: this.facing, arc: Math.PI * 0.75, time: windup });
      else this.model.setGlow && this.flashWarn(windup);
    } else if (this.pending.kind === 'lunge') {
      this.tele = g.fx.telegraph('line', { x: this.pos.x, z: this.pos.z, angle: this.facing, length: this.pending.lunge * 0.55, width: 1.4, time: windup });
    } else {
      g.fx.burst('magic_04', this.pos.x, this.height * 0.8, this.pos.z, 4, { color: d.type === 'fire' ? 0xff7a2f : 0xb07cff, speed: 0.8, up: 0.5, size: 0.8 });
    }
    this.cd = (d.cd || 1.6) * this.cdMul * frand(0.85, 1.25);
  }

  flashWarn(t) {
    // small enemies flash red right before striking (readable without a decal)
    setTimeout(() => { if (this.alive && this.state === 'windup') this.model.hitFlash(0xff2010); }, Math.max(0, (t - 0.18) * 1000));
  }

  release() {
    const g = this.game, p = this.pending, d = this.def;
    if (!p) return;
    if (this.tele) { g.fx.removeDecal(this.tele); this.tele = null; }
    if (p.kind === 'melee') {
      const reach = (d.reach || 2.2) + 0.3, arc = this.height > 2.6 || this.elite ? 140 : 100;
      const victims = this.thrall ? g.enemies.filter((e) => e.alive && !e.thrall && this.inArc(e, arc, reach)) : g.heroes.filter((h) => h.canAct && this.inArc(h, arc, reach));
      if (this.thrall) { for (const e of victims) applyDamage(g, this, e, [{ amount: rollDice(d.dmg), type: d.type }]); }
      else for (const h of victims) enemyAttack(g, this, h);
      g.fx.slash(this.pos.x, this.pos.z, this.facing, { size: reach * 1.4, color: 0xff9a7a, tex: 'slash_02' });
      audio.play('swing', { vol: 0.4 });
      if (this.height > 2.6) g.shake(0.12);
    } else if (p.kind === 'ranged' && p.target) {
      const t = p.target;
      // lead the target a little
      const lead = 0.25;
      const tx = t.pos.x + (t.vel ? t.vel.x * lead : 0), tz = t.pos.z + (t.vel ? t.vel.z * lead : 0);
      const a = Math.atan2(tz - this.pos.z, tx - this.pos.x);
      g.spawnProjectile({ kind: d.projectile || 'necrobolt', owner: this, x: this.pos.x + Math.cos(a), z: this.pos.z + Math.sin(a), y: this.height * 0.6 + this.hover, angle: a, speed: d.projectile === 'bolt' ? 24 : 15, range: (d.range || 14) + 4, enemy: true });
      if (d.hex && rng.chance(0.35)) { t.addCond('hexed', 3); g.fx.text('HEXED', t.pos.x, 3.2, t.pos.z, { color: '#ff9ad8' }); }
    }
  }

  onHitHero(h) {
    const g = this.game, d = this.def;
    if (d.poison) heroSave(g, h, { ability: 'con', dc: 11, label: '(poison)', onFail: (x) => { x.addCond('poisoned', 4); g.fx.text('POISONED', x.pos.x, 3.4, x.pos.z, { color: '#9be36a' }); } });
    if (d.chill) h.addCond('slowed', 1.5);
  }

  blinkAway(t) {
    const g = this.game;
    for (let k = 0; k < 10; k++) {
      const a = frand(0, Math.PI * 2), r = frand(6, 10);
      const x = t.pos.x + Math.cos(a) * r, z = t.pos.z + Math.sin(a) * r;
      if (!this.blocked(x, z)) {
        g.fx.burst('smoke_03', this.pos.x, 1, this.pos.z, 8, { color: 0xb07cff, speed: 2 });
        this.pos.x = x; this.pos.z = z;
        g.fx.burst('smoke_03', x, 1, z, 8, { color: 0xb07cff, speed: 2 });
        this.cd = Math.max(this.cd, 0.6);
        return;
      }
    }
  }

  summon() {
    const g = this.game;
    this.state = 'recover'; this.stateT = 0.8; this.cd = 5;
    this.model.once(this.anims.taunt || this.anims.cast, { duration: 0.8 });
    for (let i = 0; i < 2; i++) g.spawnEnemy(this.def.summon || 'skel_minion', this.pos.x + frand(-3, 3), this.pos.z + frand(-3, 3));
  }

  startBreath(t) {
    const g = this.game, b = this.def.breath;
    this.state = 'windup'; this.stateT = 0.9; this.facing = this.dirTo(t);
    this.pending = { kind: 'breath', lockAt: 0.5, recover: 0.6, hit: new Set() };
    this.tele = g.fx.telegraph('cone', { x: this.pos.x, z: this.pos.z, radius: 7, angle: this.facing, arc: Math.PI / 3, time: 0.9, color: 0xff6a1a });
    const self = this;
    const orig = this.release.bind(this);
    this.release = function () {
      this.release = orig;
      if (self.tele) { g.fx.removeDecal(self.tele); self.tele = null; }
      for (let k = 0; k < 20; k++) { const a = self.facing + frand(-0.5, 0.5); g.fx.spawn('flame_05', { x: self.pos.x, y: 1.4, z: self.pos.z, vx: Math.cos(a) * 16, vz: Math.sin(a) * 16, life: 0.45, size: 1.5, grow: 2, color: 0xff7a2f }); }
      g.fx.light({ x: self.pos.x, z: self.pos.z, color: 0xff7a2f, intensity: 10, life: 0.4 });
      for (const h of g.heroes) if (h.canAct && self.inArc(h, 60, 7)) heroSave(g, h, { ability: 'dex', dc: b.dc, dice: b.dice, type: b.type, source: self, label: '(breath)' });
      audio.play('explode', { vol: 0.5 });
    };
    this.cd = 4;
  }

  doRoar() {
    const g = this.game;
    this.roared = true; this.cd = 2;
    this.state = 'recover'; this.stateT = 0.9;
    this.model.once(this.anims.taunt || this.anims.attack, { duration: 0.9 });
    g.fx.burst('circle_05', this.pos.x, 2, this.pos.z, 1, { size: 12, speed: 0, life: 0.4, color: 0xffffff });
    g.shake(0.4);
    if (this.def.roar) for (const h of g.heroes) if (h.canAct && h.distTo(this) < 10) heroSave(g, h, { ability: 'wis', dc: 13, label: '(fear)', onFail: (x) => { x.addCond('frightened', 3); g.fx.text('FRIGHTENED', x.pos.x, 3.4, x.pos.z, { color: '#c8a0ff' }); } });
    if (this.def.warcry) for (const e of g.enemies) if (e.alive && e.distTo(this) < 10) e.addCond('warcry', 8);
  }
}
