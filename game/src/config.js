// IRONHAVEN — shared constants, tuning and mission data.
// One source of truth for every module: city layout, car models, missions.

export const CITY = 392;
export const HALF = CITY / 2; // 196 — city spans -196..196 on x and z
export const ROADS = [-168, -112, -56, 0, 56, 112, 168];
export const ROAD_W = 10;
export const SAVE_KEY = 'ironhaven-save-v1';

// Key places (x, z). The city is a grid; the plaza is the open centre block.
export const PLACES = {
  plaza: { x: 0, z: 0 },
  hideout: { x: -166, z: -158 },
  harbor: { x: 0, z: -185 },
  yard: { x: 140, z: 140 },
  garage: { x: -166, z: 166 },
  turf: { x: -140, z: 140 },
  cometSpot: { x: -140, z: -140 },
  mantaSpot: { x: 140, z: 140 },
  playerStart: { x: 0, z: 30 },
  farCorner: { x: 189, z: 189 },
};

// Eight car models: name, body colour, size (length), top speed (m/s), accel,
// body type and handling. The bus and the motorcycle join traffic only.
export const CAR_MODELS = [
  { name: 'Marlin', color: 0x3a6fd8, len: 4.4, top: 20, accel: 9, type: 'sedan', steer: 1.0 },
  { name: 'Falcon', color: 0xc0c8d0, len: 4.2, top: 24, accel: 11, type: 'coupe', steer: 1.1 },
  { name: 'Comet GT', color: 0xd81f2a, len: 4.3, top: 27, accel: 13, type: 'coupe', steer: 1.15 },
  { name: 'Manta GT', color: 0xf5b301, len: 4.3, top: 28, accel: 13, type: 'coupe', steer: 1.15 },
  { name: 'Vulture', color: 0x1c1c22, len: 4.6, top: 22, accel: 10, type: 'suv', steer: 0.9 },
  { name: 'Hauler', color: 0xe8e4da, len: 6.0, top: 16, accel: 7, type: 'pickup', steer: 0.8 },
  { name: 'Cruiser', color: 0x2e7d46, len: 4.8, top: 19, accel: 8, type: 'suv', steer: 0.9 },
  { name: 'Taxi', color: 0xf2c200, len: 4.4, top: 20, accel: 9, type: 'sedan', steer: 1.0 },
];
export const TRAFFIC_EXTRA_MODELS = [
  { name: 'City Bus', color: 0x2a6db0, len: 9.0, top: 15, accel: 5, type: 'bus', steer: 0.6 },
  { name: 'Street Bike', color: 0x8a1a2a, len: 2.2, top: 30, accel: 15, type: 'bike', steer: 1.7 },
];
export const POLICE_MODEL = { name: 'IHPD Interceptor', color: 0x101418, len: 4.5, top: 26, accel: 12, type: 'sedan', steer: 1.0 };

// Three realistic weapons. The pistol is the starter; the SMG and the shotgun
// come from pickup crates around the city (keys 1/2/3 switch).
export const WEAPONS = [
  { name: 'Pistol', damage: 34, cooldown: 0.35, mag: 12, reload: 1.2, range: 60, spread: 0.012, pellets: 1, auto: false },
  { name: 'SMG', damage: 16, cooldown: 0.09, mag: 30, reload: 1.6, range: 50, spread: 0.05, pellets: 1, auto: true },
  { name: 'Shotgun', damage: 20, cooldown: 0.9, mag: 6, reload: 2.2, range: 30, spread: 0.085, pellets: 6, auto: false },
];
export const CRATE_SPOTS = [
  { x: -20, z: 20 }, { x: 20, z: -20 }, { x: -150, z: -120 },
  { x: 120, z: -120 }, { x: -120, z: 120 },
];

// Missions: name, payout, and steps. A step is one objective:
//   kind 'reach' — get within radius of target
//   kind 'enter' — get into the named parked car
//   kind 'kill'  — eliminate every hostile (count set by beginStep)
export const MISSIONS = [
  {
    name: 'Homecoming', payout: 300,
    steps: [
      { text: 'Steal a car', kind: 'enter', car: 'any' },
      { text: 'Drive to the hideout', kind: 'reach', target: PLACES.hideout, radius: 12 },
    ],
  },
  {
    name: 'Pickup', payout: 500,
    steps: [
      { text: 'Pick up Mara at Founders Plaza', kind: 'reach', target: PLACES.plaza, radius: 10 },
      { text: 'Drive Mara to the harbor', kind: 'reach', target: PLACES.harbor, radius: 12 },
    ],
  },
  {
    name: 'Getaway', payout: 700, timer: 90,
    steps: [
      { text: 'Steal the Comet GT', kind: 'enter', car: 'Comet GT' },
      { text: 'Reach the garage', kind: 'reach', target: PLACES.garage, radius: 12 },
    ],
  },
  {
    name: 'Shakedown', payout: 1000,
    steps: [
      { text: "Go to the Vultures' turf", kind: 'reach', target: PLACES.turf, radius: 14 },
      { text: 'Eliminate the Vultures', kind: 'kill', count: 5 },
    ],
  },
  {
    name: 'Harbor Job', payout: 1500, timer: 150,
    steps: [
      { text: 'Get the golden Manta GT', kind: 'enter', car: 'Manta GT' },
      { text: 'Drive to the harbor beacon', kind: 'reach', target: PLACES.harbor, radius: 12 },
      { text: 'Escape to the garage', kind: 'reach', target: PLACES.garage, radius: 12 },
    ],
  },
];

export const TUNING = {
  walkSpeed: 4.5, sprintSpeed: 7.5, jumpSpeed: 6.5, gravity: 18,
  enterRadius: 4.5, // how close to a parked car E works
  carSteer: 1.9, carBrake: 22, carDrag: 0.35, carReverseTop: 8,
  trafficCount: 22, pedCount: 36, parkedCount: 14,
  trafficSpeed: 9, pedSpeed: 1.4,
  sightCar: 60, sightFoot: 40, decayTime: 8, arrestRange: 1.8, arrestTime: 2.0,
  gunDamage: 34, gunRange: 60, gunCooldown: 0.35, magSize: 12, reloadTime: 1.2,
  hostileHp: 100, hostileDamage: 6, hostileRange: 26, hostileShootEvery: 1.6,
  playerHp: 100, ramDamage: 8, wantedOnPedHit: 1,
  policeRam: 26, // police car top speed while chasing
};

export const SKY = {
  // Golden hour: warm low sun, long soft shadows, hazy horizon.
  top: 0x3a6db0, horizon: 0xffb36b, fog: 0xd8b890, sun: 0xffd9a0, hemiSky: 0x9db8d9, hemiGround: 0x6a5a44,
  sunDir: { x: 0.55, y: 0.42, z: 0.35 }, // low western sun
};
