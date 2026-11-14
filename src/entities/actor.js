// Shared actor behaviour: movement with grid collision, facing, conditions.
import * as THREE from 'three';

export class Actor {
  constructor(game) {
    this.game = game;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.knock = new THREE.Vector3();
    this.radius = 0.7;
    this.facing = Math.PI / 2; // direction (cos, sin) on the x/z plane; PI/2 = towards +z (camera)
    this.visualFacing = this.facing;
    this.alive = true;
    this.cond = {}; // condition name -> remaining seconds
    this.model = null;
    this.flying = false;
    this.hover = 0;
    this.height = 2.4;
  }
  has(c) { return (this.cond[c] || 0) > 0; }
  addCond(c, t) { this.cond[c] = Math.max(this.cond[c] || 0, t); }
  tickConds(dt) { for (const k in this.cond) { this.cond[k] -= dt; if (this.cond[k] <= 0) delete this.cond[k]; } }

  dirTo(o) { return Math.atan2(o.pos.z - this.pos.z, o.pos.x - this.pos.x); }
  distTo(o) { return Math.hypot(o.pos.x - this.pos.x, o.pos.z - this.pos.z); }
  angleDiff(a, b) { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }
  inArc(o, arcDeg, reach) {
    const d = this.distTo(o);
    if (d > reach + (o.radius || 0.6)) return false;
    if (arcDeg >= 360) return true;
    return Math.abs(this.angleDiff(this.dirTo(o), this.facing)) <= (arcDeg / 2) * Math.PI / 180 + (d < 1.2 ? 0.6 : 0);
  }
  // is `o` facing away from us (for backstabs / flanking)
  behind(o) { return Math.abs(this.angleDiff(o.facing, this.dirTo(o))) < Math.PI * 0.4; }

  blocked(x, z) {
    const room = this.game.room;
    if (!room) return false;
    const r = this.radius * 0.85;
    const fl = this.flying;
    return room.solidAt(x + r, z, fl) || room.solidAt(x - r, z, fl) || room.solidAt(x, z + r, fl) || room.solidAt(x, z - r, fl)
      || room.solidAt(x + r * 0.7, z + r * 0.7, fl) || room.solidAt(x - r * 0.7, z + r * 0.7, fl)
      || room.solidAt(x + r * 0.7, z - r * 0.7, fl) || room.solidAt(x - r * 0.7, z - r * 0.7, fl);
  }

  move(dx, dz) {
    if (dx && !this.blocked(this.pos.x + dx, this.pos.z)) this.pos.x += dx;
    else if (dx) this.hitWall = true;
    if (dz && !this.blocked(this.pos.x, this.pos.z + dz)) this.pos.z += dz;
    else if (dz) this.hitWall = true;
  }

  applyKnock(dt) {
    if (this.knock.lengthSq() > 0.001) {
      this.move(this.knock.x * dt, this.knock.z * dt);
      this.knock.multiplyScalar(Math.pow(0.002, dt));
    }
  }

  separate(others, strength = 8, dt = 0.016) {
    for (const o of others) {
      if (o === this || !o.alive || o.ghost) continue;
      const dx = this.pos.x - o.pos.x, dz = this.pos.z - o.pos.z;
      const min = this.radius + o.radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 0.0001) {
        const d = Math.sqrt(d2), push = (min - d) * strength * dt;
        this.move((dx / d) * push, (dz / d) * push);
      }
    }
  }

  turnTowards(target, rate, dt) {
    const d = this.angleDiff(target, this.facing);
    const step = rate * dt;
    this.facing += Math.abs(d) < step ? d : Math.sign(d) * step;
  }

  syncModel(dt) {
    if (!this.model) return;
    const d = this.angleDiff(this.facing, this.visualFacing);
    this.visualFacing += d * Math.min(1, dt * 18);
    this.model.root.position.set(this.pos.x, this.pos.y + this.hover, this.pos.z);
    this.model.root.rotation.y = Math.PI / 2 - this.visualFacing;
    // squash & stretch pop when hit (holds during hitstop, which sells the impact)
    if (this.pop > 0) {
      this.pop = Math.max(0, this.pop - dt * 5);
      const p = this.pop;
      this.model.root.scale.set(1 + 0.22 * p, 1 - 0.2 * p, 1 + 0.22 * p);
    } else if (this.model.root.scale.x !== 1) this.model.root.scale.set(1, 1, 1);
    if (this.shadow) this.shadow.position.set(this.pos.x, 0.06, this.pos.z);
  }
}
