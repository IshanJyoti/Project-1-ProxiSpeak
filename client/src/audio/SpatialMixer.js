import { attenuation, occlusion, pan, dist, HEAR_RADIUS } from '../../../shared/geo.js';

// Web Audio graph per peer:  MediaStreamSource -> Gain (distance + wall attenuation) -> StereoPanner (left/right ear) -> master
export class SpatialMixer {
  constructor() {
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.peers = new Map();
    this.volume = 0.8;
    this.muted = false;
  }
  resume() { return this.ctx.state === 'suspended' ? this.ctx.resume() : Promise.resolve(); }

  addPeer(id, stream) {
    this.removePeer(id);
    // Chromium only delivers remote WebRTC audio to Web Audio if the stream is also attached to a (muted) media element.
    const el = new Audio();
    el.srcObject = stream;
    el.muted = true;
    el.play().catch(() => {});
    const src = this.ctx.createMediaStreamSource(stream);
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    const panner = this.ctx.createStereoPanner();
    const analyser = this.ctx.createAnalyser();
    analyser.fftSize = 256;
    src.connect(gain);
    gain.connect(panner);
    panner.connect(this.master);
    src.connect(analyser);
    this.peers.set(id, { el, src, gain, panner, analyser, buf: new Uint8Array(analyser.fftSize), level: 0, g: 0 });
  }

  removePeer(id) {
    const p = this.peers.get(id);
    if (!p) return;
    try { p.src.disconnect(); p.gain.disconnect(); p.panner.disconnect(); p.el.srcObject = null; } catch { /* already gone */ }
    this.peers.delete(id);
  }

  // Call every frame (cheap: only connected peers).
  update(self, users, obstacles, hearRadius = HEAR_RADIUS) {
    const t = this.ctx.currentTime;
    for (const [id, p] of this.peers) {
      const u = users.get(id);
      if (!u) { p.gain.gain.setTargetAtTime(0, t, 0.05); p.g = 0; continue; }
      const d = dist(self, u);
      const occ = occlusion(self, u, obstacles);       // walls/furniture between us block sound
      p.g = this.muted ? 0 : attenuation(d, occ, hearRadius) * this.volume;
      p.gain.gain.setTargetAtTime(p.g, t, 0.06);       // smooth cross-fade, no clicks
      p.panner.pan.setTargetAtTime(pan(u.x - self.x, hearRadius), t, 0.06);
    }
  }

  // 0..1 voice activity of a peer, for the "speaking" ring.
  levelOf(id) {
    const p = this.peers.get(id);
    if (!p) return 0;
    p.analyser.getByteTimeDomainData(p.buf);
    let peak = 0;
    for (const v of p.buf) peak = Math.max(peak, Math.abs(v - 128));
    p.level = peak / 128;
    return p.level;
  }

  setVolume(v) { this.volume = v; }
  setMuted(m) { this.muted = m; }
  close() { for (const id of [...this.peers.keys()]) this.removePeer(id); this.ctx.close().catch(() => {}); }
}
