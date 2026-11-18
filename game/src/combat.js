// Combat: hitscan shooting with aim correction, per-weapon stats (damage,
// spread, pellets, range), a muzzle flash (light + sprite), recoil tracers,
// ejected shell casings, crash-damage smoke, and weapon pickup crates
// (SMG + Shotgun) placed around the city.
import * as THREE from 'three';
import { TUNING, CRATE_SPOTS } from './config.js';

// Short-lived particles: muzzle flash, shell casings, smoke puffs.
export class FX {
  constructor(scene) {
    this.scene = scene;
    this.parts = [];
    this.flashLight = new THREE.PointLight(0xffc860, 0, 14, 1.6);
    scene.add(this.flashLight);
    this._flashT = 0;
    // One shared flash sprite texture (radial gradient).
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, 'rgba(255,240,180,1)');
    grad.addColorStop(0.4, 'rgba(255,160,60,0.8)');
    grad.addColorStop(1, 'rgba(255,120,0,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    this.flashTex = tex;
    this.flashSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.flashSprite.scale.set(0.9, 0.9, 1);
    this.flashSprite.visible = false;
    scene.add(this.flashSprite);
    this._shellGeo = new THREE.BoxGeometry(0.03, 0.03, 0.09);
    this._shellMat = new THREE.MeshPhongMaterial({ color: 0xd8b25e, shininess: 80 });
    this._smokeGeo = new THREE.SphereGeometry(0.5, 8, 6);
    this._smokeMat = new THREE.MeshLambertMaterial({ color: 0x555555, transparent: true, opacity: 0.45 });
  }
  muzzle(at, dir) {
    this.flashLight.position.set(at.x, at.y, at.z);
    this.flashLight.intensity = 26;
    this._flashT = 0.06;
    this.flashSprite.position.set(at.x + dir.x * 0.4, at.y + dir.y * 0.4, at.z + dir.z * 0.4);
    this.flashSprite.visible = true;
  }
  shell(at, right) {
    if (this.parts.filter((p) => p.kind === 'shell').length > 24) return;
    const m = new THREE.Mesh(this._shellGeo, this._shellMat);
    m.position.set(at.x, at.y, at.z);
    this.scene.add(m);
    this.parts.push({
      kind: 'shell', mesh: m, life: 0.7,
      vel: { x: right.x * 1.6 + (Math.random() - 0.5), y: 1.6 + Math.random(), z: right.z * 1.6 + (Math.random() - 0.5) },
      spin: (Math.random() - 0.5) * 14,
    });
  }
  smoke(at) {
    if (this.parts.filter((p) => p.kind === 'smoke').length > 14) return;
    const m = new THREE.Mesh(this._smokeGeo, this._smokeMat.clone());
    m.position.set(at.x + (Math.random() - 0.5) * 0.6, at.y, at.z + (Math.random() - 0.5) * 0.6);
    m.scale.setScalar(0.5);
    this.scene.add(m);
    this.parts.push({ kind: 'smoke', mesh: m, life: 1.6, vel: { x: 0, y: 1.1, z: 0 }, spin: 0 });
  }
  update(dt) {
    if (this._flashT > 0) {
      this._flashT -= dt;
      if (this._flashT <= 0) {
        this.flashLight.intensity = 0;
        this.flashSprite.visible = false;
      }
    }
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        if (p.kind === 'smoke') p.mesh.material.dispose();
        this.parts.splice(i, 1);
        continue;
      }
      p.vel.y -= p.kind === 'shell' ? 12 * dt : 0;
      p.mesh.position.x += p.vel.x * dt;
      p.mesh.position.y = Math.max(0.05, p.mesh.position.y + p.vel.y * dt);
      p.mesh.position.z += p.vel.z * dt;
      if (p.kind === 'shell') p.mesh.rotation.x += p.spin * dt;
      else {
        p.mesh.scale.setScalar(p.mesh.scale.x + dt * 0.9);
        p.mesh.material.opacity = Math.max(0, p.life / 1.6) * 0.45;
      }
    }
  }
}

export class Combat {
  constructor(scene) {
    this.scene = scene;
    this.tracers = [];
    this.tracerMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 });
    this.tracerGeo = new THREE.BoxGeometry(0.05, 0.05, 1);
    this.fx = new FX(scene);
    // Weapon crates: wooden boxes with a painted weapon label.
    this.crates = [];
    const crateGeo = new THREE.BoxGeometry(1.1, 0.8, 1.1);
    const crateMat = new THREE.MeshLambertMaterial({ color: 0x6a4a2a });
    const lidMat = new THREE.MeshLambertMaterial({ color: 0x8a6a3a });
    CRATE_SPOTS.forEach((spot, i) => {
      const g = new THREE.Group();
      const box = new THREE.Mesh(crateGeo, crateMat);
      box.position.y = 0.4; box.castShadow = true;
      g.add(box);
      const lid = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 1.2), lidMat);
      lid.position.y = 0.86;
      g.add(lid);
      const label = new THREE.Mesh(
        new THREE.PlaneGeometry(0.9, 0.45),
        new THREE.MeshBasicMaterial({ color: i % 2 === 0 ? 0xffd23e : 0x7fd0ff, transparent: true, opacity: 0.9 }),
      );
      label.position.set(0, 0.93, 0);
      label.rotation.x = -Math.PI / 2;
      g.add(label);
      g.position.set(spot.x, 0, spot.z);
      scene.add(g);
      this.crates.push({ group: g, x: spot.x, z: spot.z, weapon: i % 2 === 0 ? 1 : 2, taken: false });
    });
  }
  _spawnTracer(from, to) {
    const len = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
    if (len < 0.1) return;
    const m = new THREE.Mesh(this.tracerGeo, this.tracerMat.clone());
    m.position.set((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
    m.lookAt(to.x, to.y, to.z);
    m.scale.set(1, 1, len);
    this.scene.add(m);
    this.tracers.push({ mesh: m, life: 0.09 });
  }
  update(dt) {
    this.fx.update(dt);
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      if (t.life <= 0) {
        this.scene.remove(t.mesh);
        t.mesh.material.dispose();
        this.tracers.splice(i, 1);
      } else {
        t.mesh.material.opacity = Math.max(0, t.life / 0.09) * 0.9;
      }
    }
  }
  // Walk over a crate to pick its weapon up. Returns the weapon index or -1.
  checkPickup(playerPos) {
    for (const c of this.crates) {
      if (c.taken) continue;
      if (Math.hypot(c.x - playerPos.x, c.z - playerPos.z) < 1.8) {
        c.taken = true;
        this.scene.remove(c.group);
        return c.weapon;
      }
    }
    return -1;
  }
  // Fire from the player's chest toward the aim point. Returns the person hit
  // (hostile or foot cop) or null. `targets` are {pos, group, health, state}.
  // `opts` carries the current weapon: {damage, spread, pellets, range}.
  fire(from, aim, targets, opts = {}) {
    const damage = opts.damage ?? TUNING.gunDamage;
    const spread = opts.spread ?? 0.012;
    const pellets = opts.pellets ?? 1;
    const range = opts.range ?? TUNING.gunRange;
    const dx = aim.x - from.x, dy = aim.y - from.y, dz = aim.z - from.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    const baseDir = { x: dx / len, y: dy / len, z: dz / len };
    this.fx.muzzle(from, baseDir);
    const right = { x: Math.cos(Math.atan2(dx, dz)), y: 0, z: -Math.sin(Math.atan2(dx, dz)) };
    this.fx.shell(from, right);
    let hitAny = null;
    for (let p = 0; p < pellets; p++) {
      // Each pellet gets its own spread jitter.
      const jx = (Math.random() - 0.5) * 2 * spread;
      const jy = (Math.random() - 0.5) * 2 * spread;
      const dir = {
        x: baseDir.x + jx,
        y: baseDir.y + jy,
        z: baseDir.z + (Math.random() - 0.5) * 2 * spread,
      };
      const dl = Math.hypot(dir.x, dir.y, dir.z) || 1;
      dir.x /= dl; dir.y /= dl; dir.z /= dl;
      const end = { x: from.x + dir.x * range, y: from.y + dir.y * range, z: from.z + dir.z * range };
      let best = null, bestAlong = Infinity;
      for (const t of targets) {
        if (!t || t.state !== 'active') continue;
        const cx = t.pos.x, cy = 1.2, cz = t.pos.z;
        const px = cx - from.x, py = cy - from.y, pz = cz - from.z;
        const along = px * dir.x + py * dir.y + pz * dir.z;
        if (along < 0 || along > range) continue;
        const qx = from.x + dir.x * along, qy = from.y + dir.y * along, qz = from.z + dir.z * along;
        const perp = Math.hypot(cx - qx, cy - qy, cz - qz);
        if (perp < 1.6 && along < bestAlong) { best = t; bestAlong = along; }
      }
      const hitPoint = best
        ? { x: best.pos.x, y: 1.2, z: best.pos.z }
        : end;
      if (pellets <= 1 || p < 3) this._spawnTracer({ x: from.x, y: from.y, z: from.z }, hitPoint);
      if (best) {
        best.health -= damage;
        if (best.health <= 0) best.fall();
        hitAny = best;
      }
    }
    return hitAny;
  }
}
