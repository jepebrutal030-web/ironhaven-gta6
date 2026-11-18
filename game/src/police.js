// The wanted system: levels 0-5, police cars that chase and ram, foot cops
// that arrest, and the "hidden" decay timer. The test drives this directly
// (setWanted, lastSeenT, policeCars, footCops, spawnFootCop), so the shape
// of these objects is part of the contract.
import * as THREE from 'three';
import { POLICE_MODEL, TUNING, ROADS } from './config.js';
import { makeCar } from './vehicles.js';
import { makeFootCop } from './peds.js';
import { collideCircle } from './city.js';

export class Wanted {
  constructor(scene, rng, colliders) {
    this.scene = scene; this.rng = rng; this.colliders = colliders;
    this.level = 0;
    this.lastSeenT = 0;
    this.policeCars = []; // Car objects (group, speed, stuckT, heading)
    this.footCops = []; // Person objects (group, arrestT, pos)
    this.onBusted = null; // called when an arrest completes
    this.onRam = null; // called on a police ram (damage + sound)
  }
  setLevel(n) {
    this.level = Math.max(0, Math.min(5, n));
    if (this.level === 0) this._clearAll();
    else this._syncPolice();
  }
  add(n) { this.setLevel(this.level + n); }
  _clearAll() {
    for (const c of this.policeCars) this.scene.remove(c.group);
    for (const c of this.footCops) this.scene.remove(c.group);
    this.policeCars = []; this.footCops = [];
    this.lastSeenT = 0;
  }
  _syncPolice() {
    // Police cars: one per wanted level (cap 5). Foot cops: two at level 3+
    // when the player is on foot (added by update, not here).
    while (this.policeCars.length < Math.min(this.level, 5)) this._spawnPoliceCar();
    while (this.policeCars.length > Math.min(this.level, 5)) {
      const c = this.policeCars.pop();
      this.scene.remove(c.group);
    }
    if (this.level < 3) {
      for (const c of this.footCops) this.scene.remove(c.group);
      this.footCops = [];
    }
  }
  _spawnPoliceCar(near = null) {
    const car = makeCar(POLICE_MODEL, { police: true });
    car.stuckT = 0; car.ramCooldown = 0; car._lastX = 0; car._lastZ = 0; car._stillT = 0;
    // Spawn on a road 40-60m from the player (or the given point).
    const px = near ? near.x : 0, pz = near ? near.z : 0;
    let x = px, z = pz;
    for (let tries = 0; tries < 12; tries++) {
      const road = this.rng.pick(ROADS);
      const along = this.rng.range(-180, 180);
      if (this.rng.chance(0.5)) { x = along; z = road; } else { x = road; z = along; }
      if (Math.hypot(x - px, z - pz) > 35 && Math.hypot(x - px, z - pz) < 70) break;
    }
    car.setPos(x, z, this.rng.range(0, Math.PI * 2));
    car.speed = 8;
    this.scene.add(car.group);
    this.policeCars.push(car);
    return car;
  }
  spawnFootCop(pos) {
    const cop = makeFootCop(this.scene, pos.x, pos.z);
    this.footCops.push(cop);
    return cop;
  }
  // Steer a police car toward the player; returns true on a ram.
  _chaseCar(car, dt, playerPos, playerCar) {
    const dx = playerPos.x - car.x, dz = playerPos.z - car.z;
    const d = Math.hypot(dx, dz);
    const want = Math.atan2(dx, dz);
    let diff = want - car.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const turn = Math.max(-2.4 * dt, Math.min(2.4 * dt, diff));
    car.heading += turn;
    const target = d > 30 ? TUNING.policeRam : TUNING.policeRam * 0.75;
    car.speed += Math.max(-14 * dt, Math.min(10 * dt, target - car.speed));
    const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
    const nx = car.x + fx * car.speed * dt;
    const nz = car.z + fz * car.speed * dt;
    const fixed = collideCircle(nx, nz, 1.9, this.colliders);
    const moved = Math.hypot(fixed.x - car.x, fixed.z - car.z);
    car.group.position.set(fixed.x, 0, fixed.z);
    car.group.rotation.y = car.heading;
    for (const wg of car.wheels) wg.rotation.x += (car.speed * dt) / 0.36;
    // Stuck detection: barely moving while trying to drive.
    if (moved < 0.3 * dt * 10 && car.speed > 3) car._stillT += dt;
    else car._stillT = 0;
    if (car._stillT > 3) { car.stuckT += dt; car._stillT = 0; }
    if (car.stuckT > 3) {
      car.stuckT = 0;
      const road = this.rng.pick(ROADS);
      car.setPos(this.rng.range(-150, 150), road, car.heading);
      car.speed = 10;
    }
    // Ram: close to the player.
    if (car.ramCooldown > 0) car.ramCooldown -= dt;
    if (d < 3.4 && car.ramCooldown <= 0) {
      car.ramCooldown = 1.2;
      if (playerCar) playerCar.speed *= 0.55;
      return true;
    }
    return false;
  }
  update(dt, player, playerCar) {
    this._t = (this._t || 0) + dt;
    const pp = player.pos;
    // Are we seen? A police car within 60m or a foot cop within 40m.
    let seen = false;
    for (const c of this.policeCars) if (Math.hypot(c.x - pp.x, c.z - pp.z) < TUNING.sightCar) { seen = true; break; }
    if (!seen) for (const c of this.footCops) if (Math.hypot(c.pos.x - pp.x, c.pos.z - pp.z) < TUNING.sightFoot) { seen = true; break; }
    if (this.level > 0) {
      if (seen) this.lastSeenT = 0;
      else {
        this.lastSeenT += dt;
        if (this.lastSeenT >= TUNING.decayTime) {
          this.lastSeenT = 0;
          this.setLevel(this.level - 1);
        }
      }
    }
    // Foot cops join the chase at level 3+ while the player is on foot.
    if (this.level >= 3 && !player.driving && this.footCops.length < 2) {
      this.spawnFootCop({ x: pp.x + this.rng.range(25, 40) * (this.rng.chance(0.5) ? 1 : -1), z: pp.z + this.rng.range(25, 40) * (this.rng.chance(0.5) ? 1 : -1) });
    }
    for (const car of this.policeCars) {
      car.flash(this._t);
      if (this._chaseCar(car, dt, pp, playerCar) && this.onRam) this.onRam(car);
    }
    for (const cop of this.footCops) {
      if (cop.state !== 'active') continue;
      const dx = pp.x - cop.pos.x, dz = pp.z - cop.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > TUNING.arrestRange) {
        cop.moveToward(pp.x, pp.z, cop.speed, dt, this.colliders);
        cop.arrestT = Math.max(0, cop.arrestT - dt * 2);
      } else {
        cop.arrestT += dt;
        if (cop.arrestT >= TUNING.arrestTime && this.onBusted) this.onBusted();
      }
    }
  }
}
