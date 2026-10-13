import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import WorldCanvas from './world/WorldCanvas.jsx';
import { createWorld, colorFor, initials } from './world/world.js';
import { SpatialMixer } from './audio/SpatialMixer.js';
import { PeerManager } from './rtc/PeerManager.js';
import { SPAWN } from '../../shared/defaultLayout.js';
import { HEAR_RADIUS, HEAR_HYSTERESIS, HEAR_RADIUS_MIN, HEAR_RADIUS_MAX, HEAR_RADIUS_STEP, dist } from '../../shared/geo.js';

const ROOM_ID = 'main-office';

export default function App() {
  const world = useMemo(createWorld, []);
  const sessionRef = useRef(null);
  const sessionChannelRef = useRef(null);
  const tabIdRef = useRef(sessionStorage.getItem('proxispeak-tab-id') || `tab-${Math.random().toString(36).slice(2, 12)}`);
  const frameCount = useRef(0);
  const hearRadiusRef = useRef(HEAR_RADIUS);
  const [name, setName] = useState('');
  const [joined, setJoined] = useState(false);
  const [network, setNetwork] = useState('offline');
  const [error, setError] = useState('');
  const [micOn, setMicOn] = useState(true);
  const [deafened, setDeafened] = useState(false);
  const [volume, setVolume] = useState(80);
  const [roster, setRoster] = useState([]);
  const [nearby, setNearby] = useState(0);
  const [fps, setFps] = useState(0);
  const [hasMic, setHasMic] = useState(false);
  const [mixer, setMixer] = useState(null);
  const [showObstacles, setShowObstacles] = useState(false);
  const [hearRadius, setHearRadius] = useState(HEAR_RADIUS);
  const [rangeDraft, setRangeDraft] = useState(HEAR_RADIUS);
  const [savingRange, setSavingRange] = useState(false);
  const [rangeError, setRangeError] = useState('');
  const [needsAdminToken, setNeedsAdminToken] = useState(false);
  const [adminToken, setAdminToken] = useState('');
  hearRadiusRef.current = hearRadius;

  useEffect(() => {
    let active = true;
    fetch(`/api/rooms/${ROOM_ID}/settings`)
      .then((response) => {
        if (!response.ok) throw new Error('Could not load room audio settings.');
        return response.json();
      })
      .then(({ hearRadius: savedRadius }) => {
        if (active && Number.isInteger(savedRadius)) {
          setHearRadius(savedRadius);
          setRangeDraft(savedRadius);
        }
      })
      .catch((err) => { if (active) setRangeError(err.message); });
    return () => { active = false; };
  }, []);

  const refreshRoster = useCallback(() => {
    setRoster([...world.users.values()].map(({ id, name, color }) => ({ id, name, color })));
  }, [world]);

  const addUser = useCallback((u) => {
    const prev = world.users.get(u.id);
    world.users.set(u.id, { id: u.id, name: u.name, color: u.color, x: u.x, y: u.y, rx: prev?.rx ?? u.x, ry: prev?.ry ?? u.y });
  }, [world]);

  const teardown = useCallback(() => {
    const s = sessionRef.current;
    if (!s) return;
    s.peers.closeAll();
    s.mixer.close();
    s.stream?.getTracks().forEach((t) => t.stop());
    clearInterval(s.heartbeat);
    s.socket.removeAllListeners();
    s.socket.disconnect();
    sessionRef.current = null;
    world.users.clear();
    world.connected.clear();
    setMixer(null);
  }, [world]);

  useEffect(() => teardown, [teardown]);

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return undefined;
    sessionStorage.setItem('proxispeak-tab-id', tabIdRef.current);
    const channel = new BroadcastChannel('proxispeak-session');
    const onSession = ({ data }) => {
      if (data?.type !== 'takeover' || data.tabId === tabIdRef.current) return;
      if (data.id === world.selfId && sessionRef.current) {
        leave();
        setError('This participant is already active in another tab. That tab was signed out to prevent duplicate avatars and audio echo.');
      }
    };
    channel.addEventListener('message', onSession);
    sessionChannelRef.current = channel;
    return () => {
      channel.removeEventListener('message', onSession);
      channel.close();
      sessionChannelRef.current = null;
    };
  }, [teardown, world]);

  const join = async (withMic) => {
    setError('');
    const displayName = name.trim();
    if (!displayName) return setError('Please enter your name first.');
    let stream;
    if (withMic) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
      } catch {
        return setError('Microphone unavailable or blocked. You can still join in listen-only mode.');
      }
    }
    let selfId = localStorage.getItem('proxispeak-id');
    if (!selfId) {
      selfId = `u-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem('proxispeak-id', selfId);
    }
    sessionChannelRef.current?.postMessage({ type: 'takeover', id: selfId, tabId: tabIdRef.current });
    world.selfId = selfId;
    world.selfName = displayName;
    world.selfColor = colorFor(selfId);
    world.self = { ...SPAWN };

    const m = new SpatialMixer();
    await m.resume();
    m.setVolume(volume / 100);
    const socket = io({ path: '/api/socket.io', transports: ['websocket', 'polling'] });
    const peers = new PeerManager({ socket, roomId: ROOM_ID, selfId, stream, mixer: m, onChange: () => { world.connected = new Set(peers.ids().filter((id) => m.peers.has(id))); } });
    peers.onRetry = (id) => { const u = world.users.get(id); if (u && dist(world.self, u) <= hearRadiusRef.current + HEAR_HYSTERESIS) peers.enter(id); };
    const heartbeat = setInterval(() => socket.emit('presence:ping'), 30_000);
    sessionRef.current = { socket, peers, mixer: m, stream, heartbeat };
    setMixer(m);
    setHasMic(Boolean(stream));
    setMicOn(true);
    setNetwork('connecting');
    setJoined(true);

    socket.on('connect', () => {
      setNetwork('connected');
      socket.emit('room:join', { roomId: ROOM_ID, participant: { id: selfId, displayName, color: world.selfColor, x: world.self.x, y: world.self.y } });
    });
    socket.on('disconnect', () => setNetwork('reconnecting'));
    socket.on('connect_error', () => setNetwork('reconnecting'));
    socket.on('room:error', (e) => setError(e.message));
    socket.on('layout:update', ({ obstacles, hearRadius: savedRadius }) => {
      world.obstacles = obstacles;
      if (Number.isInteger(savedRadius)) {
        setHearRadius(savedRadius);
        setRangeDraft(savedRadius);
      }
    });
    socket.on('audio:settings', ({ hearRadius: savedRadius }) => {
      if (!Number.isInteger(savedRadius)) return;
      setHearRadius(savedRadius);
      setRangeDraft(savedRadius);
      setRangeError('');
    });
    socket.on('world:snapshot', ({ users }) => {
      world.users.clear();
      users.filter((u) => u.id !== selfId).forEach(addUser);
      refreshRoster();
    });
    socket.on('world:delta', ({ moves }) => {
      for (const [id, x, y] of moves) { const u = world.users.get(id); if (u) { u.x = x; u.y = y; } }
    });
    socket.on('user:join', (u) => { if (u.id !== selfId) { addUser(u); refreshRoster(); } });
    socket.on('user:leave', ({ id }) => { peers.leave(id); world.users.delete(id); refreshRoster(); });
    socket.on('peer:enter', ({ id }) => peers.enter(id));
    socket.on('peer:leave', ({ id }) => peers.leave(id));
    socket.on('rtc:signal', (msg) => peers.handleSignal(msg));
  };

  const leave = () => {
    sessionRef.current?.socket.emit('room:leave');
    teardown();
    setJoined(false);
    setNetwork('offline');
    setRoster([]);
    setNearby(0);
    setName('');
  };

  const onMove = useCallback((x, y) => {
    sessionRef.current?.socket.emit('avatar:move', { roomId: ROOM_ID, x, y });
  }, []);

  // runs every animation frame: audio mixing every frame, peer pruning + HUD ~6x/second
  const onFrame = useCallback(() => {
    const s = sessionRef.current;
    if (!s) return;
    s.mixer.update(world.self, world.users, world.obstacles, hearRadiusRef.current);
    if (++frameCount.current % 10 === 0) {
      s.peers.sync(world.self, world.users, hearRadiusRef.current);
      let n = 0;
      for (const u of world.users.values()) if (dist(world.self, u) <= hearRadiusRef.current) n++;
      setNearby(n);
    }
  }, [world]);

  const toggleMic = () => {
    const stream = sessionRef.current?.stream;
    if (!stream) return;
    const next = !micOn;
    stream.getAudioTracks().forEach((t) => { t.enabled = next; });
    setMicOn(next);
  };
  const toggleDeafen = () => { const next = !deafened; setDeafened(next); sessionRef.current?.mixer.setMuted(next); };
  const changeVolume = (v) => { setVolume(v); sessionRef.current?.mixer.setVolume(v / 100); };
  const saveHearRadius = async () => {
    setSavingRange(true);
    setRangeError('');
    try {
      const url = `/api/rooms/${ROOM_ID}/settings`;
      const options = {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(adminToken ? { 'x-admin-token': adminToken } : {}),
        },
        body: JSON.stringify({ hearRadius: rangeDraft }),
      };
      const response = await fetch(url, options);
      if (response.status === 401 && !adminToken) {
        setNeedsAdminToken(true);
        throw new Error('Enter the room admin token to save this range.');
      }
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not save listening range.');
      setHearRadius(result.hearRadius);
      setRangeDraft(result.hearRadius);
      setNeedsAdminToken(false);
      setAdminToken('');
    } catch (err) {
      setRangeError(err.message || 'Could not save listening range.');
    } finally {
      setSavingRange(false);
    }
  };
  const toggleObstacles = () => {
    world.showDebug = !world.showDebug;
    setShowObstacles(world.showDebug);
  };

  const statusText = { offline: 'Not in the office', connecting: 'Connecting…', connected: 'Live', reconnecting: 'Reconnecting…' }[network];
  const micControlText = !joined ? 'Microphone' : hasMic ? (micOn ? 'Microphone' : 'Microphone muted') : 'Listen-only mode';
  const micControlState = !joined ? 'READY' : hasMic ? (micOn ? 'ON' : 'OFF') : 'N/A';
  const roomControlState = !joined ? 'READY' : deafened ? 'OFF' : 'ON';

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <div><h1>proxi<span>speak</span></h1><small>THE SPATIAL OFFICE</small></div>
        </div>
        <div className="topbar-right">
          <div className="room-chip"><span className="room-dot" />MAIN OFFICE</div>
          <div className="status"><i className={`led ${network}`} />{statusText}{joined && <span className="fps">{fps} FPS</span>}</div>
        </div>
      </header>

      <main className="layout">
        <section className="stage">
          <div className="stage-toolbar">
            <div>
              <span className="eyebrow">YOUR WORKSPACE</span>
              <h2>Open office <span className="map-live"><i className={`led ${network}`} />{joined ? statusText : 'Ready to join'}</span></h2>
            </div>
            <button className={`map-action${showObstacles ? ' is-active' : ''}`} onClick={toggleObstacles} aria-pressed={showObstacles}>
              <span aria-hidden="true">▧</span>{showObstacles ? 'Hide layout' : 'Show layout'}
            </button>
          </div>
          <div className="map-frame">
            <WorldCanvas world={world} mixer={mixer} hearRadius={hearRadius} onMove={onMove} onFrame={onFrame} onStats={(s) => setFps(s.fps)} onDebugChange={setShowObstacles} />
            {!joined && (
              <div className="overlay">
                <div className="card">
                  <div className="card-kicker"><span /> YOUR DESK IS WAITING</div>
                  <h2>Good conversations<br />happen nearby.</h2>
                  <p>Step into the office. Move closer to teammates to hear them naturally.</p>
                  <label className="name-label" htmlFor="display-name">YOUR NAME</label>
                  <input id="display-name" value={name} maxLength={32} placeholder="e.g. Alex Morgan" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && join(true)} />
                  <div className="join-actions">
                    <button className="primary" onClick={() => join(true)}><span aria-hidden="true">◉</span> Join with microphone</button>
                    <button className="listen-button" onClick={() => join(false)}>Listen only</button>
                  </div>
                  {error && <p className="error" role="alert">{error}</p>}
                </div>
              </div>
            )}
            <div className="map-corner-label"><span>⌖</span> MAIN OFFICE <i /> 1000 × 540</div>
          </div>
          <div className="hint"><span className="hint-icon">↖</span><span><b>Click anywhere</b> to walk</span><span className="hint-divider" /><span><b>WASD</b> or arrow keys to move</span><kbd>SHIFT</kbd><span>to run</span><span className="hint-divider" /><span><kbd>O</kbd> layout</span></div>
        </section>

        <aside className="side">
          <section className="panel">
            <div className="panel-heading"><div><span className="eyebrow">AUDIO</span><h3>Quick controls</h3></div><span className={`audio-state${joined ? ' active' : ''}`}><i />{joined ? 'ACTIVE' : 'IDLE'}</span></div>
            <div className="control-stack">
              <button className={`control-button${!micOn && joined && hasMic ? ' selected' : ''}`} onClick={toggleMic} disabled={!joined || !hasMic} aria-pressed={joined && hasMic && !micOn}>
                <span className="control-icon" aria-hidden="true">{micOn ? '♩' : '♬'}</span><span>{micControlText}</span><b>{micControlState}</b>
              </button>
              <button className={`control-button${deafened ? ' selected' : ''}`} onClick={toggleDeafen} disabled={!joined} aria-pressed={deafened}>
                <span className="control-icon" aria-hidden="true">{deafened ? '◌' : '◖'}</span><span>{deafened ? 'Room audio muted' : 'Room audio'}</span><b>{roomControlState}</b>
              </button>
            </div>
            <label className="vol"><span>Room volume</span><b>{volume}%</b><input aria-label="Room volume" type="range" min="0" max="100" value={volume} onChange={(e) => changeVolume(Number(e.target.value))} /></label>
            <button className="leave" onClick={leave} disabled={!joined}><span aria-hidden="true">↗</span> Leave office</button>
            {joined && error && <p className="error" role="alert">{error}</p>}
          </section>
          <section className="panel">
            <div className="panel-heading"><div><span className="eyebrow">PROXIMITY AUDIO</span><h3>Within earshot</h3></div><span className="count-badge">{nearby}</span></div>
            <div className="range-meter"><span style={{ width: `${Math.min(100, (nearby / Math.max(roster.length, 1)) * 100)}%` }} /></div>
            <p className="muted">{nearby ? `${nearby} ${nearby === 1 ? 'teammate is' : 'teammates are'} close enough to hear.` : 'Walk closer to a teammate to hear their conversation.'}</p>
            <p className="range-note">Clear range <b>{hearRadius}px</b><span>·</span> reconnects until {hearRadius + HEAR_HYSTERESIS}px</p>
            <div className="range-setting">
              <label htmlFor="hear-radius"><span>Listening distance</span><b>{rangeDraft}px</b></label>
              <input id="hear-radius" type="range" min={HEAR_RADIUS_MIN} max={HEAR_RADIUS_MAX} step={HEAR_RADIUS_STEP} value={rangeDraft} onChange={(e) => setRangeDraft(Number(e.target.value))} />
              <button className="save-range" onClick={saveHearRadius} disabled={savingRange || rangeDraft === hearRadius}>
                {savingRange ? 'Saving…' : rangeDraft === hearRadius ? 'Range saved' : 'Save range'}
              </button>
              {needsAdminToken && (
                <label className="admin-token-label" htmlFor="room-admin-token">
                  Room admin token
                  <input id="room-admin-token" type="password" autoComplete="off" value={adminToken} onChange={(e) => setAdminToken(e.target.value)} />
                </label>
              )}
              {rangeError && <p className="error" role="alert">{rangeError}</p>}
            </div>
          </section>
          <section className="panel">
            <div className="panel-heading"><div><span className="eyebrow">TEAM</span><h3>In the office</h3></div><span className="count-badge">{joined ? roster.length + 1 : 0}</span></div>
            <ul className="people">
              {joined && <li><span className="dot self-dot" style={{ background: world.selfColor }}>{initials(name)}</span><span className="person-name">{name}<small>You</small></span><span className="online-dot" /></li>}
              {roster.map((p) => <li key={p.id}><span className="dot" style={{ background: p.color }}>{initials(p.name)}</span><span className="person-name">{p.name}<small>In the office</small></span><span className="online-dot" /></li>)}
              {!joined && <li className="empty-roster">Join the room to meet your team.</li>}
              {joined && roster.length === 0 && <li className="empty-roster">You’re the first one here. Invite your team!</li>}
            </ul>
          </section>
        </aside>
      </main>
    </div>
  );
}
