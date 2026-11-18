// The five story missions: a state machine over the MISSIONS data. Steps are
// 'reach' (go to a marker), 'enter' (get into a named car) or 'kill'
// (eliminate the hostiles). The test drives this directly (step, beginStep,
// start), so those are plain mutable members.
import { MISSIONS, PLACES, TUNING } from './config.js';

export class Missions {
  constructor(world) {
    this.world = world; // the Game: player, peds, traffic, wanted, callbacks
    this.index = 0;
    this.step = 0;
    this.timer = null; this.timerMax = null;
    this.beacon = null; // {x, z} of the current objective marker
    this.objective = '';
    this.onPayout = null; // (amount) => void
    this.onFail = null;
    this.onAllComplete = null;
  }
  get def() { return MISSIONS[this.index]; }
  get name() { return this.def ? this.def.name : 'Done'; }
  start(i) {
    this.index = i; this.step = 0;
    this.world.peds.clearHostiles();
    this.timer = this.def?.timer ?? null;
    this.timerMax = this.timer;
    this.beginStep();
  }
  beginStep() {
    const step = this.def?.steps[this.step];
    if (!step) return;
    this.objective = step.text;
    if (step.kind === 'reach') this.beacon = { ...step.target };
    else if (step.kind === 'enter') this.beacon = this._carBeacon(step.car);
    else if (step.kind === 'kill') {
      this.world.peds.spawnHostiles(step.count, PLACES.turf);
      this.beacon = { ...PLACES.turf };
    }
  }
  _carBeacon(carName) {
    const parked = this.world.traffic.parked;
    const car = carName === 'any'
      ? parked.find((c) => !c.taken)
      : parked.find((c) => c.name === carName);
    return car ? { x: car.x, z: car.z } : null;
  }
  _findCar(carName) {
    if (carName === 'any') return this.world.traffic.parked.find((c) => !c.taken) || null;
    return this.world.traffic.parked.find((c) => c.name === carName) || null;
  }
  completeStep() {
    this.step++;
    if (this.step >= this.def.steps.length) this._completeMission();
    else this.beginStep();
  }
  _completeMission() {
    const payout = this.def.payout;
    if (this.onPayout) this.onPayout(payout);
    this.index++;
    this.step = 0;
    if (this.index >= MISSIONS.length) {
      this.beacon = null; this.objective = 'Ironhaven is yours.';
      if (this.onAllComplete) this.onAllComplete();
      return;
    }
    this.timer = this.def?.timer ?? null;
    this.timerMax = this.timer;
    this.beginStep();
  }
  _fail() {
    this.step = 0;
    this.timer = this.def?.timer ?? null;
    this.timerMax = this.timer;
    if (this.onFail) this.onFail(this.def.name);
    this.beginStep();
  }
  distanceToBeacon(playerPos) {
    if (!this.beacon) return 0;
    return Math.hypot(this.beacon.x - playerPos.x, this.beacon.z - playerPos.z);
  }
  update(dt) {
    if (!this.def) return;
    if (this.timer !== null) {
      this.timer -= dt;
      if (this.timer <= 0) { this._fail(); return; }
    }
    const step = this.def.steps[this.step];
    if (!step) return;
    const p = this.world.player;
    if (step.kind === 'reach') {
      const d = Math.hypot(p.pos.x - step.target.x, p.pos.z - step.target.z);
      if (d < step.radius) this.completeStep();
    } else if (step.kind === 'enter') {
      this.beacon = this._carBeacon(step.car);
      if (p.driving && p.car && (step.car === 'any' || p.car.name === step.car)) this.completeStep();
    } else if (step.kind === 'kill') {
      const hs = this.world.peds.hostiles;
      if (hs.length > 0 && hs.every((h) => h.state === 'fallen')) this.completeStep();
    }
  }
}
