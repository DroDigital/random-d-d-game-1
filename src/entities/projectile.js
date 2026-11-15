// Projectiles (arrows, cantrips, bolts) and lingering zones (moonbeam, fire, spores).
import * as THREE from 'three';
import { heroAttack, heroAutoHit, heroSaveDamage, enemyAttack, heroSave, applyDamage } from './combat.js';
import { rollDice, attackRoll } from '../core/rules.js';
import { audio } from '../core/audio.js';

// visual recipe per kind: sprite texture, colour, size, light colour
const LOOK = {
  arrow: { model: 'arrow', color: 0xffffff },
  bolt: { model: 'arrow', color: 0xc8d0ff },
  knife: { model: 'dagger', color: 0xffffff },
  firebolt: { tex: 'effect_flame0', trail: 'flame_03', color: 0xffa050, size: 1.4, light: 0xff7a2f },
  produceflame: { tex: 'effect_flame0', trail: 'flame_03', color: 0xffc070, size: 1.2, light: 0xffa050 },
  frostray: { tex: 'effect_icicle0', trail: 'star_05', color: 0xbfe8ff, size: 1.3, light: 0x8fd3ff },
  missile: { tex: 'effect_magic_dart0', trail: 'magic_02', color: 0xd0a0ff, size: 1.0, light: 0xb07cff },
  ray: { tex: 'effect_bolt04', trail: 'flame_03', color: 0xff9a50, size: 1.0, light: 0xff7a2f },
  fireball: { tex: 'effect_cloud_fire0', trail: 'flame_05', color: 0xffb060, size: 1.8, light: 0xff6a1a },
  necrobolt: { tex: 'effect_drain0', trail: 'magic_04', color: 0xc090ff, size: 1.3, light: 0x9a5cff },
  skull: { tex: 'effect_cloud_spectral0', trail: 'magic_04', color: 0xc8a0ff, size: 1.3, light: 0x9a5cff },
  spark: { tex: 'effect_orb_glow0', trail: 'spark_04', color: 0x9ff8ff, size: 1.1, light: 0x7ff0ff },
  hex: { tex: 'effect_orb_glow0', trail: 'magic_05', color: 0xff9ad8, size: 1.1, light: 0xff6ac8 },
};
const DAMAGE = {
  necrobolt: { dice: '2d6', type: 'necrotic' }, skull: { dice: '2d6', type: 'necrotic' }, bolt: { dice: '1d8+2', type: 'piercing' },
  spark: { dice: '2d8', type: 'lightning' }, hex: { dice: '2d6', type: 'psychic' }, firebolt: { dice: '2d6', type: 'fire' },
};

export class Projectile {
  constructor(game, o) {
    this.game = game; Object.assign(this, o);
    this.alive = true; this.delay = o.delay || 0; this.t = 0;
    this.y = o.y ?? 1.5;
    this.speed = o.speed || 20;
    if (o.target && o.angle === undefined) this.angle = Math.atan2(o.target.pos.z - o.z, o.target.pos.x - o.x);
    if (o.tx !== undefined) { this.angle = Math.atan2(o.tz - o.z, o.tx - o.x); this.travel = Math.hypot(o.tx - o.x, o.tz - o.z); }
    this.vx = Math.cos(this.angle) * this.speed; this.vz = Math.sin(this.angle) * this.speed;
    this.range = o.range || 30; this.dist = 0;
    this.hit = new Set();
    this.look = LOOK[o.kind] || LOOK.firebolt;
    this.homing = o.kind === 'missile' || o.kind === 'ray';
    this.obj = null;
  }
  build() {
    const g = this.game, L = this.look;
    if (L.model) {
      const src = L.model === 'arrow' ? g.models.gearArrow : g.models.gearDagger;
      const inner = src ? src.clone() : new THREE.Mesh(new THREE.BoxGeometry(0.1, 1, 0.1), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      inner.rotation.x = Math.PI / 2; // weapon models point along +Y; lay them along +Z
      inner.scale.setScalar(L.model === 'arrow' ? 1.3 : 1.1);
      this.obj = new THREE.Group(); this.obj.add(inner);
    } else {
      const mat = new THREE.SpriteMaterial({ map: g.fx.tex[L.tex], color: L.color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      this.obj = new THREE.Sprite(mat); this.obj.scale.setScalar(L.size * 1.4);
    }
    g.fx.group.add(this.obj);
    if (L.light) this.light = g.fx.light({ x: this.x, y: this.y, z: this.z, color: L.light, intensity: 5, distance: 8, life: 10 });
  }
  kill() {
    this.alive = false;
    if (this.obj) this.game.fx.group.remove(this.obj);
    if (this.light) { this.light.userData.life = 0.15; this.light.userData.max = 0.15; }
  }
  update(dt) {
    const g = this.game;
    if (this.delay > 0) { this.delay -= dt; if (this.delay <= 0 && this.owner) { this.x = this.owner.pos.x; this.z = this.owner.pos.z; } return; }
    if (!this.obj) this.build();
    this.t += dt;
    if (this.homing && this.target && this.target.alive) {
      const want = Math.atan2(this.target.pos.z - this.z, this.target.pos.x - this.x);
      let d = want - this.angle; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      this.angle += Math.max(-1, Math.min(1, d)) * Math.min(1, dt * (6 + this.t * 20));
      this.vx = Math.cos(this.angle) * this.speed; this.vz = Math.sin(this.angle) * this.speed;
    }
    const sx = this.vx * dt, sz = this.vz * dt;
    this.x += sx; this.z += sz; this.dist += Math.hypot(sx, sz);
    this.obj.position.set(this.x, this.y, this.z);
    if (this.look.model) this.obj.rotation.y = Math.PI / 2 - this.angle;
    else this.obj.material.rotation = -this.angle;
    if (this.light) { this.light.position.set(this.x, this.y + 0.5, this.z); }
    if (this.look.model && Math.random() < 0.8) g.fx.spawn('spark_04', { x: this.x, y: this.y, z: this.z, life: 0.16, size: 0.32, grow: -0.3, color: this.look.color, opacity: 0.7 });
    if (this.look.trail && Math.random() < 0.7) g.fx.spawn(this.look.trail, { x: this.x, y: this.y, z: this.z, life: 0.25, size: this.look.size * 0.8, grow: -0.5, color: this.look.color });

    if (this.kind === 'fireball' && this.dist >= this.travel) { this.explode(); return; }
    if (this.dist > this.range) { this.kill(); return; }
    if (g.room.solidAt(this.x, this.z, true)) { this.impactFx(); if (this.kind === 'fireball') this.explode(); else this.kill(); return; }
    const c = g.room.toCell(this.x, this.z);
    if (g.room.blockTall && g.room.blockTall[g.room.idx(c.i, c.j)] && !this.homing) { this.impactFx(); this.kill(); return; }
    if (g.hazards && g.hazards.projectile(this)) { this.impactFx(); if (this.kind === 'fireball') this.explode(); else this.kill(); return; }

    if (this.enemy) {
      for (const h of g.heroes) {
        if (!h.canAct || this.hit.has(h)) continue;
        if (Math.hypot(h.pos.x - this.x, h.pos.z - this.z) < h.radius + 0.4) {
          this.hit.add(h);
          const dm = DAMAGE[this.kind] || DAMAGE.necrobolt;
          enemyAttack(g, this.owner, h, { dice: dm.dice, type: dm.type, bonus: this.bonus ?? this.owner.atk });
          this.impactFx(); this.kill(); return;
        }
      }
      // thralls can be hit too
    } else {
      for (const e of g.enemies) {
        if (!e.alive || e.hidden || e.thrall || this.hit.has(e)) continue;
        if (Math.hypot(e.pos.x - this.x, e.pos.z - this.z) < e.radius + 0.45) {
          this.hit.add(e);
          if (this.kind === 'fireball') { this.explode(); return; }
          this.onHitEnemy(e);
          if (!this.pierce) { this.kill(); return; }
        }
      }
    }
  }
  onHitEnemy(e) {
    const g = this.game, h = this.owner;
    this.impactFx();
    if (this.auto) { heroAutoHit(g, h, e, this.auto.dice, this.auto.type, { skill: this.skill, spell: this.spell }); audio.play('magicHit', { vol: 0.4 }); return; }
    if (this.kind === 'knife') {
      const res = attackRoll({ bonus: h.toHit, ac: e.effectiveAC(h), adv: 0, critRange: h.critRange });
      g.fx.die({ x: h.pos.x, y: 3.4, z: h.pos.z, value: res.roll, color: h.diceColor, good: res.hit });
      if (res.hit) {
        let amt = rollDice('1d4', { crit: res.crit }) + h.mods.dex + (h.flags.has('war_caster') ? rollDice('1d6') : 0);
        const before = e.hp;
        const dealt = applyDamage(g, h, e, [{ amount: amt, type: 'piercing' }], { crit: res.crit, knock: 2, angle: this.angle });
        h.afterHit(e, res, dealt, before, true);
        audio.play('slice', { vol: 0.5 });
      } else g.fx.text('MISS', e.pos.x, 2.4, e.pos.z, { color: '#9aa0a8' });
      return;
    }
    const r = heroAttack(g, h, e, { heavy: this.heavy });
    if (r.hit) {
      audio.play(this.kind === 'arrow' ? 'slice' : 'magicHit', { vol: 0.5 });
      if (this.kind === 'frostray') { e.addCond('chilled', 2.5); }
    }
  }
  impactFx() {
    const g = this.game, L = this.look;
    if (L.trail) g.fx.burst(L.trail, this.x, this.y, this.z, 6, { color: L.color, speed: 4, up: 2, size: L.size });
    else g.fx.burst('spark_04', this.x, this.y, this.z, 3, { color: 0xffffff, speed: 3, size: 0.5 });
    if (L.light) g.fx.light({ x: this.x, y: this.y, z: this.z, color: L.light, intensity: 6, life: 0.2, distance: 8 });
  }
  explode() {
    const g = this.game, h = this.owner;
    g.fx.burst('flame_05', this.x, 1, this.z, 34, { color: 0xff7a2f, speed: 9, up: 5, size: 1.8 });
    g.fx.burst('smoke_07', this.x, 1.5, this.z, 10, { color: 0x302020, speed: 3, up: 3, size: 2.5, additive: false });
    g.fx.light({ x: this.x, z: this.z, color: 0xff6a1a, intensity: 22, life: 0.5, distance: 22 });
    g.fx.decal('scorch_02', { x: this.x, z: this.z, size: 8, color: 0x000000, opacity: 0.7, life: 8, additive: false });
    g.shake(0.6); audio.play('explode', { vol: 0.9 });
    for (const e of g.enemies) if (e.alive && Math.hypot(e.pos.x - this.x, e.pos.z - this.z) < 4.5 + e.radius) heroSaveDamage(g, h, e, { dice: '6d6', type: 'fire', ability: 'dex' });
    this.kill();
    g.hazards && g.hazards.blast(this.x, this.z, 4.5, h);
  }
}

export class Zone {
  constructor(game, o) {
    this.game = game; Object.assign(this, o);
    this.t = 0; this.tick = 0; this.alive = true;
    const colors = { moonbeam: 0xfff4c0, fire: 0xff6a1a, spores: 0x9be36a };
    this.color = colors[o.kind] || 0xffffff;
    this.decal = game.fx.decal(o.kind === 'moonbeam' ? 'dngn_floor_sigil_circle' : o.kind === 'spores' ? 'effect_cloud_poison0' : 'circle_05',
      { x: o.x, z: o.z, size: o.radius * 2.4, color: this.color, opacity: o.kind === 'moonbeam' ? 0.9 : 0.55, life: o.life, fadeIn: 0.2 });
    if (o.kind === 'moonbeam') this.light = game.fx.light({ x: o.x, y: 5, z: o.z, color: 0xfff0b0, intensity: 10, distance: 10, life: o.life });
  }
  update(dt) {
    const g = this.game;
    this.t += dt; this.life -= dt; this.tick -= dt;
    if (this.kind === 'moonbeam' && this.follow) {
      const t = this.owner.nearestEnemy ? g.enemies.filter((e) => e.alive).sort((a, b) => Math.hypot(a.pos.x - this.x, a.pos.z - this.z) - Math.hypot(b.pos.x - this.x, b.pos.z - this.z))[0] : null;
      if (t) { const dx = t.pos.x - this.x, dz = t.pos.z - this.z, d = Math.hypot(dx, dz); if (d > 0.2) { this.x += dx / d * Math.min(d, 3.2 * dt); this.z += dz / d * Math.min(d, 3.2 * dt); } }
      this.decal.mesh.position.x = this.x; this.decal.mesh.position.z = this.z;
    }
    if (this.light) this.light.position.set(this.x, 5, this.z);
    if (Math.random() < 0.5) {
      if (this.kind === 'moonbeam') g.fx.spawn('light_02', { x: this.x + (Math.random() - 0.5) * this.radius, y: Math.random() * 5, z: this.z + (Math.random() - 0.5) * this.radius, vy: -4, life: 0.4, size: 0.6, color: 0xfff4c0 });
      if (this.kind === 'fire') g.fx.spawn('flame_03', { x: this.x + (Math.random() - 0.5) * this.radius, y: 0.4, z: this.z + (Math.random() - 0.5) * this.radius, vy: 2, life: 0.5, size: 0.9, color: 0xff7a2f });
      if (this.kind === 'spores') g.fx.spawn('smoke_03', { x: this.x + (Math.random() - 0.5) * this.radius, y: 0.8, z: this.z + (Math.random() - 0.5) * this.radius, vy: 0.6, life: 0.8, size: 1.4, color: 0x9be36a, additive: false, opacity: 0.5 });
    }
    if (this.tick <= 0) {
      this.tick = 1;
      if (this.kind === 'moonbeam') {
        for (const e of g.enemies) if (e.alive && Math.hypot(e.pos.x - this.x, e.pos.z - this.z) < this.radius + e.radius) heroSaveDamage(g, this.owner, e, { dice: '2d10', type: 'radiant', ability: 'con' });
      } else {
        for (const h of g.heroes) if (h.canAct && Math.hypot(h.pos.x - this.x, h.pos.z - this.z) < this.radius + h.radius * 0.5) {
          if (this.kind === 'fire') applyDamage(g, this.owner, h, [{ amount: rollDice('1d6'), type: 'fire' }]);
          else heroSave(g, h, { ability: 'con', dc: 11, dice: '1d6', type: 'poison', source: this.owner, label: '(spores)', onFail: (x) => x.addCond('poisoned', 3) });
        }
      }
    }
    if (this.life <= 0) this.alive = false;
  }
}
