// Seeded RNG (mulberry32) plus small helpers. The game seeds from ?seed=
// when present so screenshots are deterministic, otherwise from the clock.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class RNG {
  constructor(seed) { this.next = mulberry32(seed); }
  range(a, b) { return a + (b - a) * this.next(); }
  int(a, b) { return Math.floor(this.range(a, b + 1)); }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  chance(p) { return this.next() < p; }
}

// The world RNG: seeded from the URL (?seed=) for staged shots, else random.
export function worldSeed() {
  const q = new URLSearchParams(location.search);
  const s = q.get('seed');
  if (s !== null && s !== '') {
    let h = 0;
    for (const ch of s) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0;
    return h >>> 0;
  }
  return (Math.random() * 0xffffffff) >>> 0;
}
