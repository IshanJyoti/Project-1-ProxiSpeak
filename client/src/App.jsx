import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import WorldCanvas from './world/WorldCanvas.jsx';
import { createWorld, colorFor } from './world/world.js';
import { SpatialMixer } from './audio/SpatialMixer.js';
import { PeerManager } from './rtc/PeerManager.js';
import { SPAWN } from '../../shared/defaultLayout.js';
import { WORLD, HEAR_RADIUS, HEAR_HYSTERESIS, HEAR_RADIUS_MIN, HEAR_RADIUS_MAX, HEAR_RADIUS_STEP, dist } from '../../shared/geo.js';
import { AVATAR_CHOICES, AVATAR_IDS, DEFAULT_AVATAR_ID, avatarById } from '../../shared/avatars.js';
import { MAX_DISPLAY_NAME_LENGTH, normalizeDisplayName } from '../../shared/name.js';

const ROOM_ID = 'main-office';
const ACTIVE_SESSION_KEY = 'proxispeak-active-session';
const AVATAR_PREFERENCE_KEY = 'proxispeak-avatar-id';
const MICROPHONE_PREFERENCE_KEY = 'proxispeak-microphone-id';
const QUICK_REACTIONS = [
  '👍', '❤️', '😂', '👀', '🎉', '🙌',
  '🔥', '💯', '👏', '😍', '🤔', '😎', '🚀', '☕', '👋', '🙏',
  '💡', '✅', '❌', '🤝', '🥳', '😴', '💪', '🌟', '😢', '🤯',
];

async function microphoneErrorMessage(error) {
  if (!navigator.mediaDevices?.getUserMedia) {
    return 'This page cannot access a microphone. Open the direct HTTPS website (not an embedded preview) in Edge.';
  }
  if (!window.isSecureContext) {
    return 'The browser only allows microphone access on HTTPS or localhost. Open the secure HTTPS link directly in Edge.';
  }
  const policy = document.permissionsPolicy ?? document.featurePolicy;
  if (policy?.allowsFeature && !policy.allowsFeature('microphone')) {
    return 'The website host is blocking microphone access with its Permissions-Policy. The site owner must allow microphone for this page.';
  }
  let permissionState;
  try {
    permissionState = (await navigator.permissions?.query({ name: 'microphone' }))?.state;
  } catch {
    permissionState = undefined;
  }
  switch (error?.name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      if (permissionState === 'granted') {
        return 'Edge reports microphone permission as allowed, but Windows or the website host blocked capture. Check Windows microphone privacy, close apps using the mic, and open the HTTPS link directly in Edge (not an embedded preview).';
      }
      return 'Edge blocked microphone access. Allow Microphone in the site permissions beside the address bar, then click Enable microphone in Quick controls.';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'No microphone was found. Connect or enable a microphone, then click Enable microphone in Quick controls.';
    case 'NotReadableError':
    case 'TrackStartError':
      return 'The microphone is busy or unavailable to Windows. Close apps using it and check Windows microphone privacy settings, then retry.';
    case 'OverconstrainedError':
      return 'The selected microphone does not support the requested audio settings. Choose another microphone in Edge settings and retry.';
    case 'SecurityError':
      return 'The browser blocked microphone access for this page. Open it over HTTPS and allow Microphone in Edge site permissions.';
    case 'AbortError':
      return 'The browser could not start the microphone. Check that it is connected and retry.';
    default:
      return `The browser could not start the microphone${error?.message ? `: ${error.message}` : '.'}`;
  }
}

function readSavedSession() {
  const saved = sessionStorage.getItem(ACTIVE_SESSION_KEY);
  if (!saved) return null;
  try {
    const session = JSON.parse(saved);
    if (typeof session.displayName !== 'string' || !session.displayName.trim()) return null;
    const { x, y } = session;
    return {
      displayName: session.displayName,
      avatarId: AVATAR_IDS.has(session.avatarId) ? session.avatarId : DEFAULT_AVATAR_ID,
      position: Number.isFinite(x) && Number.isFinite(y) &&
        x >= 0 && x <= WORLD.width && y >= 0 && y <= WORLD.height
        ? { x, y }
        : { ...SPAWN },
    };
  } catch {
    return null;
  }
}

export default function App() {
  const world = useMemo(createWorld, []);
  const sessionRef = useRef(null);
  const sessionChannelRef = useRef(null);
  const restoreStartedRef = useRef(false);
  const tabIdRef = useRef(sessionStorage.getItem('proxispeak-tab-id') || `tab-${Math.random().toString(36).slice(2, 12)}`);
  const frameCount = useRef(0);
  const hearRadiusRef = useRef(HEAR_RADIUS);
  const [name, setName] = useState('');
  const [selectedAvatarId, setSelectedAvatarId] = useState(() => {
    const saved = localStorage.getItem(AVATAR_PREFERENCE_KEY);
    return AVATAR_IDS.has(saved) ? saved : DEFAULT_AVATAR_ID;
  });
  const [joined, setJoined] = useState(false);
  const [network, setNetwork] = useState('offline');
  const [error, setError] = useState('');
  const [nameError, setNameError] = useState('');
  const [micOn, setMicOn] = useState(true);
  const [deafened, setDeafened] = useState(false);
  const [volume, setVolume] = useState(80);
  const [roster, setRoster] = useState([]);
  const [chatEvents, setChatEvents] = useState([]);
  const [chatDraft, setChatDraft] = useState('');
  const [nearby, setNearby] = useState(0);
  const [fps, setFps] = useState(0);
  const [hasMic, setHasMic] = useState(false);
  const [audioInputs, setAudioInputs] = useState([]);
  const [selectedMicrophoneId, setSelectedMicrophoneId] = useState(() => localStorage.getItem(MICROPHONE_PREFERENCE_KEY) || '');
  const [switchingMicrophone, setSwitchingMicrophone] = useState(false);
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

  useEffect(() => {
    let active = true;
    const updateAudioInputs = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (!active) return;
        const inputs = devices.filter((device) => device.kind === 'audioinput');
        setAudioInputs(inputs);
        setSelectedMicrophoneId((current) => {
          if (!current || inputs.length === 0 || inputs.some((device) => device.deviceId === current)) return current;
          localStorage.removeItem(MICROPHONE_PREFERENCE_KEY);
          return '';
        });
      } catch (enumerationError) {
        if (active) setError(`Could not list microphones: ${enumerationError.message || 'Device discovery failed.'}`);
      }
    };
    void updateAudioInputs();
    navigator.mediaDevices?.addEventListener?.('devicechange', updateAudioInputs);
    return () => {
      active = false;
      navigator.mediaDevices?.removeEventListener?.('devicechange', updateAudioInputs);
    };
  }, [hasMic]);

  const refreshRoster = useCallback(() => {
    const session = sessionRef.current;
    setRoster([...world.users.values()].map(({ id, name, color, avatarId, muted }) => ({
      id,
      name,
      color,
      avatarId,
      muted,
      connection: session?.peers.statusOf(id) ?? 'outside',
      speaking: Boolean(session?.mixer.levelOf(id) > 0.08),
    })));
  }, [world]);

  const addUser = useCallback((u) => {
    const prev = world.users.get(u.id);
    world.users.set(u.id, { id: u.id, name: u.name, color: u.color, avatarId: u.avatarId ?? DEFAULT_AVATAR_ID, muted: u.muted ?? true, x: u.x, y: u.y, rx: prev?.rx ?? u.x, ry: prev?.ry ?? u.y });
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
    world.connectionStatuses.clear();
    setMixer(null);
  }, [world]);

  useEffect(() => teardown, [teardown]);

  useEffect(() => {
    const savePosition = () => {
      if (!sessionRef.current) return;
      sessionStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify({
        displayName: world.selfName,
        avatarId: world.selfAvatarId,
        x: world.self.x,
        y: world.self.y,
      }));
    };
    window.addEventListener('pagehide', savePosition);
    return () => window.removeEventListener('pagehide', savePosition);
  }, [world]);

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

  const join = async (withMic, savedSession = null) => {
    setError('');
    setNameError('');
    const displayName = normalizeDisplayName(savedSession?.displayName ?? name);
    const avatarId = savedSession?.avatarId ?? selectedAvatarId;
    if (!displayName) {
      setNameError('Enter your name before joining. Spaces alone are not a name.');
      return;
    }
    if (displayName.length > MAX_DISPLAY_NAME_LENGTH) {
      setNameError(`Your name must be ${MAX_DISPLAY_NAME_LENGTH} characters or fewer.`);
      return;
    }
    setName(displayName);
    let stream;
    if (withMic) {
      setSwitchingMicrophone(true);
      try {
        const audio = selectedMicrophoneId ? { deviceId: { exact: selectedMicrophoneId } } : true;
        stream = await navigator.mediaDevices.getUserMedia({ audio });
      } catch (micError) {
        setError(`${await microphoneErrorMessage(micError)} You can join now in listen-only mode and enable your microphone later.`);
      } finally {
        setSwitchingMicrophone(false);
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
    world.selfAvatarId = avatarId;
    world.selfMuted = !stream;
    world.selfColor = colorFor(selfId);
    world.self = savedSession ? { ...savedSession.position } : { ...SPAWN };

    const m = new SpatialMixer();
    await m.resume();
    m.setVolume(volume / 100);
    const socket = io({ path: '/api/socket.io', transports: ['websocket', 'polling'] });
    const peers = new PeerManager({ socket, roomId: ROOM_ID, selfId, stream, mixer: m, onChange: () => {
      world.connected = new Set(peers.ids().filter((id) => m.peers.has(id)));
      world.connectionStatuses = new Map(peers.statuses);
      refreshRoster();
    } });
    peers.onRetry = (id) => { const u = world.users.get(id); if (u && dist(world.self, u) <= hearRadiusRef.current + HEAR_HYSTERESIS) peers.enter(id); };
    const heartbeat = setInterval(() => socket.emit('presence:ping'), 30_000);
    sessionRef.current = { socket, peers, mixer: m, stream, heartbeat };
    setMixer(m);
    setHasMic(Boolean(stream));
    setMicOn(Boolean(stream));
    setNetwork('connecting');
    setJoined(true);
    sessionStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify({
      displayName,
      avatarId,
      x: world.self.x,
      y: world.self.y,
    }));

    socket.on('connect', () => {
      setNetwork('connected');
      socket.emit('room:join', { roomId: ROOM_ID, participant: { id: selfId, displayName, avatarId, color: world.selfColor, x: world.self.x, y: world.self.y, muted: world.selfMuted } });
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
    socket.on('voice:status', ({ id, muted }) => {
      const user = world.users.get(id);
      if (!user || typeof muted !== 'boolean') return;
      user.muted = muted;
      refreshRoster();
    });
    socket.on('peer:enter', ({ id }) => peers.enter(id));
    socket.on('peer:leave', ({ id }) => peers.leave(id));
    socket.on('rtc:signal', (msg) => peers.handleSignal(msg));
    socket.on('chat:event', (event) => {
      setChatEvents((current) => [...current, event].slice(-100));
    });
  };

  useEffect(() => {
    if (restoreStartedRef.current) return;
    const savedSession = readSavedSession();
    if (!savedSession) return;
    restoreStartedRef.current = true;
    setName(savedSession.displayName);
    setSelectedAvatarId(savedSession.avatarId);
    void join(false, savedSession);
  }, []);

  const leave = () => {
    sessionRef.current?.socket.emit('room:leave');
    teardown();
    sessionStorage.removeItem(ACTIVE_SESSION_KEY);
    setJoined(false);
    setNetwork('offline');
    setRoster([]);
    setChatEvents([]);
    setChatDraft('');
    setNearby(0);
    setName('');
  };

  const onMove = useCallback((x, y) => {
    const session = sessionRef.current;
    if (!session) return;
    session.socket.emit('avatar:move', { roomId: ROOM_ID, x, y });
    sessionStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify({
      displayName: world.selfName,
      avatarId: world.selfAvatarId,
      x,
      y,
    }));
  }, [world]);

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
      refreshRoster();
    }
  }, [refreshRoster, world]);

  const toggleMic = () => {
    const stream = sessionRef.current?.stream;
    if (!stream) return;
    const next = !micOn;
    stream.getAudioTracks().forEach((t) => { t.enabled = next; });
    setMicOn(next);
    world.selfMuted = !next;
    sessionRef.current?.socket.emit('voice:status', { muted: !next });
    refreshRoster();
  };
  const enableMic = async () => {
    const session = sessionRef.current;
    if (!session) return;
    setSwitchingMicrophone(true);
    try {
      const audio = selectedMicrophoneId ? { deviceId: { exact: selectedMicrophoneId } } : true;
      const stream = await navigator.mediaDevices.getUserMedia({ audio });
      if (sessionRef.current !== session) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      session.stream = stream;
      const peerIds = session.peers.ids();
      session.peers.closeAll();
      session.peers.stream = stream;
      setHasMic(true);
      setMicOn(true);
      world.selfMuted = false;
      setError('');
      session.socket.emit('voice:status', { muted: false });
      for (const id of peerIds) session.peers.enter(id);
    } catch (micError) {
      setError(await microphoneErrorMessage(micError));
    } finally {
      setSwitchingMicrophone(false);
    }
  };
  const chooseMicrophone = async (event) => {
    const deviceId = event.target.value;
    const session = sessionRef.current;
    if (!session || !hasMic) {
      setSelectedMicrophoneId(deviceId);
      localStorage.setItem(MICROPHONE_PREFERENCE_KEY, deviceId);
      return;
    }

    setSwitchingMicrophone(true);
    try {
      const audio = deviceId ? { deviceId: { exact: deviceId } } : true;
      const stream = await navigator.mediaDevices.getUserMedia({ audio });
      if (sessionRef.current !== session) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.getAudioTracks().forEach((track) => { track.enabled = micOn; });
      const previousStream = session.stream;
      const peerIds = session.peers.ids();
      session.peers.closeAll();
      session.stream = stream;
      session.peers.stream = stream;
      previousStream?.getTracks().forEach((track) => track.stop());
      for (const id of peerIds) session.peers.enter(id);
      setSelectedMicrophoneId(deviceId);
      localStorage.setItem(MICROPHONE_PREFERENCE_KEY, deviceId);
      setError('');
    } catch (micError) {
      setError(await microphoneErrorMessage(micError));
    } finally {
      setSwitchingMicrophone(false);
    }
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
  const sendChat = (event) => {
    event.preventDefault();
    const text = chatDraft.trim();
    if (!text || !joined) return;
    sessionRef.current?.socket.emit('chat:send', { text });
    setChatDraft('');
  };
  const sendReaction = (reaction) => {
    sessionRef.current?.socket.emit('reaction:send', { reaction });
  };
  const retryConnection = () => {
    const socket = sessionRef.current?.socket;
    if (!socket) return;
    socket.disconnect();
    setNetwork('connecting');
    socket.connect();
  };

  const statusText = { offline: 'Not in the office', connecting: 'Connecting…', connected: 'Live', reconnecting: 'Reconnecting…' }[network];
  const micControlText = !joined ? 'Microphone' : hasMic ? (micOn ? 'Microphone' : 'Microphone muted') : 'Enable microphone';
  const micControlState = !joined ? 'READY' : hasMic ? (micOn ? 'ON' : 'OFF') : 'OFF';
  const roomControlState = !joined ? 'READY' : deafened ? 'OFF' : 'ON';
  const localVoiceStatus = !hasMic || world.selfMuted ? 'Microphone muted' : 'Microphone on';

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <div><h1>proxi<span>speak</span></h1><small>THE SPATIAL OFFICE</small></div>
        </div>
        <div className="topbar-right">
          <div className="room-chip"><span className="room-dot" />MAIN OFFICE</div>
          <div className="status"><i className={`led ${network}`} />{statusText}{joined && network === 'reconnecting' && <button type="button" className="retry-connection" onClick={retryConnection}>Retry</button>}{joined && <span className="fps">{fps} FPS</span>}</div>
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
                  <input id="display-name" value={name} maxLength={MAX_DISPLAY_NAME_LENGTH} placeholder="e.g. Alex Morgan" aria-invalid={Boolean(nameError)} aria-describedby={nameError ? 'display-name-error' : undefined} onChange={(e) => { setName(e.target.value); setNameError(''); setError(''); }} onKeyDown={(e) => e.key === 'Enter' && join(true)} />
                  {nameError && <p id="display-name-error" className="error" role="alert">{nameError}</p>}
                  <div className="avatar-selection">
                    <span className="name-label">CHOOSE YOUR AVATAR</span>
                    <div className="avatar-grid" role="group" aria-label="Choose your avatar">
                      {AVATAR_CHOICES.map((avatar) => (
                        <button
                          className={`avatar-choice${selectedAvatarId === avatar.id ? ' selected' : ''}`}
                          key={avatar.id}
                          type="button"
                          aria-label={`${avatar.label} avatar`}
                          aria-pressed={selectedAvatarId === avatar.id}
                          onClick={() => {
                            setSelectedAvatarId(avatar.id);
                            localStorage.setItem(AVATAR_PREFERENCE_KEY, avatar.id);
                          }}
                        >
                          <span className="avatar-preview" style={{ background: avatar.background }}>
                            <AvatarPreview avatarId={avatar.id} />
                          </span>
                          <span>{avatar.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
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
          <section className="chat-panel" aria-label="Team chat">
            <div className="chat-heading">
              <div><span className="eyebrow">ASYNC CONVERSATION</span><h3>Team chat</h3></div>
              <span className="chat-presence">{joined ? 'Room-wide' : 'Join to chat'}</span>
            </div>
            <div className="chat-feed" role="log" aria-live="polite" aria-relevant="additions">
              {chatEvents.length === 0 ? <p className="chat-empty">Messages and reactions from the office will appear here.</p> : chatEvents.map((event) => (
                <div className={`chat-event${event.type === 'reaction' ? ' reaction-event' : ''}`} key={event.id}>
                  <span className="chat-event-name">{event.displayName}</span>
                  {event.type === 'reaction' ? <span className="chat-reaction">{event.reaction}</span> : <span className="chat-message">{event.text}</span>}
                </div>
              ))}
            </div>
            <div className="reaction-row" aria-label="Quick reactions">
              {QUICK_REACTIONS.map((reaction) => <button key={reaction} type="button" className="reaction-button" onClick={() => sendReaction(reaction)} disabled={!joined} aria-label={`Send ${reaction} reaction`}>{reaction}</button>)}
            </div>
            <form className="chat-compose" onSubmit={sendChat}>
              <input aria-label="Write a message" value={chatDraft} maxLength={500} onChange={(event) => setChatDraft(event.target.value)} placeholder={joined ? 'Write a message…' : 'Join the office to send a message'} disabled={!joined} />
              <button type="submit" className="chat-send" disabled={!joined || !chatDraft.trim()} aria-label="Send message">Send</button>
            </form>
          </section>
        </section>

        <aside className="side">
          <section className="panel">
            <div className="panel-heading"><div><span className="eyebrow">AUDIO</span><h3>Quick controls</h3></div><span className={`audio-state${joined ? ' active' : ''}`}><i />{joined ? 'ACTIVE' : 'IDLE'}</span></div>
            <div className="control-stack">
              <button className={`control-button${!micOn && joined && hasMic ? ' selected' : ''}`} onClick={hasMic ? toggleMic : enableMic} disabled={!joined} aria-pressed={joined && hasMic && !micOn}>
                <span className="control-icon" aria-hidden="true">{micOn ? '♩' : '♬'}</span><span>{micControlText}</span><b>{micControlState}</b>
              </button>
              <button className={`control-button${deafened ? ' selected' : ''}`} onClick={toggleDeafen} disabled={!joined} aria-pressed={deafened}>
                <span className="control-icon" aria-hidden="true">{deafened ? '◌' : '◖'}</span><span>{deafened ? 'Room audio muted' : 'Room audio'}</span><b>{roomControlState}</b>
              </button>
            </div>
            <label className="microphone-select">
              <span>Microphone input</span>
              <select aria-label="Microphone input" value={selectedMicrophoneId} onChange={chooseMicrophone} disabled={switchingMicrophone || audioInputs.length === 0}>
                <option value="">System default</option>
                {audioInputs.map((device, index) => (
                  <option key={device.deviceId} value={device.deviceId}>{device.label || `Microphone ${index + 1}`}</option>
                ))}
              </select>
              {switchingMicrophone && <small>Switching microphone…</small>}
            </label>
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
              {joined && <li><span className="dot self-dot" style={{ background: world.selfColor }}><AvatarPreview avatarId={world.selfAvatarId} /></span><span className="person-name">{name}<small>You · {network === 'connected' ? 'Live' : statusText}</small><small className={`voice-status${world.selfMuted ? ' is-muted' : ''}`}>{localVoiceStatus}</small></span><span className="online-dot" /></li>}
              {roster.map((p) => {
                const connectionText = { connecting: 'Audio connecting', connected: 'Audio connected', disconnecting: 'Audio disconnecting', outside: 'Outside audio range' }[p.connection] ?? 'Audio unavailable';
                const voiceText = p.muted ? 'Microphone muted' : p.speaking ? 'Speaking' : 'Microphone on';
                return <li key={p.id}><span className="dot" style={{ background: p.color }}><AvatarPreview avatarId={p.avatarId} /></span><span className="person-name">{p.name}<small className={`connection-status is-${p.connection}`}>{connectionText}</small><small className={`voice-status${p.muted ? ' is-muted' : p.speaking ? ' is-speaking' : ''}`}>{voiceText}</small></span><span className="online-dot" /></li>;
              })}
              {!joined && <li className="empty-roster">Join the room to meet your team.</li>}
              {joined && roster.length === 0 && <li className="empty-roster">You’re the first one here. Invite your team!</li>}
            </ul>
          </section>
        </aside>
      </main>
    </div>
  );
}

function AvatarPreview({ avatarId }) {
  const avatar = avatarById(avatarId);
  if (avatar.image) return <img className="avatar-art" src={avatar.image} alt="" />;
  if (avatar.emoji) return <span className="avatar-art">{avatar.emoji}</span>;
  return <span className="avatar-art">Aa</span>;
}
