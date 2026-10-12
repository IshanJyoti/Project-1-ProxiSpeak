import { HEAR_RADIUS, HEAR_HYSTERESIS, dist } from '../../../shared/geo.js';

let iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
try { if (import.meta.env.VITE_ICE_SERVERS) iceServers = JSON.parse(import.meta.env.VITE_ICE_SERVERS); } catch { /* keep default */ }

// WebRTC audio mesh: one RTCPeerConnection per avatar currently in earshot.
// The server decides who may connect (peer:enter); the lower id always sends the offer, which avoids glare.
export class PeerManager {
  constructor({ socket, roomId, selfId, stream, mixer, onChange }) {
    Object.assign(this, { socket, roomId, selfId, stream, mixer, onChange });
    this.peers = new Map(); // id -> { pc, pendingIce, retry }
  }

  has(id) { return this.peers.has(id); }
  ids() { return [...this.peers.keys()]; }

  enter(id) {
    if (id === this.selfId || this.peers.has(id)) return;
    const pc = new RTCPeerConnection({ iceServers });
    const peer = { pc, pendingIce: [], retry: null };
    this.peers.set(id, peer);
    this.stream?.getTracks().forEach((t) => pc.addTrack(t, this.stream));
    if (!this.stream) pc.addTransceiver('audio', { direction: 'recvonly' });
    pc.onicecandidate = (e) => e.candidate && this.send(id, 'ice', e.candidate.toJSON());
    pc.ontrack = (e) => { if (e.streams[0]) { this.mixer.addPeer(id, e.streams[0]); this.onChange?.(); } };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') this.onChange?.();
      if (pc.connectionState === 'failed') this.recover(id);
    };
    if (this.selfId.localeCompare(id) < 0) this.makeOffer(id, pc);
    this.onChange?.();
  }

  async makeOffer(id, pc) {
    try {
      await pc.setLocalDescription(await pc.createOffer());
      this.send(id, 'offer', pc.localDescription.toJSON());
    } catch (err) { console.warn('offer failed', err); }
  }

  recover(id) {
    this.leave(id);
    const peer = setTimeout(() => this.onRetry?.(id), 1500);
    this.retryTimers = (this.retryTimers ?? new Set()).add(peer);
  }

  async handleSignal({ from, kind, payload }) {
    if (!this.peers.has(from)) this.enter(from);
    const peer = this.peers.get(from);
    if (!peer) return;
    const { pc } = peer;
    try {
      if (kind === 'offer') {
        await pc.setRemoteDescription(payload);
        await pc.setLocalDescription(await pc.createAnswer());
        this.send(from, 'answer', pc.localDescription.toJSON());
        await this.flushIce(peer);
      } else if (kind === 'answer') {
        await pc.setRemoteDescription(payload);
        await this.flushIce(peer);
      } else if (pc.remoteDescription) {
        await pc.addIceCandidate(payload);
      } else {
        peer.pendingIce.push(payload); // ICE arrived before the SDP
      }
    } catch (err) { console.warn('signal error', kind, err); }
  }

  async flushIce(peer) {
    for (const c of peer.pendingIce.splice(0)) await peer.pc.addIceCandidate(c).catch(() => {});
  }

  // Client-side hysteresis: drop connections once the avatar walks past DROP_RADIUS.
  sync(self, users, hearRadius = HEAR_RADIUS) {
    const dropRadius = hearRadius + HEAR_HYSTERESIS;
    for (const id of this.ids()) {
      const u = users.get(id);
      if (!u || dist(self, u) > dropRadius) this.leave(id);
    }
  }

  leave(id) {
    const peer = this.peers.get(id);
    if (!peer) return;
    peer.pc.ontrack = peer.pc.onicecandidate = peer.pc.onconnectionstatechange = null;
    try { peer.pc.close(); } catch { /* closed */ }
    this.mixer.removePeer(id);
    this.peers.delete(id);
    this.onChange?.();
  }

  closeAll() {
    this.retryTimers?.forEach(clearTimeout);
    for (const id of this.ids()) this.leave(id);
  }

  send(to, kind, payload) { this.socket.emit('rtc:signal', { roomId: this.roomId, to, kind, payload }); }
}
