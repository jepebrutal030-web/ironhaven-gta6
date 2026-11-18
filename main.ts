// IRONHAVEN entrypoint: copies game/ and screenshots/ from this repository
// into the output directory (MAKEFUN_OUTPUT_DIR, or /output) and writes
// /output/dossier.json with buildDossier from vendor/makefun-game.ts.
// Runs twice and writes the same bytes both times: the copy is a plain
// recursive copy and the dossier is deterministic for the same inputs.
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildDossier } from './vendor/makefun-game.ts';

const outDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';
const repoDir = new URL('.', import.meta.url).pathname;

mkdirSync(outDir, { recursive: true });
// Start clean so a stale file from an earlier run can never leak in.
for (const name of ['game', 'screenshots', 'dossier.json']) {
  const target = join(outDir, name);
  if (existsSync(target)) rmSync(target, { recursive: true, force: true });
}
cpSync(join(repoDir, 'game'), join(outDir, 'game'), { recursive: true });
cpSync(join(repoDir, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });
const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);
console.log(`wrote ${outDir}/dossier.json (${dossier.length} bytes)`);
