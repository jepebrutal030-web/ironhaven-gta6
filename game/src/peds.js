// People: real humanoid figures — articulated limbs that swing, smooth-shaded
// capsules and spheres, a simple painted face, clothing colours. No boxes.
// A person is: torso (capsule), head (sphere + face plane), two arms and two
// legs (capsules pivoted at shoulder/hip) with hands and feet. Walk/run
// animation swings the limbs and bobs the body.
import * as THREE from 'three';
import { TUNING, ROADS } from './config.js';
import { collideCircle } from './city.js';

const SHIRTS = [0xc04040, 0x4060c0, 0x40a040, 0xc0a040, 0x8040a0, 0x40a0a0, 0xd0d0d0, 0x804020];
const SKINS = [0xe8b88a, 0xc98a5a, 0x8a5a38, 0xf0c8a0];

// One shared face texture: eyes, brows and a smile on a transparent plane.
let _faceTex = null;
function faceTexture() {
  if (_faceTex) return _faceTex;
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 64);
  g.fillStyle = '#1c1c22';
  g.beginPath(); g.ellipse(42, 26, 7, 9, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(86, 26, 7, 9, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#1c1c22'; g.lineWidth = 4; g.lineCap = 'round';
  g.beginPath(); g.moveTo(32, 14); g.lineTo(52, 12); g.stroke();
  g.beginPath(); g.moveTo(76, 12); g.lineTo(96, 14); g.stroke();
  g.beginPath(); g.arc(64, 40, 12, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  _faceTex = t;
  return t;
}

const _skinMats = new Map();
const _shirtMats = new Map();
function matFor(map, color, opts = {}) {
  if (!map.has(color)) {
    // Lambert, not Phong: per-fragment specular is far too slow on
    // software rendering, and the look is nearly identical at this scale.
    map.set(color, new THREE.MeshLambertMaterial({ color, ...opts }));
  }
  return map.get(color);
}

// Build one articulated humanoid. Returns {group, parts, setWalk, fall}.
// The figure faces +z; `facing` rotates the group. Limbs pivot at the joint.
const HAIRS = [0x1c1c20, 0x3a2a1a, 0x6a6a6a, 0x8a5a2a, 0xc0a040];

export function createHumanoid({ shirt, skin, pants = 0x2a2a30, band = false, cap = false, hair = null, badge = false, scale = 1 }) {
  const g = new THREE.Group();
  const shirtMat = matFor(_shirtMats, shirt);
  const skinMat = matFor(_skinMats, skin);
  const pantsMat = matFor(_shirtMats, pants);
  // Torso: a smooth capsule. Only the torso casts a shadow (one caster per
  // person keeps the shadow pass cheap on software rendering).
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.5, 6, 16), shirtMat);
  torso.position.y = 1.08; torso.castShadow = true;
  g.add(torso);
  // Head: a smooth sphere with a face plane on the front (+z).
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 24, 18), skinMat);
  head.position.y = 1.62;
  g.add(head);
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(0.3, 0.15),
    new THREE.MeshBasicMaterial({ map: faceTexture(), transparent: true, depthWrite: false }),
  );
  face.position.set(0, 1.62, 0.185);
  g.add(face);
  if (band) {
    const b = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.035, 8, 20), matFor(_shirtMats, 0xd81f2a));
    b.position.y = 1.7; b.rotation.x = Math.PI / 2;
    g.add(b);
  }
  if (hair !== null && hair !== undefined) {
    // Hair: a smooth cap over the top of the head.
    const hm = new THREE.Mesh(new THREE.SphereGeometry(0.215, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), matFor(_shirtMats, hair));
    hm.position.y = 1.64;
    g.add(hm);
  }
  if (badge) {
    // Police badge: a small gold shield on the chest.
    const bg = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.11, 0.02), matFor(_shirtMats, 0xffd23e));
    bg.position.set(-0.1, 1.25, 0.26);
    g.add(bg);
  }
  if (cap) {
    const c = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.45), matFor(_shirtMats, 0x1a2a4a));
    c.position.y = 1.66; g.add(c);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.03, 16, 1, false, -0.6, 1.2), matFor(_shirtMats, 0x1a2a4a));
    brim.position.set(0, 1.68, 0.1); g.add(brim);
  }
  // Arms: pivoted at the shoulder, capsule + hand sphere.
  const mkArm = (side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.33, 1.36, 0);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.42, 4, 12), shirtMat);
    arm.position.y = -0.28;
    pivot.add(arm);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 10), skinMat);
    hand.position.y = -0.58; pivot.add(hand);
    g.add(pivot);
    return pivot;
  };
  // Legs: pivoted at the hip, capsule + foot.
  // No separate foot mesh: the capsule's rounded end reads as a shoe at
  // street distance and saves two draw calls per person.
  const mkLeg = (side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.14, 0.8, 0);
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.105, 0.5, 4, 12), pantsMat);
    leg.position.y = -0.34;
    pivot.add(leg);
    g.add(pivot);
    return pivot;
  };
  const armL = mkArm(-1), armR = mkArm(1);
  const legL = mkLeg(-1), legR = mkLeg(1);
  g.scale.setScalar(scale);
  const parts = { torso, head, face, armL, armR, legL, legR };
  return {
    group: g, parts,
    // Walk/run: limbs swing in opposition, body bobs and leans.
    setWalk(phase, amp) {
      const s = Math.sin(phase);
      legL.rotation.x = amp * s;
      legR.rotation.x = -amp * s;
      armL.rotation.x = -amp * 0.8 * s;
      armR.rotation.x = amp * 0.8 * s;
      torso.position.y = 1.08 + Math.abs(Math.cos(phase)) * 0.045 * amp;
      torso.rotation.x = amp * 0.12;
    },
    setIdle(t) {
      legL.rotation.x = 0; legR.rotation.x = 0;
      armL.rotation.x = Math.sin(t * 1.4) * 0.05;
      armR.rotation.x = -Math.sin(t * 1.4) * 0.05;
      torso.position.y = 1.08 + Math.sin(t * 2) * 0.01;
      torso.rotation.x = 0;
    },
  };
}

class Person {
  constructor(scene, x, z, opts) {
    const h = createHumanoid(opts);
    this.humanoid = h;
    this.group = h.group;
    this.group.position.set(x, 0, z);
    scene.add(this.group);
    this.pos = { x, z };
    this.state = 'active';
    this.speed = 0;
    this.target = { x, z };
    this.health = TUNING.hostileHp;
    this.fleeT = 0;
    this._phase = Math.random() * Math.PI * 2;
  }
  flee(fromX, fromZ) {
    if (this.state !== 'active') return;
    const dx = this.pos.x - fromX, dz = this.pos.z - fromZ;
    const d = Math.hypot(dx, dz) || 1;
    this.target = { x: this.pos.x + (dx / d) * 30, z: this.pos.z + (dz / d) * 30 };
    this.fleeT = 3;
  }
  fall() {
    if (this.state === 'fallen') return;
    this.state = 'fallen';
    this.group.rotation.z = Math.PI / 2;
    this.group.position.y = 0.25;
  }
  moveToward(tx, tz, speed, dt, colliders) {
    // The mesh is the visual truth: if something moved it (a spawn, a pin),
    // the logical position follows it before walking on.
    this.pos.x = this.group.position.x;
    this.pos.z = this.group.position.z;
    const dx = tx - this.pos.x, dz = tz - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) return true;
    const step = Math.min(d, speed * dt);
    const nx = this.pos.x + (dx / d) * step;
    const nz = this.pos.z + (dz / d) * step;
    const fixed = collideCircle(nx, nz, 0.5, colliders);
    this.pos.x = fixed.x; this.pos.z = fixed.z;
    this.group.position.set(fixed.x, this.group.position.y, fixed.z);
    this.group.rotation.y = Math.atan2(dx, dz);
    this._phase += (step / 0.65) * Math.PI;
    this.humanoid.setWalk(this._phase, Math.min(0.55, 0.25 + speed * 0.09));
    return d - step < 0.5;
  }
}

export class Peds {
  constructor(scene, rng, colliders) {
    this.scene = scene; this.rng = rng; this.colliders = colliders;
    this.peds = []; this.hostiles = [];
    for (let i = 0; i < TUNING.pedCount; i++) {
      const p = new Person(scene, 0, 0, {
        shirt: this.rng.pick(SHIRTS), skin: this.rng.pick(SKINS),
        pants: this.rng.pick([0x2a2a30, 0x3a3a44, 0x5a4a38, 0x24303e]),
        hair: this.rng.pick(HAIRS),
      });
      this._placeOnSidewalk(p);
      p.speed = TUNING.pedSpeed * this.rng.range(0.7, 1.3);
      this.peds.push(p);
    }
  }
  _placeOnSidewalk(p) {
    const road = this.rng.pick(ROADS);
    const along = this.rng.range(-180, 180);
    const side = this.rng.chance(0.5) ? 7 : -7;
    if (this.rng.chance(0.5)) { p.pos.x = along; p.pos.z = road + side; }
    else { p.pos.x = road + side; p.pos.z = along; }
    p.group.position.set(p.pos.x, 0, p.pos.z);
    p.target = { ...p.pos };
  }
  _randomSidewalkTarget(from = null) {
    // Sometimes cross the road at a crosswalk: same road, opposite sidewalk.
    if (from && this.rng.chance(0.35)) {
      const road = this.rng.pick(ROADS);
      const along = this.rng.range(-180, 180);
      const side = this.rng.chance(0.5) ? 7 : -7;
      return this.rng.chance(0.5)
        ? { x: along, z: road + side }
        : { x: road + side, z: along };
    }
    const road = this.rng.pick(ROADS);
    const along = this.rng.range(-180, 180);
    const side = this.rng.chance(0.5) ? 7 : -7;
    return this.rng.chance(0.5)
      ? { x: along, z: road + side }
      : { x: road + side, z: along };
  }
  update(dt) {
    for (const p of this.peds) {
      if (p.state !== 'active') continue;
      if (p.fleeT > 0) {
        p.fleeT -= dt;
        if (p.moveToward(p.target.x, p.target.z, p.speed * 2.2, dt, this.colliders)) {
          p.fleeT = 0;
          p.target = this._randomSidewalkTarget();
        }
        continue;
      }
      if (p.moveToward(p.target.x, p.target.z, p.speed, dt, this.colliders)) {
        p.target = this._randomSidewalkTarget(p);
      }
    }
  }
  // Gunfire nearby: pedestrians within 25m run away from the shot.
  fleeFrom(x, z) {
    for (const p of this.peds) {
      if (p.state !== 'active') continue;
      if (Math.hypot(p.pos.x - x, p.pos.z - z) < 25) p.flee(x, z);
    }
  }
  // Spawn `n` hostiles around `centre` for a kill step. Clears old ones first.
  spawnHostiles(n, centre) {
    for (const h of this.hostiles) this.scene.remove(h.group);
    this.hostiles = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const x = centre.x + Math.cos(a) * 10, z = centre.z + Math.sin(a) * 10;
      const h = new Person(this.scene, x, z, {
        shirt: 0x222222, skin: this.rng.pick(SKINS), band: true, pants: 0x1c1c20,
      });
      h.speed = 3.0;
      h.shootT = this.rng.range(0.5, 1.5);
      h.target = { x: centre.x, z: centre.z };
      this.hostiles.push(h);
    }
    return this.hostiles;
  }
  clearHostiles() {
    for (const h of this.hostiles) this.scene.remove(h.group);
    this.hostiles = [];
  }
  // Hostiles chase the player and shoot when in range. Returns true when a
  // hostile's shot hits (the game applies the damage).
  updateHostiles(dt, playerPos, onShot) {
    for (const h of this.hostiles) {
      if (h.state !== 'active') continue;
      const dx = playerPos.x - h.pos.x, dz = playerPos.z - h.pos.z;
      const d = Math.hypot(dx, dz);
      h.target = { x: playerPos.x, z: playerPos.z };
      if (d > 13) h.moveToward(h.target.x, h.target.z, h.speed, dt, this.colliders);
      else {
        h.group.rotation.y = Math.atan2(dx, dz);
        h.humanoid.setWalk(h._phase, 0); // aim stance, legs still
      }
      h.shootT -= dt;
      if (h.shootT <= 0 && d < TUNING.hostileRange) {
        h.shootT = TUNING.hostileShootEvery;
        if (this.rng.chance(0.5)) onShot(h);
      }
    }
  }
}

export function makeFootCop(scene, x, z) {
  const cop = new Person(scene, x, z, { shirt: 0x1a2a4a, skin: 0xe8b88a, cap: true, badge: true, hair: 0x1c1c20, pants: 0x1a2a4a });
  cop.speed = 4.6;
  cop.arrestT = 0;
  return cop;
}
