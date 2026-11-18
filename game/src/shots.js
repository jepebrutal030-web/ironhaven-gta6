// Staged scenes for ?shot= URLs: the game auto-starts into a composed shot
// (chase cover, drive, on-foot combat, harbor-job mission) so the deliverable
// screenshots are real renders of the game. Uses only the game's public API.
import { PLACES } from './config.js';

function findParked(game, name) {
  return game.traffic.parked.find((c) => c.name === name && !c.taken);
}

export function stageShot(game, mode) {
  const input = game.input;
  const putInCar = (car, x, z, heading, speed) => {
    car.setPos(x, z, heading);
    car.speed = speed;
    game.teleport(x, z);
    game.enterCar(car);
    car.speed = speed;
    input.holdVirtual('KeyW');
  };
  if (mode === 'chase') {
    // Cover: red Comet GT, wanted 3, two police cars as a roadblock AHEAD
    // (the chase camera looks forward, so police behind are invisible).
    game.newGame();
    game.startMission(2);
    game.missions.step = 1; game.missions.beginStep();
    const comet = findParked(game, 'Comet GT');
    putInCar(comet, -120, 0, Math.PI / 2, 21);
    game.setWanted(3);
    const g = game;
    g.wanted.policeCars.slice(0, 2).forEach((pc, i) => {
      pc.setPos(-30, (i === 0 ? 2.4 : -2.4), -Math.PI / 2);
      pc.speed = 6;
    });
  } else if (mode === 'drive') {
    // Driving shot: Falcon at speed past the plaza, Mission 1.
    game.newGame();
    game.startMission(1);
    const falcon = findParked(game, 'Falcon');
    putInCar(falcon, -80, 0, Math.PI / 2, 22);
  } else if (mode === 'foot') {
    // On-foot combat: Shakedown hostiles on the plaza, player aiming.
    game.newGame();
    game.startMission(3);
    game.missions.step = 1; game.missions.beginStep();
    const hs = game.peds.hostiles;
    const spots = [[0, 10], [-7, 16], [7, 18]];
    hs.forEach((h, i) => {
      const s = spots[i % spots.length];
      h.group.position.set(s[0], 0, s[1]);
      h.pos.x = s[0]; h.pos.z = s[1];
      h.speed = 0; h.shootT = 999;
    });
    game.teleport(8, 10);
    game.player.yaw = Math.atan2(0 - 8, 10 - 10);
    game.aimAt(0, 1.2, 10);
  } else if (mode === 'mission') {
    // Harbor Job: golden Manta GT, wanted 4, beacon on the minimap.
    // Manta runs WEST along the north road into the city skyline (the old
    // east heading drove it off the map onto the sea); police roadblock ahead.
    game.newGame();
    game.startMission(4);
    game.missions.step = 1; game.missions.beginStep();
    const manta = findParked(game, 'Manta GT');
    putInCar(manta, 150, 168, -Math.PI / 2, 16);
    game.setWanted(4);
    const g = game;
    g.wanted.policeCars.slice(0, 2).forEach((pc, i) => {
      pc.setPos(60, 168 + (i === 0 ? 2.2 : -2.2), Math.PI / 2);
      pc.speed = 6;
    });
  } else {
    // Any other ?shot= value: just start playing.
    game.newGame();
  }
}
