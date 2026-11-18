# IRONHAVEN

[![IRONHAVEN](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![Rank](https://make.fun/badge/gta6-01/jepebrutal030-web/ironhaven-gta6/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![Reward](https://make.fun/badge/gta6-01/jepebrutal030-web/ironhaven-gta6/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**IRONHAVEN** is an open-world crime game in the spirit of GTA 6, built with Three.js.
It runs entirely from static files in a desktop browser — no network, no build step.

## The game

Dario Reyes is back in Ironhaven, and the Vultures own the streets. Steal cars, run five
jobs for Mara Voss, outrun the IHPD, and take the harbor — or end up busted or wasted trying.

- **A living city** — five districts: downtown glass towers (with the 70 m Meridian Tower
  and its helipad), brick residential streets, harbor warehouses and cranes, a park, and a
  beach with the sea beyond. Golden-hour sun, long soft shadows, drifting clouds, fog.
- **Realistic look** — smooth-shaded humanoids with articulated limbs and walk/run
  animation, detailed cars (rounded bodies, glossy cabins, steering + spinning wheels,
  headlights, mirrors, license plates, doors that open), procedural facades with lit
  windows and storefronts, asphalt with lane markings, cracks and crosswalks, and working
  traffic lights that traffic actually obeys.
- **Driving** — 8 stealable car models plus buses, taxis and motorcycles in traffic, each
  with its own handling; suspension bounce, body roll, handbrake drift, crash smoke.
- **Wanted system** — 0–5 stars. Police cars chase and ram, foot cops arrest (BUSTED),
  wanted decays when you stay hidden.
- **Combat** — three realistic weapons (Pistol, SMG, Shotgun) with distinct stats, muzzle
  flash, tracers, shell casings and reload animations; weapon crates hidden around the city.
- **Five story missions** — Homecoming ($300), Pickup ($500), Getaway ($700),
  Shakedown ($1,000), Harbor Job ($1,500), with an ending screen after the last job.
- **HUD + minimap** — health, money, wanted stars, objective + distance + timer,
  speedometer, ammo per weapon, crosshair, damage vignette, and a live 2D minimap that
  shows the districts, the objective beacon, police and hostiles.
- **Save** — autosave to localStorage, continue from the start screen.
- **Sound** — fully synthesised WebAudio: a 100 BPM A-minor groove, engine hum that rises
  with speed, sirens, gunshots, skids and crashes. No audio files.

## Play it

```sh
node serve.ts
# open http://localhost:8080
```

Controls: **WASD** move/drive · **mouse** look (click to lock) · **left-click** shoot ·
**R** reload · **E** enter/exit car · **1/2/3** switch weapon · **Shift** sprint/boost ·
**Space** jump/handbrake · **P** pause/save · **M** mute.

## Build

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` copies `game/` and `screenshots/` to the output directory and writes
`dossier.json` with `buildDossier` from `vendor/makefun-game.ts`.

## License

MIT — see [LICENSE](LICENSE).
