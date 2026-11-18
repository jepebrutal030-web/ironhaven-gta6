// The HUD: DOM readouts (health, money, stars, objective, speed, ammo),
// the 2D minimap (the city's own ground texture + live markers), the
// start/pause/busted/wasted/complete screens and centre messages.
export class HUD {
  constructor(groundImage) {
    this.groundImage = groundImage; // the city ground texture's canvas
    this.$ = (id) => document.getElementById(id);
    this.minimap = this.$('minimap');
    this.mm = this.minimap?.getContext('2d') || null;
    this._vignette = 0; this._hitT = 0; this._msgT = 0;
    this._starEls = [];
    const stars = this.$('hud-stars');
    if (stars) {
      for (let i = 0; i < 5; i++) {
        const s = document.createElement('span');
        s.textContent = '★';
        stars.appendChild(s);
        this._starEls.push(s);
      }
    }
  }
  bind(actions) {
    const on = (id, fn) => { const el = this.$(id); if (el) el.addEventListener('click', (e) => { e.preventDefault(); fn(); }); };
    on('btn-new', actions.newGame);
    on('btn-continue', actions.continueGame);
    on('btn-resume', actions.resume);
    on('btn-save', actions.save);
    on('btn-restart', actions.restart);
    on('btn-busted', actions.respawn);
    on('btn-wasted', actions.respawn);
    on('btn-again', actions.newGame);
  }
  showScreen(name) {
    for (const s of ['start', 'pause', 'busted', 'wasted', 'complete']) {
      const el = this.$(`screen-${s}`);
      if (el) el.style.display = s === name ? 'flex' : 'none';
    }
    const hud = this.$('hud');
    if (hud) hud.style.display = name ? 'none' : 'block';
    const cont = this.$('btn-continue');
    if (cont && name === 'start') cont.style.display = actionsHasSave() ? 'block' : 'none';
  }
  showMsg(text, ms = 2600) {
    const el = this.$('msg');
    if (!el) return;
    el.textContent = text;
    el.style.opacity = '1';
    this._msgT = ms / 1000;
    this._msgEl = el;
  }
  flashDamage() { this._vignette = 0.6; }
  hitmarker() { this._hitT = 0.18; }
  update(dt, s) {
    // s: {health, money, wanted, objective, dist, timer, timerMax, speedMph,
    //     ammo, reloading, driving, mode, yaw, player, beacon, police, hostiles, traffic, parked}
    const setText = (id, v) => { const el = this.$(id); if (el) el.textContent = v; };
    const healthFill = this.$('hud-health-fill');
    if (healthFill) healthFill.style.width = `${Math.max(0, Math.min(100, s.health))}%`;
    setText('hud-money', `$${s.money}`);
    this._starEls.forEach((el, i) => { el.style.color = i < s.wanted ? '#ffd23e' : 'rgba(255,255,255,0.28)'; });
    setText('hud-obj-text', s.objective || '');
    setText('hud-obj-dist', s.beacon ? `${Math.round(s.dist)}m` : '');
    const timerEl = this.$('hud-timer');
    if (timerEl) timerEl.textContent = s.timer !== null && s.timer !== undefined ? `⏱ ${Math.ceil(s.timer)}s` : '';
    setText('hud-speed-num', `${Math.round(s.speedMph)}`);
    const speedEl = this.$('hud-speed');
    if (speedEl) speedEl.style.display = s.driving ? 'block' : 'none';
    setText('hud-ammo-num', s.reloading > 0 ? 'RELOADING' : `${s.ammo} / ${s.magSize || 12}`);
    setText('hud-weapon', s.weaponName || 'Pistol');
    const ch = this.$('crosshair');
    if (ch) ch.style.display = (!s.driving && s.mode === 'playing') ? 'block' : 'none';
    const hm = this.$('hitmarker');
    if (hm) {
      this._hitT -= dt;
      hm.style.opacity = this._hitT > 0 ? '1' : '0';
    }
    const vg = this.$('vignette');
    if (vg) {
      this._vignette = Math.max(0, this._vignette - dt * 1.4);
      vg.style.opacity = String(this._vignette);
    }
    if (this._msgEl && this._msgT > 0) {
      this._msgT -= dt;
      if (this._msgT <= 0) this._msgEl.style.opacity = '0';
    }
    this._drawMinimap(s);
  }
  _drawMinimap(s) {
    if (!this.mm || !this.minimap) return;
    const W = this.minimap.width, H = this.minimap.height;
    const ctx = this.mm;
    const scale = W / 392;
    const X = (x) => (x + 196) * scale;
    const Y = (z) => (z + 196) * scale;
    ctx.clearRect(0, 0, W, H);
    if (this.groundImage) ctx.drawImage(this.groundImage, 0, 0, W, H);
    else { ctx.fillStyle = '#222'; ctx.fillRect(0, 0, W, H); }
    // Objective beacon: pulsing gold ring.
    if (s.beacon) {
      const pulse = 5 + Math.sin(performance.now() / 240) * 2;
      ctx.strokeStyle = '#ffd23e'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(X(s.beacon.x), Y(s.beacon.z), pulse + 3, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#ffd23e';
      ctx.beginPath(); ctx.arc(X(s.beacon.x), Y(s.beacon.z), 3, 0, Math.PI * 2); ctx.fill();
    }
    const dot = (x, z, color, r = 2.5) => {
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(X(x), Y(z), r, 0, Math.PI * 2); ctx.fill();
    };
    for (const c of s.traffic || []) dot(c.x, c.z, 'rgba(200,200,200,0.8)', 2);
    for (const c of s.parked || []) dot(c.x, c.z, 'rgba(255,255,255,0.55)', 1.8);
    for (const h of s.hostiles || []) if (h.state === 'active') dot(h.pos.x, h.pos.z, '#ff4040', 3);
    for (const c of s.police || []) {
      const px = c.x !== undefined ? c.x : c.pos?.x;
      const pz = c.z !== undefined ? c.z : c.pos?.z;
      if (px !== undefined) dot(px, pz, '#3a8cff', 3);
    }
    // Player arrow.
    if (s.player) {
      const px = X(s.player.x), py = Y(s.player.z);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(Math.atan2(Math.sin(s.yaw), -Math.cos(s.yaw)));
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(4.5, 5); ctx.lineTo(-4.5, 5); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
  }
}

// The Continue button shows only when a save exists; the HUD asks the game.
let _hasSave = false;
export function setHasSave(v) { _hasSave = v; }
function actionsHasSave() { return _hasSave; }
