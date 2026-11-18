// The city of Ironhaven: a 392x392 grid, 7x7 blocks, with real districts —
// downtown glass towers, brick residential streets, harbor warehouses, a
// park, a beach on the east edge — plus working traffic lights, road signs,
// street furniture and landmarks (the Meridian Tower, the harbor bridge).
// Exports the collision list and helpers; createCity returns the lights,
// the water/clouds animators and the ground texture the minimap draws.
import * as THREE from 'three';
import { CITY, HALF, ROADS, ROAD_W, PLACES, SKY } from './config.js';

// Push a circle (x, z, radius) out of every AABB collider. Returns the
// corrected position. Fountain is a circle collider handled the same way.
export function collideCircle(x, z, r, colliders) {
  for (const c of colliders) {
    if (c.circle) {
      const dx = x - c.x, dz = z - c.z;
      const d = Math.hypot(dx, dz);
      const min = c.r + r;
      if (d < min && d > 0.0001) {
        let nx = dx / d, nz = dz / d;
        // A dead-centre approach (nz ~ 0) would bounce straight back and
        // stick; bias the push-out sideways so the object slides around
        // the circle instead (fountain, trees).
        if (Math.abs(nz) < 0.15) {
          nz = 0.35;
          const l = Math.hypot(nx, nz);
          nx /= l; nz /= l;
        }
        x = c.x + nx * min; z = c.z + nz * min;
      }
      continue;
    }
    const nx = Math.max(c.minX, Math.min(x, c.maxX));
    const nz = Math.max(c.minZ, Math.min(z, c.maxZ));
    const dx = x - nx, dz = z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 0.000001) {
        const d = Math.sqrt(d2);
        x = nx + (dx / d) * r; z = nz + (dz / d) * r;
      } else {
        // centre inside the box: push out along the smallest penetration axis
        const pl = x - c.minX, pr = c.maxX - x, pt = z - c.minZ, pb = c.maxZ - z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) x = c.minX - r; else if (m === pr) x = c.maxX + r;
        else if (m === pt) z = c.minZ - r; else z = c.maxZ + r;
      }
    }
  }
  // City bounds.
  x = Math.max(-HALF + 1, Math.min(HALF - 1, x));
  z = Math.max(-HALF + 1, Math.min(HALF - 1, z));
  return { x, z };
}

export function isOnRoad(x, z) {
  for (const r of ROADS) {
    if (Math.abs(x - r) <= ROAD_W / 2 + 1) return true;
    if (Math.abs(z - r) <= ROAD_W / 2 + 1) return true;
  }
  return false;
}

// ---- procedural textures -------------------------------------------------

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Glass office facade: dark blue-grey with a lit-window grid and floor lines.
function glassFacade(rng) {
  return canvasTex(128, 256, (g) => {
    g.fillStyle = '#4a6a8a'; g.fillRect(0, 0, 128, 256);
    for (let y = 8; y < 248; y += 20) {
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, y + 16, 128, 3); // floor line
      for (let x = 8; x < 120; x += 20) {
        const lit = rng.chance(0.45);
        g.fillStyle = lit ? (rng.chance(0.5) ? '#ffd98a' : '#cfe4ff') : '#33506e';
        g.fillRect(x, y, 14, 14);
      }
    }
  });
}

// Brick apartment facade: red-brown brick courses, windows with sills.
function brickFacade(rng) {
  return canvasTex(128, 256, (g) => {
    g.fillStyle = '#7a4a38'; g.fillRect(0, 0, 128, 256);
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 1;
    for (let y = 0; y < 256; y += 8) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(128, y); g.stroke();
      for (let x = (y / 8) % 2 ? 0 : 8; x < 128; x += 16) {
        g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 8); g.stroke();
      }
    }
    for (let y = 16; y < 240; y += 30) {
      for (let x = 12; x < 116; x += 30) {
        g.fillStyle = rng.chance(0.5) ? '#ffd98a' : '#2c3a48';
        g.fillRect(x, y, 18, 20);
        g.fillStyle = '#d8cfc0'; g.fillRect(x - 2, y + 20, 22, 3); // sill
      }
    }
    // Ground-floor storefront with a painted sign band.
    g.fillStyle = '#2a2a30'; g.fillRect(0, 224, 128, 32);
    g.fillStyle = rng.pick(['#c04040', '#2a6db0', '#3a8a3a', '#c07828']);
    g.fillRect(0, 216, 128, 8);
    g.fillStyle = '#f0e8d8'; g.font = 'bold 11px sans-serif';
    g.fillText(rng.pick(['MARKET', 'DINER', 'BAR', 'LAUNDRY', 'PIZZA', 'PAWN']), 8, 244);
  });
}

// Concrete facade: pale panels, small windows, grime streaks.
function concreteFacade(rng) {
  return canvasTex(128, 256, (g) => {
    g.fillStyle = '#9a9484'; g.fillRect(0, 0, 128, 256);
    g.fillStyle = 'rgba(0,0,0,0.12)';
    for (let i = 0; i < 10; i++) g.fillRect(rng.range(0, 110), 0, rng.range(4, 14), 256);
    g.strokeStyle = 'rgba(0,0,0,0.3)';
    for (let y = 0; y < 256; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(128, y); g.stroke(); }
    for (let y = 18; y < 240; y += 32) {
      for (let x = 14; x < 114; x += 32) {
        g.fillStyle = rng.chance(0.3) ? '#ffe9b0' : '#33404c';
        g.fillRect(x, y, 16, 14);
      }
    }
  });
}

// Corrugated warehouse wall.
function warehouseFacade() {
  return canvasTex(128, 128, (g) => {
    g.fillStyle = '#7d8478'; g.fillRect(0, 0, 128, 128);
    for (let x = 0; x < 128; x += 8) {
      g.fillStyle = (x / 8) % 2 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.18)';
      g.fillRect(x, 0, 4, 128);
    }
    g.fillStyle = '#c07828'; g.fillRect(0, 0, 128, 10);
  });
}

// Asphalt with lane dashes is painted on the ground texture; this is the
// repeating road-surface detail used by the harbor dock and the plaza paths.
function waveTexture() {
  return canvasTex(128, 128, (g) => {
    g.fillStyle = '#2e5f7a'; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 2;
    for (let i = 0; i < 14; i++) {
      const y = 8 + i * 9;
      g.beginPath();
      for (let x = 0; x <= 128; x += 8) g.lineTo(x, y + Math.sin(x * 0.12 + i) * 3);
      g.stroke();
    }
  });
}

function groundTexture(rng) {
  const S = 2048, m = S / CITY; // px per metre
  const c = document.createElement('canvas'); c.width = S; c.height = S;
  const g = c.getContext('2d');
  const X = (v) => (v + HALF) * m;
  const Y = (v) => (v + HALF) * m; // canvas y == world z
  // Base: dark urban ground.
  g.fillStyle = '#3d4a3a'; g.fillRect(0, 0, S, S);
  // Blocks: district-tinted concrete. Downtown = blue-grey, residential =
  // warm brick-grey with green yards, harbor = industrial grey.
  for (let i = 0; i < 7; i++) for (let j = 0; j < 7; j++) {
    const bx = -HALF + i * 56 + 5, bz = -HALF + j * 56 + 5;
    const cx = bx + 23, cz = bz + 23;
    let fill = '#4a4a44';
    if (Math.abs(cx) <= 84 && Math.abs(cz) <= 84) fill = '#454a55'; // downtown
    else if (cx < -84 || cz > 84) fill = '#4d4a3c'; // residential
    else if (cz < -140) fill = '#55504a'; // harbor
    g.fillStyle = fill;
    g.fillRect(X(bx), Y(bz), 46 * m, 46 * m);
    // Residential yards: green corners.
    if (cx < -84 || cz > 84) {
      g.fillStyle = '#4a6a3a';
      g.fillRect(X(bx + 30), Y(bz + 30), 14 * m, 14 * m);
      g.fillRect(X(bx + 2), Y(bz + 2), 10 * m, 10 * m);
    }
  }
  // Park (SE block): grass with paths.
  g.fillStyle = '#4a7a3a'; g.fillRect(X(117), Y(-163), 46 * m, 46 * m);
  g.fillStyle = '#6a5a44';
  g.fillRect(X(117), Y(-142), 46 * m, 3 * m);
  g.fillRect(X(138), Y(-163), 3 * m, 46 * m);
  g.fillStyle = '#3a6a30';
  for (let i = 0; i < 40; i++) {
    g.beginPath(); g.arc(X(120 + rng.range(0, 40)), Y(-160 + rng.range(0, 40)), rng.range(1, 3) * m, 0, Math.PI * 2); g.fill();
  }
  // Beach: sand strip along the east edge.
  g.fillStyle = '#d8c08a'; g.fillRect(X(185), 0, 11 * m, S);
  g.fillStyle = '#2e5f7a'; g.fillRect(X(192), 0, 4 * m, S);
  // Roads: dark asphalt with sidewalks.
  for (const r of ROADS) {
    g.fillStyle = '#2a2d33';
    g.fillRect(X(r - ROAD_W / 2), 0, ROAD_W * m, S);
    g.fillRect(0, Y(r - ROAD_W / 2), S, ROAD_W * m);
    g.fillStyle = '#5c6068'; // sidewalks
    g.fillRect(X(r - ROAD_W / 2 - 2), 0, 2 * m, S);
    g.fillRect(X(r + ROAD_W / 2), 0, 2 * m, S);
    g.fillRect(0, Y(r - ROAD_W / 2 - 2), S, 2 * m);
    g.fillRect(0, Y(r + ROAD_W / 2), S, 2 * m);
    // Centre dashes.
    g.fillStyle = '#c8b25e';
    for (let d = -HALF + 8; d < HALF - 8; d += 16) {
      g.fillRect(X(d), Y(r - 0.25), 8 * m, 0.5 * m);
      g.fillRect(X(r - 0.25), Y(d), 0.5 * m, 8 * m);
    }
    // Cracks, patches and oil stains on the asphalt.
    for (let i = 0; i < 26; i++) {
      const along = rng.range(-190, 190);
      const off = rng.range(-4, 4);
      g.fillStyle = rng.chance(0.5) ? 'rgba(0,0,0,0.35)' : 'rgba(20,20,24,0.5)';
      g.beginPath();
      g.ellipse(X(along), Y(r + off), rng.range(1.5, 4) * m, rng.range(0.6, 1.4) * m, rng.range(0, 3), 0, Math.PI * 2);
      g.fill();
    }
    // Edge lines.
    g.fillStyle = 'rgba(220,220,220,0.55)';
    g.fillRect(X(r - ROAD_W / 2 + 0.4), 0, 0.3 * m, S);
    g.fillRect(X(r + ROAD_W / 2 - 0.7), 0, 0.3 * m, S);
    g.fillRect(0, Y(r - ROAD_W / 2 + 0.4), S, 0.3 * m);
    g.fillRect(0, Y(r + ROAD_W / 2 - 0.7), S, 0.3 * m);
  }
  // Zebra crosswalks at every road intersection.
  g.fillStyle = 'rgba(240,240,240,0.85)';
  for (const rx of ROADS) for (const rz of ROADS) {
    for (let k = -4; k <= 4; k += 2) {
      g.fillRect(X(rx + k - 0.7), Y(rz - ROAD_W / 2 - 1.6), 1.4 * m, 1.6 * m);
      g.fillRect(X(rx + k - 0.7), Y(rz + ROAD_W / 2), 1.4 * m, 1.6 * m);
      g.fillRect(X(rx - ROAD_W / 2 - 1.6), Y(rz + k - 0.7), 1.6 * m, 1.4 * m);
      g.fillRect(X(rx + ROAD_W / 2), Y(rz + k - 0.7), 1.6 * m, 1.4 * m);
    }
  }
  // Founders Plaza: pale stone square + fountain ring at the centre.
  g.fillStyle = '#8f8a7c'; g.fillRect(X(-23), Y(-23), 46 * m, 46 * m);
  g.strokeStyle = '#6e6a5e'; g.lineWidth = 2;
  g.strokeRect(X(-23), Y(-23), 46 * m, 46 * m);
  g.fillStyle = '#7fa8c9';
  g.beginPath(); g.arc(X(0), Y(0), 6 * m, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#d8d2c0'; g.lineWidth = 3;
  g.beginPath(); g.arc(X(0), Y(0), 7 * m, 0, Math.PI * 2); g.stroke();
  // Container yard: concrete pad with painted bay lines (NE block).
  g.fillStyle = '#6b6f75'; g.fillRect(X(117), Y(117), 46 * m, 46 * m);
  g.strokeStyle = '#d8c25e'; g.lineWidth = 2;
  for (let i = 0; i < 5; i++) {
    g.strokeRect(X(120 + i * 8), Y(120), 7 * m, 20 * m);
    g.strokeRect(X(120 + i * 8), Y(142), 7 * m, 18 * m);
  }
  // Harbor: dock strip along the south edge + water beyond the city line.
  g.fillStyle = '#5e5a50'; g.fillRect(0, Y(-HALF), S, 21 * m);
  g.fillStyle = '#2e5f7a'; g.fillRect(0, Y(-HALF), S, 6 * m);
  g.strokeStyle = '#c8b25e'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(0, Y(-HALF + 8)); g.lineTo(S, Y(-HALF + 8)); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// ---- traffic lights ------------------------------------------------------
// One signal per intersection approach is too many meshes; one signal head
// per intersection corner, all cycling together: NS green 8s, yellow 2s,
// EW green 8s, yellow 2s. isRed(axis, pos) answers for a car travelling
// along `axis` ('x' or 'z') near position `pos`: it is red when its axis
// does not have the green, and it is within 9m before an intersection.
class TrafficLights {
  constructor(scene) {
    this.scene = scene;
    this.t = 0;
    // Poles + boxes instanced; the three lamps are one InstancedMesh each,
    // lit/off via per-instance colour (one draw call per colour, not 49x3).
    const positions = [];
    for (const rx of ROADS) for (const rz of ROADS) positions.push([rx + 6.2, rz + 6.2]);
    this._count = positions.length;
    const dummy = new THREE.Object3D();
    const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 4.6, 6);
    const poles = new THREE.InstancedMesh(poleGeo, new THREE.MeshLambertMaterial({ color: 0x2c2f34 }), this._count);
    const boxGeo = new THREE.BoxGeometry(0.5, 1.3, 0.5);
    const boxes = new THREE.InstancedMesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0x181a1c }), this._count);
    const lampGeo = new THREE.SphereGeometry(0.16, 10, 8);
    const lampMat = () => new THREE.MeshLambertMaterial({ color: 0xffffff });
    this._lampMeshes = {
      red: new THREE.InstancedMesh(lampGeo, lampMat(), this._count),
      yellow: new THREE.InstancedMesh(lampGeo, lampMat(), this._count),
      green: new THREE.InstancedMesh(lampGeo, lampMat(), this._count),
    };
    positions.forEach(([x, z], i) => {
      dummy.position.set(x, 2.3, z); dummy.rotation.set(0, 0, 0); dummy.updateMatrix();
      poles.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x, 5.0, z); dummy.updateMatrix();
      boxes.setMatrixAt(i, dummy.matrix);
      const ys = { red: 5.45, yellow: 5.0, green: 4.55 };
      for (const [key, y] of Object.entries(ys)) {
        dummy.position.set(x, y, z + 0.25); dummy.updateMatrix();
        this._lampMeshes[key].setMatrixAt(i, dummy.matrix);
      }
    });
    scene.add(poles); scene.add(boxes);
    for (const m of Object.values(this._lampMeshes)) scene.add(m);
    this._apply();
  }
  // phase: 0 NS green, 1 NS yellow, 2 EW green, 3 EW yellow
  get phase() {
    const t = this.t % 20;
    if (t < 8) return 0;
    if (t < 10) return 1;
    if (t < 18) return 2;
    return 3;
  }
  update(dt) {
    this.t += dt;
    this._apply();
  }
  _apply() {
    const p = this.phase;
    const on = new THREE.Color();
    const off = new THREE.Color(0.08, 0.08, 0.08);
    const cols = {
      red: p === 0 ? off : new THREE.Color(1, 0.12, 0.08),
      yellow: (p === 1 || p === 3) ? new THREE.Color(1, 0.8, 0.05) : off,
      green: p === 0 ? new THREE.Color(0.15, 0.9, 0.25) : off,
    };
    for (const [key, mesh] of Object.entries(this._lampMeshes)) {
      for (let i = 0; i < this._count; i++) mesh.setColorAt(i, cols[key]);
      mesh.instanceColor.needsUpdate = true;
    }
    void on;
  }
  // Is the light red for a car travelling along `axis` at `pos` (its
  // coordinate along the road)? True only when it is about to enter an
  // intersection (within 9m before a crossing road) while its axis is red.
  isRed(axis, pos) {
    const p = this.phase;
    const axisGo = axis === 'z' ? (p === 0) : (p === 2);
    if (axisGo) return false;
    for (const r of ROADS) {
      const d = r - pos;
      if (d > 0.5 && d < 9) return true;
    }
    return false;
  }
}

// ---- the city ------------------------------------------------------------

export function createCity(scene, rng) {
  const colliders = [];
  // Ground with the painted city texture.
  const tex = groundTexture(rng);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY, CITY),
    new THREE.MeshLambertMaterial({ map: tex }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0;
  ground.receiveShadow = true;
  scene.add(ground);

  // Water: harbor (south) and the sea beyond the beach (east), animated.
  const waveTex = waveTexture();
  waveTex.wrapS = waveTex.wrapT = THREE.RepeatWrapping;
  waveTex.repeat.set(6, 2);
  const waterMat = new THREE.MeshPhongMaterial({ map: waveTex, color: 0x9fc8dd, shininess: 35, specular: 0x335566 });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(520, 90), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -0.3, -HALF - 44);
  scene.add(water);
  const seaTex = waveTexture();
  seaTex.wrapS = seaTex.wrapT = THREE.RepeatWrapping;
  seaTex.repeat.set(2, 6);
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(90, 520),
    new THREE.MeshPhongMaterial({ map: seaTex, color: 0x9fc8dd, shininess: 35, specular: 0x335566 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(HALF + 44, -0.3, 0);
  scene.add(sea);

  // Drifting clouds: flattened white sphere clusters high above the city.
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
  const clouds = [];
  for (let i = 0; i < 7; i++) {
    const cl = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(rng.range(6, 12), 10, 8), cloudMat);
      s.scale.y = 0.35;
      s.position.set(rng.range(-14, 14), rng.range(-1, 1), rng.range(-5, 5));
      cl.add(s);
    }
    cl.position.set(rng.range(-220, 220), rng.range(90, 130), rng.range(-220, 220));
    scene.add(cl);
    clouds.push({ group: cl, speed: rng.range(0.6, 1.6) });
  }

  // Facade materials, one shared texture per style.
  const glassMat = new THREE.MeshPhongMaterial({ map: glassFacade(rng), shininess: 60, specular: 0x445566 });
  const glassMat2 = new THREE.MeshPhongMaterial({ map: glassFacade(rng), shininess: 60, specular: 0x445566 });
  const brickMat = new THREE.MeshLambertMaterial({ map: brickFacade(rng) });
  const brickMat2 = new THREE.MeshLambertMaterial({ map: brickFacade(rng) });
  const concreteMat = new THREE.MeshLambertMaterial({ map: concreteFacade(rng) });
  const warehouseMat = new THREE.MeshLambertMaterial({ map: warehouseFacade() });
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x3a3a3e });
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);

  // Rooftop props (shared geometry/materials, reused on every building).
  const acGeo = new THREE.BoxGeometry(1.6, 0.9, 1.6);
  const acMat = new THREE.MeshLambertMaterial({ color: 0x9a9a94 });
  const tankGeo = new THREE.CylinderGeometry(1.1, 1.1, 2.2, 10);
  const tankMat = new THREE.MeshLambertMaterial({ color: 0x7a5a3a });
  const antGeo = new THREE.CylinderGeometry(0.05, 0.08, 5, 5);
  const antMat = new THREE.MeshLambertMaterial({ color: 0x303034 });
  function rooftopProps(x, h, z, w, d) {
    const n = rng.int(1, 2);
    for (let i = 0; i < n; i++) {
      const px = x + rng.range(-w / 2 + 2, w / 2 - 2);
      const pz = z + rng.range(-d / 2 + 2, d / 2 - 2);
      const kind = rng.pick(['ac', 'ac', 'tank', 'antenna']);
      if (kind === 'ac') {
        const m = new THREE.Mesh(acGeo, acMat);
        m.position.set(px, h + 0.75, pz); scene.add(m);
      } else if (kind === 'tank') {
        const m = new THREE.Mesh(tankGeo, tankMat);
        m.position.set(px, h + 1.4, pz); scene.add(m);
      } else {
        const m = new THREE.Mesh(antGeo, antMat);
        m.position.set(px, h + 2.5, pz); scene.add(m);
      }
    }
  }
  function balconies(x, h, z, w, d) {
    // Slim slab balconies on the residential face, at most two floors.
    const bGeo = new THREE.BoxGeometry(2.2, 0.25, 1.1);
    const bMat = new THREE.MeshLambertMaterial({ color: 0x8a7a68 });
    for (let f = 0; f < Math.min(2, Math.floor(h / 3.4)); f++) {
      const m = new THREE.Mesh(bGeo, bMat);
      m.position.set(x, 3.2 + f * 3.4, z + d / 2 + 0.5);
      scene.add(m);
    }
  }

  // Buildings: one or two per block, skipping the plaza, yard, park and harbor.
  const blockCentres = [];
  for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) blockCentres.push({ x: -140 + i * 56, z: -140 + j * 56 });
  const clearOf = (cx, cz) => {
    for (const p of [PLACES.hideout, PLACES.garage, PLACES.turf, PLACES.cometSpot, PLACES.harbor]) {
      if (Math.hypot(cx - p.x, cz - p.z) < 16) return false;
    }
    return true;
  };
  for (const b of blockCentres) {
    if (Math.abs(b.x) < 30 && Math.abs(b.z) < 30) continue; // plaza
    if (b.x === 140 && b.z === 140) continue; // container yard
    if (b.x === 140 && b.z === -140) continue; // park
    if (b.z === -140 && Math.abs(b.x) <= 28) continue; // harbor offices stay low/open
    const downtown = Math.abs(b.x) <= 84 && Math.abs(b.z) <= 84;
    const harborBlock = b.z <= -140;
    const n = rng.chance(0.6) ? 2 : 1;
    for (let k = 0; k < n; k++) {
      const w = harborBlock ? rng.range(18, 26) : rng.range(12, 22);
      const d = harborBlock ? rng.range(14, 20) : rng.range(12, 20);
      const h = downtown ? rng.range(25, 55) : harborBlock ? rng.range(8, 13) : rng.range(6, 14);
      const ox = (k === 0 ? -1 : 1) * rng.range(2, 10);
      const oz = (k === 0 ? 1 : -1) * rng.range(2, 10);
      const cx = b.x + ox, cz = b.z + oz;
      if (!clearOf(cx, cz)) continue;
      const mat = harborBlock ? warehouseMat : downtown ? rng.pick([glassMat, glassMat2]) : rng.pick([brickMat, brickMat2, concreteMat]);
      const mesh = new THREE.Mesh(boxGeo, mat);
      mesh.scale.set(w, h, d);
      mesh.position.set(cx, h / 2, cz);
      mesh.castShadow = true; mesh.receiveShadow = true;
      scene.add(mesh);
      const roof = new THREE.Mesh(boxGeo, roofMat);
      roof.scale.set(w + 0.6, 0.6, d + 0.6);
      roof.position.set(cx, h + 0.3, cz);
      roof.castShadow = true;
      scene.add(roof);
      rooftopProps(cx, h + 0.6, cz, w, d);
      if (!downtown && !harborBlock) balconies(cx, h, cz, w, d);
      // Awnings over the storefront on brick buildings.
      if (mat === brickMat || mat === brickMat2) {
        const aw = new THREE.Mesh(
          new THREE.BoxGeometry(w * 0.5, 0.25, 2.2),
          new THREE.MeshLambertMaterial({ color: rng.pick([0xc04040, 0x2a6db0, 0x3a8a3a]) }),
        );
        aw.position.set(cx, 3.4, cz + d / 2 + 1.0);
        scene.add(aw);
      }
      colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
    }
  }

  // Landmark: the Meridian Tower — a 70m glass tower downtown-north with a
  // helipad on the roof and a lit crown.
  const tower = new THREE.Mesh(boxGeo, glassMat);
  tower.scale.set(20, 70, 20);
  tower.position.set(28, 35, -84);
  tower.castShadow = true; tower.receiveShadow = true;
  scene.add(tower);
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 0.8, 20), new THREE.MeshLambertMaterial({ color: 0x2a2d33 }));
  pad.position.set(28, 70.4, -84);
  scene.add(pad);
  const padMark = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4.5, 0.1, 20), new THREE.MeshBasicMaterial({ color: 0xffd23e }));
  padMark.position.set(28, 70.85, -84);
  scene.add(padMark);
  const crown = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0xffe9a8, emissive: 0xcc8800 }));
  crown.scale.set(20.6, 1.2, 20.6);
  crown.position.set(28, 69.4, -84);
  scene.add(crown);
  colliders.push({ minX: 18, maxX: 38, minZ: -94, maxZ: -74 });

  // Hideout garage (SW) and safehouse garage (NW): low distinct buildings.
  const garageMat = new THREE.MeshLambertMaterial({ color: 0x8a7a5a });
  const doorMat = new THREE.MeshLambertMaterial({ color: 0x2a2a2e, emissive: 0x332200 });
  for (const p of [PLACES.hideout, PLACES.garage]) {
    const gx = p.x + 10, gz = p.z; // building sits just east of the marker point
    const g = new THREE.Mesh(boxGeo, garageMat);
    g.scale.set(10, 5, 9);
    g.position.set(gx, 2.5, gz);
    g.castShadow = true;
    scene.add(g);
    const door = new THREE.Mesh(boxGeo, doorMat);
    door.scale.set(0.4, 3.4, 5);
    door.position.set(gx - 5.1, 1.7, gz);
    scene.add(door);
    colliders.push({ minX: gx - 5, maxX: gx + 5, minZ: gz - 4.5, maxZ: gz + 4.5 });
  }
  // Fountain basin (centre plaza) + water disc.
  const basin = new THREE.Mesh(
    new THREE.CylinderGeometry(7, 7.4, 1.1, 24),
    new THREE.MeshLambertMaterial({ color: 0xb8b0a0 }),
  );
  basin.position.set(0, 0.55, 0); basin.castShadow = true; basin.receiveShadow = true;
  scene.add(basin);
  const pool = new THREE.Mesh(
    new THREE.CylinderGeometry(6.2, 6.2, 0.3, 24),
    new THREE.MeshPhongMaterial({ color: 0x4a90c2, shininess: 80 }),
  );
  pool.position.set(0, 1.0, 0); scene.add(pool);
  const jet = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.5, 2.6, 8),
    new THREE.MeshLambertMaterial({ color: 0x9fd0ee, transparent: true, opacity: 0.75 }),
  );
  jet.position.set(0, 2.2, 0); scene.add(jet);
  colliders.push({ circle: true, x: 0, z: 0, r: 7.2 });

  // Container yard: stacked boxes, open lanes between rows.
  const contCols = [0xb03030, 0x3050b0, 0x3a8a3a, 0xc07828, 0x7a3a8a];
  const contGeo = new THREE.BoxGeometry(6, 2.6, 2.6);
  const contMats = contCols.map((c) => new THREE.MeshLambertMaterial({ color: c }));
  const yard = { x: 140, z: 140 };
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < 5; i++) {
      const cx = yard.x - 20 + i * 9, cz = yard.z - 8 + row * 22;
      const stack = rng.chance(0.4) ? 2 : 1;
      for (let s = 0; s < stack; s++) {
        const m = new THREE.Mesh(contGeo, contMats[(i + row + s) % contMats.length]);
        m.position.set(cx, 1.3 + s * 2.6, cz);
        m.castShadow = true;
        scene.add(m);
      }
      colliders.push({ minX: cx - 3, maxX: cx + 3, minZ: cz - 1.3, maxZ: cz + 1.3 });
    }
  }

  // Harbor dock: a pier, crates, a moored boat, and two gantry cranes.
  const pier = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0x6a6258 }));
  pier.scale.set(30, 1, 10); pier.position.set(0, 0.5, -188); pier.receiveShadow = true;
  scene.add(pier);
  colliders.push({ minX: -15, maxX: 15, minZ: -193, maxZ: -183 });
  for (let i = 0; i < 4; i++) {
    const crate = new THREE.Mesh(contGeo, contMats[i % contMats.length]);
    crate.position.set(-40 + i * 12, 1.3, -182);
    crate.castShadow = true;
    scene.add(crate);
    colliders.push({ minX: -43 + i * 12, maxX: -37 + i * 12, minZ: -183.3, maxZ: -180.7 });
  }
  // Moored boat: hull from a stretched sphere half, cabin, mast.
  const boat = new THREE.Group();
  const hull = new THREE.Mesh(
    new THREE.SphereGeometry(3.2, 16, 10),
    new THREE.MeshPhongMaterial({ color: 0xe8e4da, shininess: 40 }),
  );
  hull.scale.set(0.8, 0.45, 2.2);
  hull.position.y = 0.4;
  boat.add(hull);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 1.2, 2.4),
    new THREE.MeshPhongMaterial({ color: 0x2a4a6a, shininess: 60 }),
  );
  cabin.position.set(0, 1.4, -0.5);
  boat.add(cabin);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 4.5, 6), new THREE.MeshLambertMaterial({ color: 0x3a3a3e }));
  mast.position.set(0, 3.2, 0.5);
  boat.add(mast);
  boat.position.set(30, -0.1, -205);
  scene.add(boat);
  // Gantry cranes over the dock.
  const craneMat = new THREE.MeshLambertMaterial({ color: 0xc07828 });
  for (const cx of [-60, 60]) {
    const legA = new THREE.Mesh(boxGeo, craneMat);
    legA.scale.set(1.2, 26, 1.2); legA.position.set(cx - 6, 13, -188); scene.add(legA);
    const legB = new THREE.Mesh(boxGeo, craneMat);
    legB.scale.set(1.2, 26, 1.2); legB.position.set(cx + 6, 13, -188); scene.add(legB);
    const beam = new THREE.Mesh(boxGeo, craneMat);
    beam.scale.set(30, 1.4, 1.4); beam.position.set(cx, 26, -188); scene.add(beam);
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 8, 5), antMat);
    cable.position.set(cx + 8, 21, -188); scene.add(cable);
    const hook = new THREE.Mesh(contGeo, contMats[0]);
    hook.position.set(cx + 8, 16.5, -188); hook.castShadow = true; scene.add(hook);
  }
  // Harbor bridge: deck + two pylons + cables across the water at the south.
  const bridgeMat = new THREE.MeshLambertMaterial({ color: 0x5a5a60 });
  const deck = new THREE.Mesh(boxGeo, bridgeMat);
  deck.scale.set(90, 1.2, 8); deck.position.set(0, 6, -216); deck.castShadow = true;
  scene.add(deck);
  for (const px of [-30, 30]) {
    const pylon = new THREE.Mesh(boxGeo, bridgeMat);
    pylon.scale.set(2, 22, 2); pylon.position.set(px, 11, -216); scene.add(pylon);
  }
  const cableMat = new THREE.MeshLambertMaterial({ color: 0x2a2a2e });
  for (let i = -4; i <= 4; i++) {
    const cab = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 14, 5), cableMat);
    cab.position.set(i * 9, 12, -216);
    cab.rotation.z = i * 0.12;
    scene.add(cab);
  }

  // Street lamps along the roads (instanced: pole + glowing head).
  const lampPos = [];
  for (const r of ROADS) for (let d = -168; d <= 168; d += 56) {
    lampPos.push([r + 6, d + 4]); lampPos.push([r - 6, d - 4]);
  }
  const dummy = new THREE.Object3D();
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 5.4, 6);
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2c2f34 });
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, lampPos.length);
  const headGeo = new THREE.SphereGeometry(0.32, 8, 6);
  const headMat = new THREE.MeshLambertMaterial({ color: 0xffe9a8, emissive: 0xffb347, emissiveIntensity: 0.9 });
  const heads = new THREE.InstancedMesh(headGeo, headMat, lampPos.length);
  lampPos.forEach(([x, z], i) => {
    dummy.position.set(x, 2.7, z); dummy.rotation.set(0, 0, 0); dummy.updateMatrix();
    poles.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x, 5.5, z); dummy.updateMatrix();
    heads.setMatrixAt(i, dummy.matrix);
  });
  scene.add(poles); scene.add(heads);

  // Road signs: stop signs and street-name posts at a few intersections.
  const signMat = new THREE.MeshLambertMaterial({ color: 0xc02020 });
  const signPostMat = new THREE.MeshLambertMaterial({ color: 0x8a8a84 });
  const signGeo = new THREE.CylinderGeometry(0.7, 0.7, 0.1, 8);
  for (const [sx, sz] of [[-56, -56], [56, 56], [-112, 112], [112, -112], [0, 56], [56, 0]]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.6, 5), signPostMat);
    post.position.set(sx + 6.4, 1.3, sz + 6.4);
    scene.add(post);
    const sign = new THREE.Mesh(signGeo, signMat);
    sign.rotation.x = Math.PI / 2;
    sign.position.set(sx + 6.4, 2.8, sz + 6.4);
    scene.add(sign);
  }

  // Fire hydrants (red, instanced) and bus stops (shelter + bench).
  const hydGeo = new THREE.CylinderGeometry(0.22, 0.26, 0.9, 8);
  const hydMat = new THREE.MeshLambertMaterial({ color: 0xc02020 });
  const hydPos = [[-50, 7], [62, -7], [-106, 7], [118, -7], [7, -50], [-7, 118]];
  const hydrants = new THREE.InstancedMesh(hydGeo, hydMat, hydPos.length);
  hydPos.forEach(([x, z], i) => {
    dummy.position.set(x, 0.45, z); dummy.updateMatrix();
    hydrants.setMatrixAt(i, dummy.matrix);
  });
  scene.add(hydrants);
  const shelterMat = new THREE.MeshLambertMaterial({ color: 0x2a6db0 });
  for (const [bx, bz] of [[-50, -7], [62, 7]]) {
    const roof = new THREE.Mesh(boxGeo, shelterMat);
    roof.scale.set(4, 0.2, 2); roof.position.set(bx, 2.6, bz); scene.add(roof);
    const bench = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0x6a4a2a }));
    bench.scale.set(3.4, 0.3, 0.8); bench.position.set(bx, 0.7, bz); scene.add(bench);
  }

  // Plaza + park trees: round canopies on trunks (instanced), plus benches.
  // Plaza trees sit at the square's corners and edges — NEVER on a road
  // axis (a tree on the z=0 / x=0 centreline blocks the drive-through).
  const treePos = [];
  for (const [tx, tz] of [[-18, -18], [18, -18], [-18, 18], [18, 18], [-10, -18], [10, -18], [-10, 18], [10, 18], [-18, -10], [18, -10], [-18, 10], [18, 10]]) {
    treePos.push([tx, tz]);
  }
  for (let i = 0; i < 8; i++) treePos.push([122 + rng.range(0, 36), -160 + rng.range(0, 36)]);
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.28, 2.4, 6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5a4028 });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treePos.length);
  const canGeo = new THREE.SphereGeometry(1.8, 10, 8);
  const canMat = new THREE.MeshLambertMaterial({ color: 0x3a7a3a });
  const cans = new THREE.InstancedMesh(canGeo, canMat, treePos.length);
  const canGeo2 = new THREE.SphereGeometry(1.2, 10, 8);
  const cans2 = new THREE.InstancedMesh(canGeo2, canMat, treePos.length);
  treePos.forEach(([x, z], i) => {
    dummy.position.set(x, 1.2, z); dummy.rotation.set(0, 0, 0); dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x, 3.4, z); dummy.updateMatrix();
    cans.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x + 1.1, 2.9, z + 0.6); dummy.updateMatrix();
    cans2.setMatrixAt(i, dummy.matrix);
  });
  scene.add(trunks); scene.add(cans); scene.add(cans2);
  for (const [x, z] of treePos) colliders.push({ circle: true, x, z, r: 0.6 });
  // Park benches.
  const parkBenchMat = new THREE.MeshLambertMaterial({ color: 0x6a4a2a });
  for (const [bx, bz] of [[130, -140], [150, -130], [125, -155]]) {
    const bench = new THREE.Mesh(boxGeo, parkBenchMat);
    bench.scale.set(2.2, 0.25, 0.7); bench.position.set(bx, 0.6, bz); scene.add(bench);
  }

  // Working traffic lights at every intersection.
  const lights = new TrafficLights(scene);

  // Beach umbrellas on the sand strip.
  const umbMat = new THREE.MeshLambertMaterial({ color: 0xc04040 });
  for (const [ux, uz] of [[188, -40], [188, 60], [188, 140]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 5), poleMat);
    pole.position.set(ux, 1.1, uz); scene.add(pole);
    const top = new THREE.Mesh(new THREE.ConeGeometry(1.8, 0.9, 10), umbMat);
    top.position.set(ux, 2.5, uz); scene.add(top);
  }

  return {
    colliders,
    groundTex: tex,
    fountain: { x: 0, z: 0 },
    lights,
    update(dt) {
      lights.update(dt);
      waveTex.offset.x += dt * 0.02;
      waveTex.offset.y += dt * 0.008;
      seaTex.offset.x += dt * 0.015;
      for (const c of clouds) {
        c.group.position.x += c.speed * dt;
        if (c.group.position.x > 260) c.group.position.x = -260;
      }
    },
  };
}
