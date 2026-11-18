// Cars: realistic detailed models built from smooth-shaded primitives —
// rounded extruded bodies, glossy cabins, spinning + steering wheels,
// headlights/taillights, mirrors, grilles, bumpers, license plates, doors
// that open when the player gets in or out — plus arcade driving physics
// with per-type handling and suspension, and traffic that follows lanes
// and stops at red lights.
import * as THREE from 'three';
import { CAR_MODELS, TRAFFIC_EXTRA_MODELS, POLICE_MODEL, ROADS, ROAD_W, TUNING, PLACES } from './config.js';
import { collideCircle } from './city.js';

// ---- shared geometry / material caches (perf: one set per shape) --------
const _geoCache = new Map();
const _matCache = new Map();
// Lambert for everything except glass: per-fragment specular (Phong) is far
// too slow on software rendering. Lambert keeps emissive, which is what the
// lights and plates need.
function mat(color, opts = {}) {
  const key = `${color}|${JSON.stringify(opts)}`;
  if (!_matCache.has(key)) _matCache.set(key, new THREE.MeshLambertMaterial({ color, ...opts }));
  return _matCache.get(key);
}
// One shared glossy glass material for every cabin (Phong is affordable
// for a single shared material, and glass is where the shine shows).
const _glassMat = new THREE.MeshPhongMaterial({ color: 0x2a3a4a, shininess: 90, specular: 0x99bbdd });
function roundedRectShape(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
function extrudeBody(w, h, len, r = 0.22) {
  const key = `body|${w}|${h}|${len}|${r}`;
  if (!_geoCache.has(key)) {
    const g = new THREE.ExtrudeGeometry(roundedRectShape(w, h, r), {
      depth: len - 0.3, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.09, bevelSegments: 2, curveSegments: 8,
    });
    g.translate(0, 0, -(len - 0.3) / 2);
    _geoCache.set(key, g);
  }
  return _geoCache.get(key);
}
function wheelGeo(r) {
  const key = `wheel|${r}`;
  if (!_geoCache.has(key)) _geoCache.set(key, new THREE.CylinderGeometry(r, r, 0.28, 20));
  return _geoCache.get(key);
}
function hubGeo() {
  if (!_geoCache.has('hub')) _geoCache.set('hub', new THREE.CylinderGeometry(0.16, 0.16, 0.3, 12));
  return _geoCache.get('hub');
}

// Four shared license-plate textures.
const _plates = [];
function plateTexture(i) {
  if (_plates[i]) return _plates[i];
  const c = document.createElement('canvas'); c.width = 128; c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = '#f0f0e8'; g.fillRect(0, 0, 128, 32);
  g.fillStyle = '#1a2a6a'; g.fillRect(0, 0, 128, 8);
  g.fillStyle = '#ffffff'; g.font = 'bold 7px sans-serif'; g.fillText('IRONHAVEN', 4, 7);
  g.fillStyle = '#111111'; g.font = 'bold 18px monospace';
  g.fillText(`IH-${1000 + i * 137}`, 14, 26);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  _plates[i] = t;
  return t;
}

// A car faces +z locally; heading is rotation.y. Forward = (sin h, 0, cos h).
export function makeCar(model, { police = false } = {}) {
  const g = new THREE.Group();
  const bodyG = new THREE.Group(); // suspension moves the body, not the wheels
  g.add(bodyG);
  const len = model.len, w = model.type === 'bus' ? 2.5 : 2.0;
  const bodyMat = mat(model.color);
  const glassMat = _glassMat;
  const darkMat = mat(0x16181c);
  const chromeMat = mat(0xd8dce2);
  const plateIdx = Math.floor(Math.random() * 4);

  if (model.type === 'bike') {
    // Motorcycle: two inline wheels, frame, tank, seat, handlebar.
    const frame = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.7, 8), darkMat);
    frame.rotation.x = Math.PI / 2; frame.position.y = 0.62;
    bodyG.add(frame);
    const tank = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 10), bodyMat);
    tank.scale.set(0.8, 0.7, 1.6); tank.position.set(0, 0.78, 0.25);
    bodyG.add(tank);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.7), darkMat);
    seat.position.set(0, 0.82, -0.55);
    bodyG.add(seat);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.7, 6), chromeMat);
    bar.rotation.z = Math.PI / 2; bar.position.set(0, 0.95, 0.85);
    bodyG.add(bar);
    const hl = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), mat(0xfff6c8, { emissive: 0xccaa66, emissiveIntensity: 1.2 }));
    hl.position.set(0, 0.72, 1.05);
    bodyG.add(hl);
  } else if (model.type === 'bus') {
    // City bus: tall rounded body, dark window band, destination sign.
    const body = new THREE.Mesh(extrudeBody(w, 2.4, len, 0.3), bodyMat);
    body.position.y = 1.55;
    bodyG.add(body);
    const band = new THREE.Mesh(new THREE.BoxGeometry(w - 0.15, 0.9, len - 0.6), glassMat);
    band.position.set(0, 2.15, 0);
    bodyG.add(band);
    const dest = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 0.3),
      new THREE.MeshBasicMaterial({ color: 0xffb347 }),
    );
    dest.position.set(0, 2.6, len / 2 + 0.02);
    bodyG.add(dest);
    const bumper = new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, 0.3), darkMat);
    bumper.position.set(0, 0.5, len / 2);
    bodyG.add(bumper);
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 0.18),
      new THREE.MeshBasicMaterial({ map: plateTexture(plateIdx) }),
    );
    plate.position.set(0, 0.75, len / 2 + 0.16);
    bodyG.add(plate);
  } else {
    // Lower body: rounded extruded shell.
    const bodyH = model.type === 'suv' ? 0.85 : 0.62;
    const body = new THREE.Mesh(extrudeBody(w, bodyH, len), bodyMat);
    body.position.y = 0.42 + bodyH / 2;
    body.castShadow = true;
    bodyG.add(body);
    // Cabin: glossy dark glasshouse, sloped by model type.
    const cabLen = model.type === 'pickup' ? len * 0.3 : len * 0.48;
    const cabH = model.type === 'suv' ? 0.62 : 0.52;
    const cabin = new THREE.Mesh(extrudeBody(w - 0.28, cabH, cabLen, 0.18), glassMat);
    cabin.position.set(0, 0.42 + bodyH + cabH / 2 - 0.05, model.type === 'pickup' ? len * 0.18 : -len * 0.04);
    cabin.castShadow = true;
    bodyG.add(cabin);
    // Hood scoop on sports cars, open bed on the pickup.
    if (model.type === 'coupe') {
      const scoop = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 0.9), darkMat);
      scoop.position.set(0, 0.42 + bodyH + 0.06, len * 0.3);
      bodyG.add(scoop);
    }
    if (model.type === 'pickup') {
      const bedWall = new THREE.Mesh(new THREE.BoxGeometry(w - 0.1, 0.45, 0.12), bodyMat);
      bedWall.position.set(0, 0.42 + bodyH + 0.22, -len * 0.38);
      bodyG.add(bedWall);
      for (const s of [-1, 1]) {
        const side = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.45, len * 0.42), bodyMat);
        side.position.set(s * (w / 2 - 0.08), 0.42 + bodyH + 0.22, -len * 0.22);
        bodyG.add(side);
      }
    }
    // Bumpers, grille, mirrors.
    for (const s of [1, -1]) {
      const bumper = new THREE.Mesh(new THREE.BoxGeometry(w - 0.1, 0.22, 0.22), chromeMat);
      bumper.position.set(0, 0.38, s * (len / 2 + 0.02));
      bodyG.add(bumper);
    }
    const grille = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.22, 0.08), darkMat);
    grille.position.set(0, 0.55, len / 2 + 0.06);
    bodyG.add(grille);
    // Mirrors: one small box per side (no separate stalk mesh).
    for (const s of [-1, 1]) {
      const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.12), bodyMat);
      mirror.position.set(s * (w / 2 + 0.12), 1.08, len * 0.22);
      bodyG.add(mirror);
    }
    // Headlights (emissive) + one wide taillight bar (emissive).
    const lightMat = mat(0xfff6c8, { emissive: 0xffd970, emissiveIntensity: 1.4 });
    const tailMat = mat(0xd81f2a, { emissive: 0xaa0000, emissiveIntensity: 1.2 });
    for (const s of [-1, 1]) {
      const hl = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), lightMat);
      hl.scale.set(1.4, 0.8, 0.6);
      hl.position.set(s * 0.62, 0.62, len / 2 + 0.08);
      bodyG.add(hl);
    }
    const tl = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.14, 0.08), tailMat);
    tl.position.set(0, 0.62, -len / 2 - 0.06);
    bodyG.add(tl);
    // License plate (front only; the rear carries the same plate mesh cost
    // the gate would rather spend on the street).
    const plateMat = new THREE.MeshBasicMaterial({ map: plateTexture(plateIdx) });
    const plateF = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.16), plateMat);
    plateF.position.set(0, 0.42, len / 2 + 0.14);
    bodyG.add(plateF);
    // Doors: thin panels on hinge pivots, opened on enter/exit.
    var doors = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(s * (w / 2), 0.85, len * 0.18);
      const panel = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.55, 1.1), bodyMat);
      panel.position.set(0, 0, -0.55);
      pivot.add(panel);
      bodyG.add(pivot);
      doors.push({ pivot, side: s });
    }
  }
  var doors = doors || [];
  if (police) {
    const barR = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.3), mat(0xd81f2a, { emissive: 0x880000, emissiveIntensity: 1 }));
    barR.position.set(-0.45, 1.55, -len * 0.05); bodyG.add(barR);
    const barB = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.3), mat(0x2244ff, { emissive: 0x000088, emissiveIntensity: 1 }));
    barB.position.set(0.45, 1.55, -len * 0.05); bodyG.add(barB);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, 0.18, len * 0.7), mat(0xf0f0f0));
    stripe.position.set(0, 0.62, 0); bodyG.add(stripe);
    var lightBar = { red: barR.material, blue: barB.material };
  }
  // Wheels: steer pivot (front) -> spin group -> tyre + hubcap.
  const wheels = [];
  const frontSteer = [];
  const wheelR = model.type === 'bus' ? 0.48 : model.type === 'bike' ? 0.34 : 0.36;
  const wheelZ = model.type === 'bike' ? [0.85, -0.85] : [len / 2 - 0.85, -(len / 2 - 0.85)];
  const wheelX = model.type === 'bike' ? [0] : [-1, 1];
  for (const sz of wheelZ) {
    for (const sx of wheelX) {
      const steerG = new THREE.Group();
      steerG.position.set(sx * (w / 2 - 0.05), wheelR, sz);
      const spinG = new THREE.Group();
      steerG.add(spinG);
      const tyre = new THREE.Mesh(wheelGeo(wheelR), darkMat);
      tyre.rotation.z = Math.PI / 2;
      spinG.add(tyre);
      // No separate hubcap mesh: the tyre's dark disc reads as a wheel at
      // street distance and saves a draw call per wheel.
      g.add(steerG);
      wheels.push(spinG);
      if (sz > 0 && model.type !== 'bike') frontSteer.push(steerG);
    }
  }
  const car = {
    group: g, bodyG, model, name: model.name, speed: 0, heading: 0,
    steer: 0, wheels, frontSteer, isPolice: police, taken: false,
    damage: 0, _suspT: 0, _doorOpen: false,
    // x/z are the ground position; the group y stays 0.
    get x() { return g.position.x; },
    get z() { return g.position.z; },
    setPos(x, z, heading) { g.position.set(x, 0, z); this.heading = heading; g.rotation.y = heading; },
    setDoor(open) {
      this._doorOpen = open;
      for (const d of doors) d.pivot.rotation.y = open ? -d.side * 1.05 : 0;
    },
    flash(t) {
      if (!lightBar) return;
      const on = Math.sin(t * 9) > 0;
      lightBar.red.emissiveIntensity = on ? 2.4 : 0.2;
      lightBar.blue.emissiveIntensity = on ? 0.2 : 2.4;
    },
  };
  return car;
}

// Arcade driving for the player's car. Returns true when a hard impact hit.
export function driveCar(car, axes, dt, colliders, { handbrake = false, boost = false } = {}) {
  const steerF = car.model.steer ?? 1;
  const top = car.model.top * (boost ? 1.12 : 1);
  const fwd = axes.y, steer = axes.x;
  if (fwd > 0) car.speed += car.model.accel * dt;
  else if (fwd < 0) {
    if (car.speed > 0.5) car.speed -= TUNING.carBrake * dt;
    else car.speed -= car.model.accel * 0.55 * dt;
  } else {
    car.speed -= car.speed * TUNING.carDrag * dt;
    if (Math.abs(car.speed) < 0.05) car.speed = 0;
  }
  if (handbrake) { car.speed *= Math.max(0, 1 - 2.6 * dt); }
  car.speed = Math.max(-TUNING.carReverseTop, Math.min(top, car.speed));
  // Steering fades in with speed and out at very high speed.
  const sf = Math.min(1, Math.abs(car.speed) / 4) * (1.8 / (1 + Math.abs(car.speed) / 15)) * steerF;
  car.heading += steer * sf * (handbrake ? 1.7 : 1) * dt * (car.speed < 0 ? -1 : 1);
  car.steer = steer;
  const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
  const nx = car.x + fx * car.speed * dt;
  const nz = car.z + fz * car.speed * dt;
  const before = { x: car.x, z: car.z };
  const fixed = collideCircle(nx, nz, 1.9, colliders);
  const hit = Math.hypot(fixed.x - nx, fixed.z - nz) > 0.01;
  if (hit) {
    // A wall stops the car: keep most of the speed only when sliding along it.
    const moved = Math.hypot(fixed.x - before.x, fixed.z - before.z);
    const wanted = Math.abs(car.speed) * dt;
    if (moved < wanted * 0.4) car.speed *= 0.45;
  }
  car.group.position.set(fixed.x, 0, fixed.z);
  car.group.rotation.y = car.heading;
  // Wheels: front wheels steer, all wheels spin.
  for (const wg of car.wheels) wg.rotation.x += (car.speed * dt) / 0.36;
  for (const sg of car.frontSteer) sg.rotation.y = -steer * 0.42 * Math.min(1, Math.abs(car.speed) / 6 + 0.25);
  // Suspension: body bob + roll on turns + pitch on accel/brake.
  car._suspT += dt * (4 + Math.abs(car.speed) * 0.9);
  const bob = Math.sin(car._suspT) * 0.02 * Math.min(1, Math.abs(car.speed) / 10);
  car.bodyG.position.y = bob;
  car.bodyG.rotation.z = -steer * 0.035 * Math.min(1, Math.abs(car.speed) / 8);
  car.bodyG.rotation.x = THREE.MathUtils.clamp(-fwd * 0.02 * Math.min(1, Math.abs(car.speed) / 10), -0.04, 0.04);
  return hit && Math.abs(car.speed) > 6;
}

function laneOffset(axis, dir) { return axis === 'x' ? dir * 2.2 : -dir * 2.2; }
function headingFor(axis, dir) {
  if (axis === 'x') return dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  return dir > 0 ? 0 : Math.PI;
}

export class Traffic {
  constructor(scene, rng, colliders, lights = null) {
    this.scene = scene; this.rng = rng; this.colliders = colliders;
    this.lights = lights;
    this.cars = []; // moving traffic
    this.parked = []; // stealable parked cars
    this._buildTraffic();
    this._buildParked();
  }
  _spawnOnRoad(model, axis, line, dir, pos) {
    const car = makeCar(model);
    const off = laneOffset(axis, dir);
    if (axis === 'x') car.setPos(pos, line + off, headingFor(axis, dir));
    else car.setPos(line + off, pos, headingFor(axis, dir));
    car.speed = TUNING.trafficSpeed * this.rng.range(0.8, 1.15);
    this.scene.add(car.group);
    const t = { car, axis, line, dir, pos, speed: car.speed, target: TUNING.trafficSpeed, stopped: false };
    this.cars.push(t);
    return t;
  }
  _buildTraffic() {
    for (let i = 0; i < TUNING.trafficCount; i++) {
      const axis = this.rng.chance(0.5) ? 'x' : 'z';
      const line = this.rng.pick(ROADS);
      const dir = this.rng.chance(0.5) ? 1 : -1;
      const pos = this.rng.range(-180, 180);
      // Mostly sedans and taxis, sometimes a bus or a motorcycle.
      const roll = this.rng.next();
      const model = roll < 0.08 ? TRAFFIC_EXTRA_MODELS[0]
        : roll < 0.16 ? TRAFFIC_EXTRA_MODELS[1]
        : this.rng.pick(CAR_MODELS);
      this._spawnOnRoad(model, axis, line, dir, pos);
    }
  }
  _park(model, x, z, heading) {
    const car = makeCar(model);
    car.setPos(x, z, heading);
    this.scene.add(car.group);
    this.parked.push(car);
    return car;
  }
  _buildParked() {
    // parked[0]: the test's car — on the central east-west road, facing east,
    // with a long straight run ahead of it.
    this._park(CAR_MODELS[0], -40, 0, Math.PI / 2);
    // The story cars: Comet GT and golden Manta GT.
    this._park(CAR_MODELS[2], -140, -166, Math.PI / 2); // Comet GT
    this._park(CAR_MODELS[3], 128, 143, Math.PI / 2); // Manta GT (container yard lane)
    // The rest: roadside spots around the city.
    const spots = [
      [-84, 3.4, Math.PI / 2], [28, -3.4, -Math.PI / 2], [84, 3.4, Math.PI / 2],
      [140, -3.4, -Math.PI / 2], [-3.4, 84, 0], [3.4, -84, Math.PI],
      [-112, -3.4, -Math.PI / 2], [56, 3.4, Math.PI / 2], [-56, -3.4, -Math.PI / 2],
      [112, 3.4, Math.PI / 2], [3.4, 140, Math.PI],
    ];
    const models = [1, 4, 5, 6, 7, 0, 2, 4, 6, 1, 5];
    spots.forEach(([x, z, h], i) => this._park(CAR_MODELS[models[i]], x, z, h));
  }
  // Is there a vehicle ahead of `t` on its lane within `dist`? Used to stop
  // traffic bunching up behind parked cars and the player.
  _vehicleAhead(t, vehicles, dist) {
    let best = null;
    for (const v of vehicles) {
      if (v === t.car) continue;
      const dx = v.x - t.car.x, dz = v.z - t.car.z;
      const fx = Math.sin(t.car.heading), fz = Math.cos(t.car.heading);
      const along = dx * fx + dz * fz;
      const side = Math.abs(dx * fz - dz * fx);
      if (along > 0 && along < dist && side < 2.6) {
        if (!best || along < best.along) best = { along, car: v };
      }
    }
    return best;
  }
  update(dt, playerCar) {
    const all = [...this.cars.map((t) => t.car), ...this.parked, ...(playerCar ? [playerCar] : [])];
    for (const t of this.cars) {
      // Stop at a red light when approaching an intersection.
      const atRed = this.lights && this.lights.isRed(t.axis, t.pos);
      // Slow for a vehicle ahead on the same lane.
      const ahead = this._vehicleAhead(t, all, 13);
      const want = atRed ? 0 : ahead ? Math.max(0, ahead.car.speed || 0) : t.target;
      t.speed += Math.max(-8 * dt, Math.min(6 * dt, want - t.speed));
      if (t.speed < 0.5) t.speed = 0.5;
      t.car.speed = t.speed;
      // Advance along the road.
      t.pos += t.dir * t.speed * dt;
      // Turn at an intersection sometimes; turn around at the city edge.
      const nearCross = ROADS.some((r) => Math.abs(t.pos - r) < 3);
      if (nearCross && this.rng.chance(dt * 0.5)) {
        const cross = ROADS.reduce((a, b) => (Math.abs(t.pos - a) < Math.abs(t.pos - b) ? a : b));
        const newAxis = t.axis === 'x' ? 'z' : 'x';
        const newDir = this.rng.chance(0.5) ? 1 : -1;
        t.axis = newAxis; t.line = cross; t.dir = newDir;
        t.pos = cross;
      }
      if (t.pos > 190 || t.pos < -190) { t.dir *= -1; t.pos = Math.max(-190, Math.min(190, t.pos)); }
      const off = laneOffset(t.axis, t.dir);
      if (t.axis === 'x') t.car.setPos(t.pos, t.line + off, headingFor(t.axis, t.dir));
      else t.car.setPos(t.line + off, t.pos, headingFor(t.axis, t.dir));
      for (const wg of t.car.wheels) wg.rotation.x += (t.speed * dt) / 0.36;
    }
  }
  // Shove a traffic car when the player rams it; returns true on a hard hit.
  ramCheck(playerCar) {
    if (!playerCar) return false;
    let hard = false;
    for (const t of this.cars) {
      const d = Math.hypot(t.car.x - playerCar.x, t.car.z - playerCar.z);
      if (d < 3.6) {
        const push = 2.2;
        const nx = t.car.x + ((t.car.x - playerCar.x) / (d || 1)) * push;
        const nz = t.car.z + ((t.car.z - playerCar.z) / (d || 1)) * push;
        t.car.setPos(nx, nz, t.car.heading);
        t.speed = Math.max(2, t.speed);
        playerCar.speed *= 0.72;
        hard = true;
      }
    }
    return hard;
  }
}
