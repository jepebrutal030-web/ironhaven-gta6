// The player on foot: Dario Reyes, a real humanoid (articulated limbs,
// walk/run animation) carrying one of three realistic weapons — Pistol,
// SMG, Shotgun — switched with keys 1/2/3. Health, per-weapon ammo and the
// shooting cooldowns the tests read (fireT, reloading) live here.
import * as THREE from 'three';
import { TUNING, PLACES, WEAPONS } from './config.js';
import { collideCircle } from './city.js';
import { createHumanoid } from './peds.js';

// One small realistic gun model per weapon, built from dark metal parts.
function buildGunModel(kind) {
  const g = new THREE.Group();
  const metal = new THREE.MeshPhongMaterial({ color: 0x1c1e22, shininess: 70, specular: 0x555555 });
  const wood = new THREE.MeshPhongMaterial({ color: 0x5a3a22, shininess: 20 });
  const add = (geo, m, x, y, z) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    g.add(mesh);
    return mesh;
  };
  if (kind === 0) {
    // Pistol: slide, barrel, grip.
    add(new THREE.BoxGeometry(0.05, 0.07, 0.34), metal, 0, 0, 0.1);
    add(new THREE.CylinderGeometry(0.025, 0.025, 0.2, 8), metal, 0, 0.01, 0.3).rotation.x = Math.PI / 2;
    add(new THREE.BoxGeometry(0.045, 0.16, 0.09), wood, 0, -0.1, -0.02).rotation.x = 0.25;
    add(new THREE.BoxGeometry(0.02, 0.03, 0.02), metal, 0, 0.05, 0.24); // front sight
  } else if (kind === 1) {
    // SMG: long receiver, barrel with shroud, magazine, stock, grip.
    add(new THREE.BoxGeometry(0.06, 0.09, 0.55), metal, 0, 0, 0.15);
    add(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 8), metal, 0, 0, 0.55).rotation.x = Math.PI / 2;
    add(new THREE.BoxGeometry(0.05, 0.22, 0.07), metal, 0, -0.14, 0.18); // magazine
    add(new THREE.BoxGeometry(0.05, 0.12, 0.16), wood, 0, -0.02, -0.22); // stock
    add(new THREE.BoxGeometry(0.05, 0.14, 0.08), wood, 0, -0.1, -0.05).rotation.x = 0.25; // grip
    add(new THREE.BoxGeometry(0.02, 0.04, 0.02), metal, 0, 0.06, 0.45); // sight
  } else {
    // Shotgun: twin barrels, pump, wooden stock and fore-end.
    add(new THREE.CylinderGeometry(0.035, 0.035, 0.62, 10), metal, -0.035, 0, 0.3).rotation.x = Math.PI / 2;
    add(new THREE.CylinderGeometry(0.035, 0.035, 0.62, 10), metal, 0.035, 0, 0.3).rotation.x = Math.PI / 2;
    add(new THREE.BoxGeometry(0.12, 0.09, 0.3), wood, 0, -0.03, 0.25); // pump
    add(new THREE.BoxGeometry(0.07, 0.12, 0.3), wood, 0, -0.01, -0.2); // stock
    add(new THREE.BoxGeometry(0.03, 0.04, 0.03), metal, 0, 0.05, 0.58); // bead sight
  }
  return g;
}

export class Player {
  constructor(scene) {
    const h = createHumanoid({ shirt: 0xa02828, skin: 0xe8b88a, pants: 0x2a2a30, scale: 1 });
    this.humanoid = h;
    this.group = h.group;
    scene.add(this.group);
    // Guns hang from the right hand; only the current weapon shows.
    this.gunModels = WEAPONS.map((w, i) => {
      const m = buildGunModel(i);
      m.position.set(0, -0.58, 0.08);
      m.rotation.x = Math.PI / 2 - 0.35; // barrel forward (+z of the figure)
      h.parts.armR.add(m);
      m.visible = i === 0;
      return m;
    });
    this.pos = { x: PLACES.playerStart.x, z: PLACES.playerStart.z };
    this.y = 0; this.vy = 0;
    this.yaw = Math.PI; // facing north (-z), toward the plaza
    this.pitch = 0;
    this.health = TUNING.playerHp;
    this.fireT = 0; this.reloading = 0;
    this.driving = false; this.car = null;
    this.aimPoint = { x: 0, y: 1.2, z: -10 };
    this._phase = 0;
    this._recoil = 0;
    // Weapon state: pistol owned from the start, SMG + shotgun from crates.
    this.weapons = WEAPONS.map((w, i) => ({ ...w, owned: i === 0, ammo: w.mag }));
    this.weapon = 0;
    this.ammo = this.weapons[0].ammo;
    this._syncMesh();
  }
  get weaponName() { return this.weapons[this.weapon].name; }
  get weaponMag() { return this.weapons[this.weapon].mag; }
  get weaponDamage() { return this.weapons[this.weapon].damage; }
  get weaponSpread() { return this.weapons[this.weapon].spread; }
  get weaponPellets() { return this.weapons[this.weapon].pellets; }
  get weaponRange() { return this.weapons[this.weapon].range; }
  _syncMesh() {
    this.group.position.set(this.pos.x, this.y, this.pos.z);
    this.group.rotation.y = this.yaw;
  }
  get x() { return this.pos.x; }
  get z() { return this.pos.z; }
  teleport(x, z) {
    this.pos.x = x; this.pos.z = z;
    if (this.driving && this.car) this.car.setPos(x, z, this.car.heading);
    this._syncMesh();
  }
  takeDamage(n) {
    this.health = Math.max(0, this.health - n);
    return this.health <= 0;
  }
  heal(n) { this.health = Math.min(TUNING.playerHp, this.health + n); }
  switchWeapon(i) {
    if (i < 0 || i >= this.weapons.length) return false;
    if (!this.weapons[i].owned) return false;
    if (i === this.weapon) return true;
    this.weapon = i;
    this.ammo = this.weapons[i].ammo;
    this.gunModels.forEach((m, j) => { m.visible = j === i; });
    this.reloading = 0;
    return true;
  }
  grantWeapon(i) {
    if (i < 0 || i >= this.weapons.length) return false;
    const w = this.weapons[i];
    const had = w.owned;
    w.owned = true;
    w.ammo = w.mag;
    if (!had) this.switchWeapon(i);
    return !had;
  }
  weaponState() {
    return this.weapons.map((w) => ({ owned: w.owned, ammo: w.ammo }));
  }
  loadWeaponState(state) {
    if (!Array.isArray(state)) return;
    state.forEach((s, i) => {
      if (!s || !this.weapons[i]) return;
      this.weapons[i].owned = !!s.owned;
      this.weapons[i].ammo = Math.max(0, Math.min(this.weapons[i].mag, s.ammo ?? this.weapons[i].mag));
    });
    this.gunModels.forEach((m, j) => { m.visible = j === this.weapon; });
    this.ammo = this.weapons[this.weapon].ammo;
  }
  // Returns 'fired', 'empty' or 'busy'.
  tryShoot() {
    if (this.fireT > 0 || this.reloading > 0) return 'busy';
    const w = this.weapons[this.weapon];
    if (this.ammo <= 0) { this.startReload(); return 'empty'; }
    this.ammo--;
    w.ammo = this.ammo;
    this.fireT = w.cooldown;
    this._recoil = 1;
    if (this.ammo === 0) this.startReload();
    return 'fired';
  }
  startReload() {
    const w = this.weapons[this.weapon];
    if (this.reloading > 0 || this.ammo === w.mag) return;
    this.reloading = w.reload;
  }
  update(dt, axes, mouse, colliders, jumpPressed, sprinting) {
    if (this.fireT > 0) this.fireT -= dt;
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) {
        this.reloading = 0;
        this.ammo = this.weapons[this.weapon].mag;
        this.weapons[this.weapon].ammo = this.ammo;
      }
    }
    this._recoil = Math.max(0, this._recoil - dt * 5);
    // Mouse look turns the player (third person).
    this.yaw -= mouse.dx * 0.0032;
    this.pitch = Math.max(-1.1, Math.min(1.1, this.pitch - mouse.dy * 0.0032));
    const speed = sprinting ? TUNING.sprintSpeed : TUNING.walkSpeed;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const rx = fz, rz = -fx; // right vector
    let mx = fx * axes.y + rx * axes.x;
    let mz = fz * axes.y + rz * axes.x;
    const len = Math.hypot(mx, mz);
    if (len > 0.01) { mx /= len; mz /= len; }
    const nx = this.pos.x + mx * speed * dt;
    const nz = this.pos.z + mz * speed * dt;
    const fixed = collideCircle(nx, nz, 0.55, colliders);
    this.pos.x = fixed.x; this.pos.z = fixed.z;
    // Jump + gravity.
    if (jumpPressed && this.y === 0) this.vy = TUNING.jumpSpeed;
    if (this.y > 0 || this.vy !== 0) {
      this.vy -= TUNING.gravity * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) { this.y = 0; this.vy = 0; }
    }
    // Walk/run animation, or idle breathing; reload raises the right arm.
    if (len > 0.01) {
      this._phase += (speed * dt / 0.65) * Math.PI;
      this.humanoid.setWalk(this._phase, sprinting ? 0.6 : 0.45);
    } else {
      this.humanoid.setIdle(performance.now() / 1000);
    }
    const armR = this.humanoid.parts.armR;
    if (this.reloading > 0) {
      armR.rotation.x = -1.3; // reload: raise the gun hand
      armR.rotation.z = 0.5;
    } else {
      armR.rotation.z = 0;
      armR.rotation.x += this._recoil * -0.5; // recoil kick
    }
    // Aim point: where the crosshair looks, 30m ahead of the player.
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    this.aimPoint = {
      x: this.pos.x + fx * cp * 30,
      y: 1.5 + sp * 30,
      z: this.pos.z + fz * cp * 30,
    };
    this._syncMesh();
    return len > 0.01;
  }
}
