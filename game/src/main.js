// IRONHAVEN — the game: renderer, loop, camera, mode machine, and the
// window.IRONHAVEN interface the tests and the screenshot staging use.
// Look: golden-hour sun with long soft shadows (PCFSoft), a gradient sky
// dome with a visible sun and drifting clouds, ACES tone mapping, fog.
import * as THREE from 'three';
import { CITY, HALF, PLACES, TUNING, SKY, MISSIONS } from './config.js';
import { RNG, worldSeed } from './random.js';
import { AudioSys } from './audio.js';
import { Input } from './input.js';
import { createCity } from './city.js';
import { Traffic, driveCar } from './vehicles.js';
import { Peds } from './peds.js';
import { Player } from './player.js';
import { Combat } from './combat.js';
import { Wanted } from './police.js';
import { Missions } from './missions.js';
import { HUD, setHasSave } from './hud.js';
import { hasSave, saveGame, loadGame, clearSave } from './save.js';
import { stageShot } from './shots.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

// Golden-hour sky: a big gradient dome (warm horizon, blue zenith) with a
// visible sun disc, drawn as a canvas texture on a back-facing sphere.
function skyDomeTexture() {
  const c = document.createElement('canvas'); c.width = 16; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0.0, '#2a5a9a');
  grad.addColorStop(0.45, '#7fb0e0');
  grad.addColorStop(0.72, '#ffd9a0');
  grad.addColorStop(0.85, '#ffb36b');
  grad.addColorStop(1.0, '#e8905a');
  g.fillStyle = grad;
  g.fillRect(0, 0, 16, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Game {
  constructor() {
    this.rng = new RNG(worldSeed());
    this.mode = 'menu';
    this.money = 0; this.kills = 0;
    this.ready = false;
    this._lastDamageT = -99; this._time = 0;
    this._coasting = [];
    this._orbit = 0; this._menuT = 0;
    this._camYaw = Math.PI; this._camPitch = 0; this._camDist = 6;
    this._prevSpace = false;
    this._smokeT = 0;
    this._doorT = 0; this._doorCar = null; // doors close shortly after entry

    const canvasHost = document.getElementById('app') || document.body;
    // HD renderer: antialias, capped pixel ratio, sRGB, ACES tone mapping,
    // PCF soft shadows.
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    canvasHost.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(SKY.fog, 150, 520);
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
    this.camera.position.set(0, 120, 180);
    this.camera.lookAt(0, 0, 0);
    // Sky dome + visible sun disc.
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(900, 24, 16),
      new THREE.MeshBasicMaterial({ map: skyDomeTexture(), side: THREE.BackSide, fog: false }),
    );
    this.scene.add(sky);
    this._sky = sky;
    const sunDir = new THREE.Vector3(SKY.sunDir.x, SKY.sunDir.y, SKY.sunDir.z).normalize();
    this._sunDir = sunDir;
    const sunDisc = new THREE.Mesh(
      new THREE.CircleGeometry(34, 24),
      new THREE.MeshBasicMaterial({ color: 0xfff2c0, fog: false }),
    );
    sunDisc.position.copy(sunDir).multiplyScalar(860);
    sunDisc.lookAt(0, 0, 0);
    this.scene.add(sunDisc);
    // Golden-hour lighting: warm directional sun + strong hemisphere fill
    // so the shadow sides of buildings stay readable, not black.
    const hemi = new THREE.HemisphereLight(SKY.hemiSky, SKY.hemiGround, 1.05);
    this.scene.add(hemi);
    this.scene.add(new THREE.AmbientLight(0xffe0b8, 0.35));
    const sun = new THREE.DirectionalLight(SKY.sun, 2.4);
    sun.castShadow = true;
    // 512 map + a tight frustum that follows the player: crisp local
    // shadows without paying for the whole city every frame.
    sun.shadow.mapSize.set(512, 512);
    sun.shadow.camera.left = -75; sun.shadow.camera.right = 75;
    sun.shadow.camera.top = 75; sun.shadow.camera.bottom = -75;
    sun.shadow.camera.near = 10; sun.shadow.camera.far = 480;
    sun.shadow.bias = -0.0006;
    this.scene.add(sun);
    this.scene.add(sun.target);
    this.sun = sun;

    this.city = createCity(this.scene, this.rng);
    this.colliders = this.city.colliders;
    this.traffic = new Traffic(this.scene, this.rng, this.colliders, this.city.lights);
    this.parked = this.traffic.parked;
    this.peds = new Peds(this.scene, this.rng, this.colliders);
    this.player = new Player(this.scene);
    this.combat = new Combat(this.scene);
    this.wanted = new Wanted(this.scene, this.rng, this.colliders);
    this.wanted.onBusted = () => this._busted();
    this.wanted.onRam = () => this._onRam();
    this.missions = new Missions(this);
    this.missions.onPayout = (n) => { this.money += n; this.audio.missionDone(); this.hud.showMsg(`Mission complete  +$${n}`); };
    this.missions.onFail = (name) => { this.hud.showMsg(`${name}: time up — try again`); this.audio.busted(); };
    this.missions.onAllComplete = () => { this.mode = 'complete'; this._showComplete(); };
    this.audio = new AudioSys();
    this.hud = new HUD(this.city.groundTex.image);
    this.hud.bind({
      newGame: () => this.newGame(),
      continueGame: () => this.continueGame(),
      resume: () => this.resume(),
      save: () => { this.save(); this.hud.showMsg('Game saved'); },
      restart: () => this.newGame(),
      respawn: () => this.respawn(),
    });
    this.input = new Input();
    this.input.attach(this.renderer.domElement, {
      onKey: (code) => this._onKey(code),
      onClick: () => { this.audio.ensure(); if (this.mode === 'playing') this.input.lockPointer(); },
    });
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
    this.clock = new THREE.Clock();
    setHasSave(hasSave());
    this.hud.showScreen('start');
    this.missions.start(0);
    this.mode = 'menu';
    this.loop();
    // Staged screenshots auto-start the game into a composed scene.
    const q = new URLSearchParams(location.search);
    const shot = q.get('shot');
    if (shot) {
      try { stageShot(this, shot); } catch (e) { console.error('shot staging failed', e); }
    }
    // The public interface (tests + staging).
    window.IRONHAVEN = {
      ready: false,
      game: this,
      state: () => this.state(),
      teleport: (x, z) => this.teleport(x, z),
      setWanted: (n) => this.setWanted(n),
      startMission: (i) => this.startMission(i),
      aimAt: (x, y, z) => this.aimAt(x, y, z),
      shoot: () => this.shoot(),
      save: () => this.save(),
    };
  }

  // ---- public interface ----
  loop() { this.renderer.setAnimationLoop(() => this._frame()); }
  state() {
    return {
      mode: this.mode,
      mission: this.missions.index,
      missionStep: this.missions.step,
      money: this.money,
      driving: this.player.driving,
      speed: this.player.driving && this.player.car ? Math.abs(this.player.car.speed) : 0,
      wanted: this.wanted.level,
      police: this.wanted.policeCars.length + this.wanted.footCops.length,
      kills: this.kills,
      player: { x: this.player.pos.x, z: this.player.pos.z },
    };
  }
  teleport(x, z) {
    if (this.player.driving && this.player.car) {
      this.player.car.speed = 0;
      this.player.car.setPos(x, z, this.player.car.heading);
    }
    this.player.teleport(x, z);
  }
  setWanted(n) { this.wanted.setLevel(n); }
  startMission(i) {
    this.missions.start(i);
    if (this.mode !== 'playing') { this.mode = 'playing'; this.hud.showScreen(null); }
  }
  aimAt(x, y, z) {
    if (this.player.driving) return; // third-person aim does nothing in a car
    const p = this.player.pos;
    const dx = x - p.x, dz = z - p.z;
    this.player.yaw = Math.atan2(dx, dz);
    this.player.pitch = clamp(Math.atan2(y - 1.5, Math.hypot(dx, dz)), -1.1, 1.1);
    this.player.aimPoint = { x, y, z };
    this._camYaw = this.player.yaw; this._camPitch = this.player.pitch;
  }
  shoot() {
    if (this.mode !== 'playing' || this.player.driving) return;
    const r = this.player.tryShoot();
    if (r === 'busy') return;
    if (r === 'empty') { this.audio.dryFire(); return; }
    this.audio.shoot();
    const p = this.player;
    const from = { x: p.pos.x + Math.sin(p.yaw) * 0.7, y: 1.45, z: p.pos.z + Math.cos(p.yaw) * 0.7 };
    const targets = [...this.peds.hostiles, ...this.wanted.footCops];
    const hit = this.combat.fire(from, p.aimPoint, targets, {
      damage: p.weaponDamage, spread: p.weaponSpread,
      pellets: p.weaponPellets, range: p.weaponRange,
    });
    // Nearby pedestrians flee from the gunfire.
    this.peds.fleeFrom(p.pos.x, p.pos.z);
    if (hit) {
      this.hud.hitmarker(); this.audio.hit();
      if (hit.state === 'fallen') {
        this.kills++;
        if (this.wanted.footCops.includes(hit)) this.wanted.add(1);
      }
    }
  }
  save() {
    return saveGame({
      money: this.money, mission: this.missions.index, step: this.missions.step,
      px: this.player.pos.x, pz: this.player.pos.z,
      health: this.player.health, kills: this.kills, wanted: this.wanted.level,
      weapons: this.player.weaponState(), weapon: this.player.weapon,
    });
  }

  // ---- mode flow ----
  newGame() {
    this.audio.ensure(); this.audio.startMusic();
    this.money = 0; this.kills = 0;
    this.player.health = 100;
    this.player.weapons = this.player.weapons.map((w, i) => ({ ...w, owned: i === 0, ammo: w.mag }));
    this.player.weapon = 0; this.player.ammo = this.player.weapons[0].ammo;
    this.player.gunModels.forEach((m, j) => { m.visible = j === 0; });
    this.player.reloading = 0; this.player.fireT = 0;
    this.player.driving = false; this.player.car = null;
    this.player.group.visible = true;
    this.player.teleport(PLACES.playerStart.x, PLACES.playerStart.z);
    this.player.yaw = Math.PI; this.player.pitch = 0;
    this.wanted.setLevel(0);
    this.peds.clearHostiles();
    this.missions.start(0);
    this.mode = 'playing';
    this.hud.showScreen(null);
    this.input.unlockPointer();
  }
  continueGame() {
    const s = loadGame();
    if (!s) { this.newGame(); return; }
    this.audio.ensure(); this.audio.startMusic();
    this.money = s.money || 0; this.kills = s.kills || 0;
    this.player.health = s.health ?? 100;
    if (s.weapons) this.player.loadWeaponState(s.weapons);
    if (typeof s.weapon === 'number') this.player.switchWeapon(s.weapon);
    this.player.reloading = 0; this.player.fireT = 0;
    this.player.driving = false; this.player.car = null;
    this.player.group.visible = true;
    this.player.teleport(s.px ?? PLACES.playerStart.x, s.pz ?? PLACES.playerStart.z);
    this.player.yaw = Math.PI; this.player.pitch = 0;
    this.wanted.setLevel(0);
    this.peds.clearHostiles();
    this.missions.index = s.mission || 0; this.missions.step = s.step || 0;
    this.missions.timer = this.missions.def?.timer ?? null;
    this.missions.timerMax = this.missions.timer;
    this.missions.beginStep();
    if (s.wanted) this.wanted.setLevel(s.wanted);
    this.mode = 'playing';
    this.hud.showScreen(null);
  }
  respawn() {
    this.audio.ensure();
    this.player.health = 100;
    this.player.ammo = this.player.weaponMag;
    this.player.weapons[this.player.weapon].ammo = this.player.ammo;
    this.wanted.setLevel(0);
    if (this.player.driving) this._exitCar();
    this.player.teleport(PLACES.hideout.x, PLACES.hideout.z);
    this.mode = 'playing';
    this.hud.showScreen(null);
  }
  resume() { if (this.mode === 'paused') { this.mode = 'playing'; this.hud.showScreen(null); } }
  pause() {
    if (this.mode !== 'playing') return;
    this.mode = 'paused';
    this.hud.showScreen('pause');
    this.input.unlockPointer();
  }
  _busted() {
    if (this.mode !== 'playing') return;
    this.mode = 'busted';
    this.wanted.setLevel(0);
    this.audio.busted();
    this.hud.showScreen('busted');
    this.input.unlockPointer();
  }
  _wasted() {
    if (this.mode !== 'playing') return;
    this.mode = 'wasted';
    this.audio.wasted();
    this.hud.showScreen('wasted');
    this.input.unlockPointer();
  }
  _showComplete() {
    const el = document.getElementById('complete-stats');
    if (el) el.textContent = `All five jobs done. You leave Ironhaven with $${this.money} and ${this.kills} Vultures down.`;
    this.audio.missionDone();
    this.hud.showScreen('complete');
    this.input.unlockPointer();
  }
  _onRam() {
    if (this.mode !== 'playing') return;
    this.audio.crash();
    this.hud.flashDamage();
    this._lastDamageT = this._time;
    if (this.player.takeDamage(TUNING.ramDamage)) this._wasted();
  }

  _onKey(code) {
    if (code === 'KeyM') { this.audio.ensure(); this.audio.setMuted(!this.audio.muted); return; }
    if (code === 'KeyP') { if (this.mode === 'playing') this.pause(); else if (this.mode === 'paused') this.resume(); return; }
    if (this.mode !== 'playing') return;
    if (code === 'KeyR') { this.player.startReload(); this.audio.reload(); }
    if (code === 'Digit1' || code === 'Digit2' || code === 'Digit3') {
      const i = Number(code.slice(-1)) - 1;
      if (this.player.switchWeapon(i)) { this.audio.reload(); this.hud.showMsg(this.player.weaponName); }
      return;
    }
    if (code === 'KeyE') {
      if (this.player.driving) this._exitCar();
      else this._enterCar();
    }
  }
  _enterCar() {
    let best = null, bestD = TUNING.enterRadius;
    for (const c of this.parked) {
      if (c.taken) continue;
      const d = Math.hypot(c.x - this.player.pos.x, c.z - this.player.pos.z);
      if (d < bestD) { best = c; bestD = d; }
    }
    if (!best) return;
    this.enterCar(best);
  }
  enterCar(car) {
    this.player.driving = true;
    this.player.car = car;
    car.taken = true;
    car.speed = car.speed || 0;
    car.setDoor(true);
    this._doorCar = car; this._doorT = 0.25; // door swings shut after entry
    this.player.group.visible = false;
    this.audio.engine(0, 1);
  }
  _exitCar() {
    const car = this.player.car;
    if (!car) return;
    const rx = Math.cos(car.heading), rz = -Math.sin(car.heading);
    const px = car.x + rx * 2.6, pz = car.z + rz * 2.6;
    this.player.driving = false; this.player.car = null;
    car.taken = false;
    car.setDoor(true);
    this._doorCar = car; this._doorT = 0.25; // door swings shut after exit
    this.player.group.visible = true;
    this.player.yaw = car.heading;
    this.player.teleport(px, pz);
    if (Math.abs(car.speed) > 0.5) this._coasting.push(car);
  }

  // ---- frame ----
  _frame() {
    // dt is clamped so a slow frame never jumps the simulation: 0.2s keeps
    // the game playable on software rendering (SwiftShader ~1 FPS) while
    // never engaging on a real 60 FPS machine (dt ~0.016s).
    const dt = Math.min(0.2, this.clock.getDelta() || 0.016);
    this._time += dt;
    if (this.mode === 'playing') this._update(dt);
    this._updateCamera(dt);
    this._renderHud(dt);
    this.renderer.render(this.scene, this.camera);
    if (!this.ready) { this.ready = true; window.IRONHAVEN.ready = true; }
  }
  _update(dt) {
    // Doors swing shut shortly after entering or exiting a car.
    if (this._doorT > 0) {
      this._doorT -= dt;
      if (this._doorT <= 0 && this._doorCar) { this._doorCar.setDoor(false); this._doorCar = null; }
    }
    const axes = this.input.axes();
    const mouse = this.input.consumeMouse();
    const space = this.input.down('Space');
    const jump = space && !this._prevSpace;
    this._prevSpace = space;
    const sprint = this.input.down('ShiftLeft') || this.input.down('ShiftRight');
    if (this.player.driving && this.player.car) {
      const car = this.player.car;
      const hit = driveCar(car, axes, dt, this.colliders, { handbrake: space, boost: sprint });
      // The player's logical position rides with the car (missions, wanted,
      // HUD and the tests all read player.pos).
      this.player.pos.x = car.x;
      this.player.pos.z = car.z;
      if (hit) {
        this.audio.crash(); this.hud.flashDamage();
        car.damage += 12;
      }
      if (space && Math.abs(car.speed) > 10) this.audio.skid();
      // Crash damage: a battered car smokes.
      if (car.damage > 40) {
        this._smokeT -= dt;
        if (this._smokeT <= 0) {
          this._smokeT = 0.25;
          this.combat.fx.smoke({ x: car.x, y: 1.2, z: car.z });
        }
      }
      // Camera orbit offset from the mouse while driving.
      this._orbit = THREE.MathUtils.clamp(this._orbit - mouse.dx * 0.003, -1.2, 1.2);
      if (this.traffic.ramCheck(car)) { this.audio.crash(); car.damage += 8; }
      // Running over a pedestrian: they fall, and the law notices.
      for (const p of this.peds.peds) {
        if (p.state !== 'active') continue;
        if (Math.hypot(p.pos.x - car.x, p.pos.z - car.z) < 2.2 && Math.abs(car.speed) > 4) {
          p.fall();
          this.wanted.add(TUNING.wantedOnPedHit);
          this.audio.crash();
        }
      }
      this.audio.engine(car.speed, car.model.top);
    } else {
      this._orbit = 0;
      this.player.update(dt, axes, mouse, this.colliders, jump, sprint);
      this.audio.engine(0, 1);
      // Weapon crates: walk over one to pick its weapon up.
      const got = this.combat.checkPickup(this.player.pos);
      if (got >= 0) {
        this.player.grantWeapon(got);
        this.audio.pickup();
        this.hud.showMsg(`Picked up ${this.player.weaponName} — press ${got + 1} to switch`);
      }
    }
    // Coasting cars the player just left keep rolling, then stop.
    for (let i = this._coasting.length - 1; i >= 0; i--) {
      const c = this._coasting[i];
      driveCar(c, { x: 0, y: 0 }, dt, this.colliders);
      if (Math.abs(c.speed) < 0.5) { c.speed = 0; this._coasting.splice(i, 1); }
    }
    this.city.update(dt);
    this.traffic.update(dt, this.player.driving ? this.player.car : null);
    this.peds.update(dt);
    this.peds.updateHostiles(dt, this.player.pos, (h) => {
      if (this.mode !== 'playing') return;
      this._lastDamageT = this._time;
      this.hud.flashDamage();
      if (this.player.takeDamage(TUNING.hostileDamage)) this._wasted();
    });
    this.wanted.update(dt, this.player, this.player.driving ? this.player.car : null);
    this.missions.update(dt);
    this.combat.update(dt);
    // Slow health regen out of combat.
    if (this._time - this._lastDamageT > 5 && this.player.health > 0) {
      this.player.heal(2 * dt);
    }
    this.audio.musicTick();
    this.audio.siren(this.wanted.level > 0);
  }
  _updateCamera(dt) {
    const p = this.player;
    if (this.mode === 'menu') {
      this._menuT += dt * 0.05;
      const a = this._menuT;
      this.camera.position.set(Math.sin(a) * 190, 115, Math.cos(a) * 190);
      this.camera.lookAt(0, 0, 0);
      return;
    }
    let targetYaw, targetPitch, dist, height, look;
    if (p.driving && p.car) {
      targetYaw = p.car.heading + this._orbit;
      targetPitch = 0.1; dist = 9.5; height = 4.2;
      look = { x: p.car.x + Math.sin(targetYaw) * 6, y: 1.6, z: p.car.z + Math.cos(targetYaw) * 6 };
    } else {
      targetYaw = p.yaw; targetPitch = p.pitch; dist = 6; height = 2.8;
      look = { x: p.pos.x + Math.sin(p.yaw) * 3, y: 1.5 + Math.sin(p.pitch) * 3, z: p.pos.z + Math.cos(p.yaw) * 3 };
    }
    const k = 1 - Math.exp(-8 * dt);
    this._camYaw = lerpAngle(this._camYaw, targetYaw, k);
    this._camPitch += (targetPitch - this._camPitch) * k;
    this._camDist += (dist - this._camDist) * k;
    const fx = Math.sin(this._camYaw), fz = Math.cos(this._camYaw);
    const anchor = p.driving && p.car ? { x: p.car.x, z: p.car.z } : p.pos;
    const cy = height - Math.sin(this._camPitch) * 2;
    this.camera.position.set(anchor.x - fx * this._camDist, cy, anchor.z - fz * this._camDist);
    this.camera.lookAt(look.x, look.y, look.z);
    // The sun's shadow camera follows the player so shadows stay crisp.
    const sp = this.sun.position;
    sp.set(anchor.x + this._sunDir.x * 200, this._sunDir.y * 200, anchor.z + this._sunDir.z * 200);
    this.sun.target.position.set(anchor.x, 0, anchor.z);
    this.sun.target.updateMatrixWorld();
    this._sky.position.set(anchor.x, 0, anchor.z);
  }
  _renderHud(dt) {
    const s = {
      health: this.player.health,
      money: this.money,
      wanted: this.wanted.level,
      objective: this.missions.def ? `${this.missions.index + 1}. ${this.missions.name} — ${this.missions.objective}` : '',
      dist: this.missions.distanceToBeacon(this.player.pos),
      beacon: this.missions.beacon,
      timer: this.missions.timer, timerMax: this.missions.timerMax,
      speedMph: (this.player.driving && this.player.car ? Math.abs(this.player.car.speed) : 0) * 2.23694,
      ammo: this.player.ammo, magSize: this.player.weaponMag,
      weaponName: this.player.weaponName,
      reloading: this.player.reloading,
      driving: this.player.driving, mode: this.mode, yaw: this.player.yaw,
      player: this.player.pos,
      police: [...this.wanted.policeCars, ...this.wanted.footCops],
      hostiles: this.peds.hostiles,
      traffic: this.traffic.cars.map((t) => t.car),
      parked: this.parked,
    };
    this.hud.update(dt, s);
  }
}
