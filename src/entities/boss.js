// Bosses: multi-phase pattern fights with readable telegraphs.
import { Enemy } from './enemy.js';
import { enemyAttack, heroSave } from './combat.js';
import { rng, frand } from '../core/rules.js';
import { audio } from '../core/audio.js';

export class Boss extends Enemy {
  constructor(game, def, key) {
    super(game, def, {});
    this.isBoss = true; this.key = key;
    this.radius = key === 'golem' ? 2.2 : key === 'wyrm' ? 2.8 : 1.2;
    this.phase = 1; this.queue = []; this.moveCd = 2.0; this.lastMove = null;
    this.cdMul = (game.vows.has('haste') ? 0.8 : 1) * 0.88;
    // bosses scale harder with the party than regular foes (they are the
    // whole party's focus), and their poise grows with their health so a
    // strong party cannot keep them stun-locked
    const party = game.heroes.length;
    const scale = (1 + 0.6 * (party - 1)) * (1 + game.depthIndex * 0.12);
    this.maxHp = this.hp = Math.round(def.hp * scale);
    this.poiseMax = Math.round(def.poise * scale * 1.6);
    this.poiseLock = 0;
  }

  schedule(t, fn) { this.queue.push({ t, fn }); }

  update(dt) {
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const q = this.queue[i]; q.t -= dt;
      if (q.t <= 0) { this.queue.splice(i, 1); if (this.alive) q.fn(); }
    }
    if (this.poiseLock > 0) { this.poiseLock -= dt; this.poise = 0; }
    if (this.alive && this.phase === 1 && this.hp < this.maxHp * 0.5) this.enterPhase2();
    if (this.alive && this.phase === 2 && this.hp < this.maxHp * 0.2) this.enterPhase3();
    if (this.airborne) {
      this.airT -= dt;
      this.hover += (6 - this.hover) * Math.min(1, dt * 3);
    } else if (this.key === 'wyrm') this.hover += (this.def.hover - this.hover) * Math.min(1, dt * 4);
    super.update(dt);
  }

  get invulnerable() { return !!this.airborne; }
  takeDamage(a, s, o) { if (this.airborne) return; super.takeDamage(a, s, o); }

  enterPhase2() {
    const g = this.game;
    this.phase = 2;
    this.cancelAttack(); this.queue.length = 0;
    this.state = 'recover'; this.stateT = 1.4;
    this.model.once(this.anims.taunt || this.anims.cast || this.anims.attack, { duration: 1.4 });
    g.fx.text(this.key === 'wyrm' ? 'THE WYRM ASCENDS' : this.key === 'golem' ? 'THE COLOSSUS CRACKS' : 'DEATH ANSWERS', this.pos.x, this.height + 1.5, this.pos.z, { color: '#ff5a3a', big: true, life: 2 });
    g.shake(0.6); g.flash(0.3, '#ff5a3a');
    audio.play('crit', { vol: 0.8 });
    this.speed *= 1.15; this.cdMul *= 0.8;
    g.ui.bossPhase && g.ui.bossPhase(2);
  }

  // last stand: faster, angrier, briefly unstaggerable
  enterPhase3() {
    const g = this.game;
    this.phase = 3;
    this.cdMul *= 0.82; this.speed *= 1.1;
    this.poiseLock = Math.max(this.poiseLock, 6);
    g.fx.text(this.key === 'wyrm' ? 'CINDERMAW BURNS WHITE' : this.key === 'golem' ? 'THE BONES ROAR' : 'THE BISHOP UNRAVELS', this.pos.x, this.height + 1.5, this.pos.z, { color: '#ffb347', big: true, life: 2 });
    this.setGlowOnce();
    g.shake(0.5); g.flash(0.2, '#ff8a3a', 0.2);
    audio.play('crit', { vol: 0.7 });
  }
  setGlowOnce() { if (this.model && !this.enraged) { this.enraged = true; this.model.setGlow('#ff3a1a', 0.35); } }

  // override chase logic with move selection
  think(dt, t, speedMul) {
    const g = this.game;
    if (!t) { this.model.loop(this.anims.idle); return; }
    this.moveCd -= dt;
    const dist = this.distTo(t);
    if (this.moveCd <= 0 && !this.airborne) { this.chooseMove(t, dist); return; }
    // reposition
    const desired = this.key === 'necromancer' ? 9 : this.key === 'wyrm' ? 4.5 : 3.6;
    let want = dist > desired + 1 ? 1 : dist < desired - 2 && this.key === 'necromancer' ? -1 : 0;
    if (want) {
      let dir;
      if (this.flying || g.room.lineOfSight(this.pos.x, this.pos.z, t.pos.x, t.pos.z)) { const a = this.dirTo(t); dir = { x: Math.cos(a) * want, z: Math.sin(a) * want }; }
      else dir = g.room.flowDir(this.pos.x, this.pos.z) || { x: 0, z: 0 };
      const sp = this.speed * speedMul;
      this.move(dir.x * sp * dt, dir.z * sp * dt);
      this.turnTowards(this.dirTo(t), 4, dt);
      this.model.loop(this.anims.walk);
    } else { this.turnTowards(this.dirTo(t), 4, dt); this.model.loop(this.anims.idle); }
  }

  chooseMove(t, dist) {
    const moves = MOVES[this.key](this, t, dist);
    // weighted pick, avoid repeating
    const opts = moves.filter((m) => m.ok !== false && m.id !== this.lastMove);
    let total = opts.reduce((a, m) => a + m.w, 0), r = rng.float() * total, pick = opts[0];
    for (const m of opts) { r -= m.w; if (r <= 0) { pick = m; break; } }
    this.lastMove = pick.id;
    this.moveCd = (pick.cd || 2.2) * this.cdMul;
    pick.run();
  }

  windup(anim, time, recover = 0.6) {
    this.state = 'windup'; this.stateT = time + 0.01;
    this.pending = { kind: 'boss', lockAt: time * 0.5, recover, hit: new Set() };
    this.model.once(anim, { duration: time + recover });
  }
  release() { if (this.tele) { this.game.fx.removeDecal(this.tele); this.tele = null; } }

  // ---- shared move helpers
  meleeCone(t, { radius, arc, time, dice, label, anim }) {
    const g = this.game;
    this.facing = this.dirTo(t);
    this.windup(anim || this.anims.attack, time);
    this.tele = g.fx.telegraph('cone', { x: this.pos.x, z: this.pos.z, radius, angle: this.facing, arc: arc * Math.PI / 180, time });
    this.schedule(time, () => {
      this.tele = null;
      g.fx.slash(this.pos.x, this.pos.z, this.facing, { size: radius * 1.6, color: 0xff9a7a, tex: 'slash_02', life: 0.25 });
      for (const h of g.heroes) if (h.canAct && this.inArc(h, arc, radius)) enemyAttack(g, this, h, { dice, label });
      g.shake(0.3); audio.play('hitHeavy', { vol: 0.6 });
    });
  }
  circlesUnderHeroes({ radius, time, dc, dice, type, ability = 'dex', tex = 'scratch_01', color = 0xffffff, onFail }) {
    const g = this.game;
    for (const h of g.heroes.filter((x) => x.canAct)) {
      const x = h.pos.x, z = h.pos.z;
      g.fx.telegraph('circle', { x, z, radius, time });
      this.schedule(time, () => {
        g.fx.burst(tex, x, 0.6, z, 14, { color, speed: 5, up: 6, gravity: -12, size: 1, additive: tex !== 'scratch_01' });
        for (const k of g.heroes) if (k.canAct && Math.hypot(k.pos.x - x, k.pos.z - z) < radius + k.radius * 0.5) heroSave(g, k, { ability, dc, dice, type, source: this, onFail });
        g.shake(0.15); audio.play('explode', { vol: 0.4 });
      });
    }
  }
  randomCircles(n, { radius, time, dc, dice, type, spread = 6, tex = 'flame_05', color = 0xff7a2f, zone = null }) {
    const g = this.game;
    const heroes = g.heroes.filter((x) => x.canAct);
    for (let i = 0; i < n; i++) {
      const h = heroes[i % heroes.length] || this;
      let x = h.pos.x + frand(-spread, spread), z = h.pos.z + frand(-spread, spread);
      if (g.room.solidAt(x, z)) { x = h.pos.x; z = h.pos.z; }
      const delay = i * 0.18;
      this.schedule(delay, () => g.fx.telegraph('circle', { x, z, radius, time }));
      this.schedule(delay + time, () => {
        g.fx.burst(tex, x, 1, z, 12, { color, speed: 5, up: 4, size: 1.4 });
        g.fx.light({ x, z, color, intensity: 8, life: 0.3 });
        for (const k of g.heroes) if (k.canAct && Math.hypot(k.pos.x - x, k.pos.z - z) < radius + 0.4) heroSave(g, k, { ability: 'dex', dc, dice, type, source: this });
        if (zone) g.spawnZone({ ...zone, x, z, owner: this });
        audio.play('explode', { vol: 0.35 });
      });
    }
  }
  projectileFan(t, n, spread, kind, speed = 15) {
    const g = this.game, a0 = this.dirTo(t);
    for (let i = 0; i < n; i++) {
      const a = a0 + (n > 1 ? (i / (n - 1) - 0.5) * spread : 0);
      g.spawnProjectile({ kind, owner: this, x: this.pos.x + Math.cos(a) * 1.5, z: this.pos.z + Math.sin(a) * 1.5, y: 2, angle: a, speed, range: 30, enemy: true, bonus: this.atk });
    }
  }
}

const MOVES = {
  necromancer(b, t, dist) {
    const g = b.game, P2 = b.phase === 2;
    const adds = g.enemies.filter((e) => e.alive && !e.isBoss).length;
    return [
      { id: 'bolts', w: 3, cd: 1.8, run: () => {
        b.facing = b.dirTo(t); b.windup(b.anims.attack, 0.65, 0.4);
        g.fx.burst('magic_04', b.pos.x, 3, b.pos.z, 8, { color: 0xb07cff, speed: 1 });
        b.schedule(0.65, () => b.projectileFan(t, P2 ? 5 : 3, P2 ? 0.9 : 0.5, 'necrobolt', 15));
      } },
      { id: 'spikes', w: 2.5, cd: 2.6, run: () => {
        b.windup(b.anims.cast, 1.0, 0.5);
        b.circlesUnderHeroes({ radius: 2.3, time: 1.15, dc: b.def.dc, dice: '3d6', type: 'piercing', tex: 'scratch_01', color: 0xe8e0d0 });
      } },
      { id: 'raise', w: adds < (P2 ? 6 : 4) ? 2 : 0, ok: adds < (P2 ? 6 : 4), cd: 3.0, run: () => {
        b.windup(b.anims.summon || b.anims.cast, 1.0, 0.6);
        g.fx.text('RISE!', b.pos.x, b.height + 1, b.pos.z, { color: '#b07cff', big: true });
        b.schedule(0.8, () => { for (let i = 0; i < (P2 ? 3 : 2); i++) { const a = frand(0, 6.28); g.spawnEnemy(rng.pick(['skel_minion', 'skel_minion', 'skel_rogue', 'skel_archer']), b.pos.x + Math.cos(a) * 4, b.pos.z + Math.sin(a) * 4); } });
      } },
      { id: 'blink', w: dist < 4 ? 4 : 0.3, cd: 0.8, run: () => { b.blinkAway(t); b.moveCd = 0.5; } },
      { id: 'scythe', w: dist < 4 ? 3 : 0, ok: dist < 5, cd: 1.6, run: () => b.meleeCone(t, { radius: 4.2, arc: 140, time: 0.75, dice: '2d8+3', label: 'scythe', anim: 'Melee_2H_Attack_Slice' }) },
      { id: 'nova', w: P2 ? 2.5 : 0, ok: P2, cd: 3.2, run: () => {
        b.windup(b.anims.cast, 0.9, 0.6);
        g.fx.telegraph('ring', { x: b.pos.x, z: b.pos.z, radius: 4, time: 0.9, color: 0xb07cff });
        b.schedule(0.9, () => { const off = frand(0, 1); for (let i = 0; i < 14; i++) { const a = off + i / 14 * Math.PI * 2; g.spawnProjectile({ kind: 'skull', owner: b, x: b.pos.x + Math.cos(a) * 1.5, z: b.pos.z + Math.sin(a) * 1.5, y: 1.8, angle: a, speed: 9, range: 30, enemy: true, bonus: b.atk }); } });
      } },
    ];
  },
  golem(b, t, dist) {
    const g = b.game, P2 = b.phase === 2;
    return [
      { id: 'sweep', w: dist < 6.5 ? 4 : 0, ok: dist < 7, cd: 1.8, run: () => b.meleeCone(t, { radius: 6, arc: 150, time: 1.0, dice: '2d10+5', label: 'sweep', anim: 'Melee_2H_Attack' }) },
      { id: 'slam', w: 3, cd: 2.4, run: () => {
        b.facing = b.dirTo(t); b.windup('Melee_2H_Slam', 1.15, 0.9);
        const a = b.facing, x0 = b.pos.x, z0 = b.pos.z;
        b.tele = g.fx.telegraph('line', { x: x0, z: z0, angle: a, length: 14, width: 3.2, time: 1.15 });
        b.schedule(1.15, () => {
          b.tele = null; g.shake(0.7); audio.play('hitHeavy', { vol: 1 });
          for (let s = 1; s < 14; s += 1.5) g.fx.burst('dirt_02', x0 + Math.cos(a) * s, 0.5, z0 + Math.sin(a) * s, 3, { color: 0xb0a090, speed: 3, up: 6, gravity: -16, additive: false });
          for (const h of g.heroes) {
            if (!h.canAct) continue;
            const dx = h.pos.x - x0, dz = h.pos.z - z0, along = dx * Math.cos(a) + dz * Math.sin(a), across = Math.abs(-dx * Math.sin(a) + dz * Math.cos(a));
            if (along > 0 && along < 14 && across < 1.6 + h.radius) heroSave(g, h, { ability: 'dex', dc: b.def.dc, dice: '4d8', type: 'bludgeoning', source: b, onFail: (x) => x.addCond('prone', 0.8) });
          }
        });
      } },
      { id: 'stomp', w: dist < 7 ? 2.5 : 1, cd: 2.4, run: () => {
        b.windup('Melee_Unarmed_Smash', 1.0, 0.7);
        b.tele = g.fx.telegraph('circle', { x: b.pos.x, z: b.pos.z, radius: 7, time: 1.0 });
        b.schedule(1.0, () => {
          b.tele = null; g.shake(0.6);
          g.fx.burst('circle_05', b.pos.x, 0.5, b.pos.z, 1, { size: 14, speed: 0, life: 0.35, color: 0xffe0b0 });
          for (const h of g.heroes) if (h.canAct && h.distTo(b) < 7 + h.radius) heroSave(g, h, { ability: 'con', dc: b.def.dc, dice: '3d8', type: 'thunder', source: b, onFail: (x) => { const a = b.dirTo(x); x.knock.x += Math.cos(a) * 18; x.knock.z += Math.sin(a) * 18; } });
        });
      } },
      { id: 'charge', w: dist > 6 ? 3 : 1, cd: 2.0, run: () => {
        b.facing = b.dirTo(t); b.windup('Running_A', 0.9, 0.2);
        b.tele = g.fx.telegraph('line', { x: b.pos.x, z: b.pos.z, angle: b.facing, length: 20, width: 3.6, time: 0.9 });
        b.schedule(0.9, () => { b.tele = null; b.charging = { t: 1.8, hit: new Set() }; b.state = 'charge'; b.model.loop('Running_A', { speed: 1.6 }); });
      } },
      { id: 'rockfall', w: P2 ? 2.5 : 0, ok: P2, cd: 2.6, run: () => {
        b.windup('Melee_Unarmed_Smash', 0.6, 0.5); g.shake(0.4);
        b.randomCircles(8, { radius: 2.2, time: 1.3, dc: b.def.dc, dice: '3d6', type: 'bludgeoning', spread: 7, tex: 'dirt_02', color: 0xc0b0a0 });
      } },
    ];
  },
  wyrm(b, t, dist) {
    const g = b.game, P2 = b.phase === 2;
    const behind = Math.abs(b.angleDiff(b.dirTo(t), b.facing)) > Math.PI * 0.6;
    return [
      { id: 'breath', w: 3, cd: 2.8, run: () => {
        b.facing = b.dirTo(t); b.windup('Punch', 1.2, 0.8);
        b.tele = g.fx.telegraph('cone', { x: b.pos.x, z: b.pos.z, radius: 12, angle: b.facing, arc: Math.PI * 0.42, time: 1.2, color: 0xff6a1a });
        b.schedule(1.2, () => {
          b.tele = null;
          for (let k = 0; k < 40; k++) { const a = b.facing + frand(-0.38, 0.38); g.fx.spawn('flame_05', { x: b.pos.x + Math.cos(b.facing) * 2, y: 2, z: b.pos.z + Math.sin(b.facing) * 2, vx: Math.cos(a) * frand(14, 24), vz: Math.sin(a) * frand(14, 24), vy: -1, life: 0.55, size: 2, grow: 2.5, color: 0xff7a2f }); }
          g.fx.light({ x: b.pos.x + Math.cos(b.facing) * 5, z: b.pos.z + Math.sin(b.facing) * 5, color: 0xff6a1a, intensity: 18, life: 0.6, distance: 20 });
          g.shake(0.5); audio.play('explode', { vol: 0.8 });
          for (const h of g.heroes) if (h.canAct && b.inArc(h, 76, 12)) heroSave(g, h, { ability: 'dex', dc: b.def.dc, dice: '6d6', type: 'fire', source: b, label: '(dragon breath)' });
          for (let s = 3; s < 12; s += 3) g.spawnZone({ kind: 'fire', owner: b, x: b.pos.x + Math.cos(b.facing) * s, z: b.pos.z + Math.sin(b.facing) * s, radius: 1.6, life: P2 ? 6 : 3.5 });
        });
      } },
      { id: 'bite', w: dist < 6 && !behind ? 3 : 0, ok: dist < 7, cd: 1.5, run: () => b.meleeCone(t, { radius: 5.5, arc: 90, time: 0.7, dice: '2d10+6', label: 'bite', anim: 'Headbutt' }) },
      { id: 'tail', w: behind && dist < 7 ? 5 : 0, ok: behind, cd: 1.6, run: () => {
        b.windup('HitReact', 0.8, 0.5);
        const back = b.facing + Math.PI;
        b.tele = g.fx.telegraph('cone', { x: b.pos.x, z: b.pos.z, radius: 7, angle: back, arc: Math.PI * 0.9, time: 0.8 });
        b.schedule(0.8, () => { b.tele = null; const f = b.facing; b.facing = back; for (const h of g.heroes) if (h.canAct && b.inArc(h, 160, 7)) enemyAttack(g, b, h, { dice: '2d8+6', type: 'bludgeoning' }); b.facing = f; g.shake(0.3); });
      } },
      { id: 'buffet', w: dist < 6 ? 2 : 0.5, cd: 2.2, run: () => {
        b.windup('Fast_Flying', 0.9, 0.5);
        b.tele = g.fx.telegraph('circle', { x: b.pos.x, z: b.pos.z, radius: 7.5, time: 0.9, color: 0xd0e0ff });
        b.schedule(0.9, () => { b.tele = null; g.fx.burst('smoke_03', b.pos.x, 1, b.pos.z, 20, { color: 0xffffff, speed: 10, up: 1, additive: false });
          for (const h of g.heroes) if (h.canAct && h.distTo(b) < 7.5) heroSave(g, h, { ability: 'str', dc: b.def.dc, dice: '2d6', type: 'bludgeoning', source: b, onFail: (x) => { const a = b.dirTo(x); x.knock.x += Math.cos(a) * 22; x.knock.z += Math.sin(a) * 22; x.addCond('prone', 0.6); } }); });
      } },
      { id: 'meteors', w: 2, cd: 2.8, run: () => {
        b.windup('Yes', 0.6, 0.4);
        b.randomCircles(P2 ? 12 : 7, { radius: 2.4, time: 1.2, dc: b.def.dc, dice: '4d6', type: 'fire', spread: 8, zone: P2 ? { kind: 'fire', radius: 1.6, life: 4 } : null });
      } },
      { id: 'dive', w: P2 ? 3 : 0, ok: P2, cd: 3.5, run: () => {
        b.airborne = true; b.airT = 2.2; b.model.loop('Fast_Flying');
        g.fx.text('IT TAKES FLIGHT', b.pos.x, 9, b.pos.z, { color: '#ff7a2f', big: true });
        b.state = 'recover'; b.stateT = 2.6;
        b.schedule(1.0, () => {
          const tt = b.pickTarget() || t; const x = tt.pos.x, z = tt.pos.z;
          g.fx.telegraph('circle', { x, z, radius: 5, time: 1.2 });
          b.schedule(1.2, () => {
            b.airborne = false; b.pos.x = x; b.pos.z = z; b.hover = 0;
            g.shake(0.9); g.flash(0.2, '#ff7a2f'); audio.play('explode', { vol: 1 });
            g.fx.burst('flame_05', x, 1, z, 30, { color: 0xff7a2f, speed: 9, up: 4, size: 1.6 });
            for (const h of g.heroes) if (h.canAct && Math.hypot(h.pos.x - x, h.pos.z - z) < 5.4) heroSave(g, h, { ability: 'dex', dc: b.def.dc, dice: '6d6', type: 'fire', source: b });
            g.spawnZone({ kind: 'fire', owner: b, x, z, radius: 3, life: 5 });
          });
        });
      } },
    ];
  },
};

// golem charge state handled here (keeps Enemy generic)
const baseUpdate = Boss.prototype.update;
Boss.prototype.update = function (dt) {
  if (this.state === 'charge' && this.charging && this.alive) {
    const g = this.game, c = this.charging;
    c.t -= dt;
    this.hitWall = false;
    const sp = 19;
    this.move(Math.cos(this.facing) * sp * dt, Math.sin(this.facing) * sp * dt);
    for (const h of g.heroes) if (h.canAct && !c.hit.has(h) && h.distTo(this) < this.radius + h.radius + 0.3) {
      c.hit.add(h);
      heroSave(g, h, { ability: 'str', dc: this.def.dc, dice: '3d10', type: 'bludgeoning', source: this, onFail: (x) => { const a = this.facing + Math.PI / 2 * (Math.random() < 0.5 ? 1 : -1); x.knock.x += Math.cos(a) * 20; x.knock.z += Math.sin(a) * 20; } });
    }
    if (Math.random() < 0.5) g.fx.burst('dirt_02', this.pos.x, 0.3, this.pos.z, 1, { color: 0xb0a090, speed: 2, up: 3, gravity: -10, additive: false });
    if (this.hitWall || c.t <= 0) {
      this.charging = null;
      if (this.hitWall) { g.shake(0.8); audio.play('hitHeavy', { vol: 1 }); g.fx.text('STUNNED', this.pos.x, this.height + 1, this.pos.z, { color: '#ffb347', big: true }); this.stagger(2.6); }
      else { this.state = 'recover'; this.stateT = 0.6; }
    }
    this.model.update(dt); this.syncModel(dt);
    return;
  }
  baseUpdate.call(this, dt);
};
