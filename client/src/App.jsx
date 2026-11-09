import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import WorldCanvas from './world/WorldCanvas.jsx';
import { createWorld, colorFor } from './world/world.js';
import { SpatialMixer } from './audio/SpatialMixer.js';
import { PeerManager } from './rtc/PeerManager.js';
import { SPAWN } from '../../shared/defaultLayout.js';
import { WORLD, HEAR_RADIUS, HEAR_HYSTERESIS, HEAR_RADIUS_MIN, HEAR_RADIUS_MAX, HEAR_RADIUS_STEP, dist } from '../../shared/geo.js';
import { AVATAR_CHOICES, AVATAR_IDS, DEFAULT_AVATAR_ID, avatarById } from '../../shared/avatars.js';

const ROOM_ID = 'main-office';
const MAX_CHAT_MESSAGE_LENGTH = 500;
const MAP_ZOOM_MIN = 1;
const MAP_ZOOM_MAX = 2.5;
const MAP_ZOOM_STEP = 0.25;
const ACTIVE_SESSION_KEY = 'proxispeak-active-session';
const AVATAR_PREFERENCE_KEY = 'proxispeak-avatar-id';
const AVATAR_IMAGE_PREFERENCE_KEY = 'proxispeak-avatar-image';
const MAX_AVATAR_IMAGE_LENGTH = 50_000;
const MAX_AVATAR_FILE_SIZE = 10 * 1024 * 1024;
const MICROPHONE_PREFERENCE_KEY = 'proxispeak-microphone-id';
const THEME_PREFERENCE_KEY = 'proxispeak-theme';
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
      return 'Edge blocked microphone access. Allow Microphone in the site permissions beside the address bar, then click Enable microphone in the control bar.';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'No microphone was found. Connect or enable a microphone, then click Enable microphone in the control bar.';
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
    const savedAvatarImage = localStorage.getItem(AVATAR_IMAGE_PREFERENCE_KEY);
    const hasCustomAvatar = session.avatarId === 'custom' && isAvatarImage(savedAvatarImage);
    const { x, y } = session;
    return {
      displayName: session.displayName,
      avatarId: AVATAR_IDS.has(session.avatarId) || hasCustomAvatar ? session.avatarId : DEFAULT_AVATAR_ID,
      avatarImage: hasCustomAvatar ? savedAvatarImage : '',
      position: Number.isFinite(x) && Number.isFinite(y) &&
        x >= 0 && x <= WORLD.width && y >= 0 && y <= WORLD.height
        ? { x, y }
        : { ...SPAWN },
    };
  } catch {
    return null;
  }
}

function isAvatarImage(value) {
  return typeof value === 'string' && value.length <= MAX_AVATAR_IMAGE_LENGTH &&
    /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
}

export default function App() {
  const world = useMemo(createWorld, []);
  const sessionRef = useRef(null);
  const sessionChannelRef = useRef(null);
  const restoreStartedRef = useRef(false);
  const tabIdRef = useRef(sessionStorage.getItem('proxispeak-tab-id') || `tab-${Math.random().toString(36).slice(2, 12)}`);
  const frameCount = useRef(0);
  const hearRadiusRef = useRef(HEAR_RADIUS);
  const pushToTalkEnabledRef = useRef(false);
  const pushToTalkSourcesRef = useRef(new Set());
  const pushToTalkButtonRef = useRef(null);
  const previousNetworkRef = useRef(null);
  const previousMicrophoneRef = useRef(null);
  const [name, setName] = useState('');
  const [selectedAvatarImage, setSelectedAvatarImage] = useState(() => {
    const saved = localStorage.getItem(AVATAR_IMAGE_PREFERENCE_KEY);
    return isAvatarImage(saved) ? saved : '';
  });
  const [selectedAvatarId, setSelectedAvatarId] = useState(() => {
    const saved = localStorage.getItem(AVATAR_PREFERENCE_KEY);
    return AVATAR_IDS.has(saved) || (saved === 'custom' && isAvatarImage(localStorage.getItem(AVATAR_IMAGE_PREFERENCE_KEY)))
      ? saved
      : DEFAULT_AVATAR_ID;
  });
  const [cropSource, setCropSource] = useState(null);
  const [cropZoom, setCropZoom] = useState(1);
  const [cropX, setCropX] = useState(50);
  const [cropY, setCropY] = useState(50);
  const [avatarError, setAvatarError] = useState('');
  const [joined, setJoined] = useState(false);
  const [network, setNetwork] = useState('offline');
  const [connectionAnnouncement, setConnectionAnnouncement] = useState({ id: 0, text: '' });
  const [error, setError] = useState('');
  const [micOn, setMicOn] = useState(true);
  const [pushToTalkEnabled, setPushToTalkEnabled] = useState(false);
  const [pushToTalkActive, setPushToTalkActive] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [volume, setVolume] = useState(80);
  const [roster, setRoster] = useState([]);
  const [chatEvents, setChatEvents] = useState([]);
  const [chatDraft, setChatDraft] = useState('');
  const [chatError, setChatError] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [nearby, setNearby] = useState(0);
  const [fps, setFps] = useState(0);
  const [hasMic, setHasMic] = useState(false);
  const [microphoneAnnouncement, setMicrophoneAnnouncement] = useState({ id: 0, text: '' });
  const [audioInputs, setAudioInputs] = useState([]);
  const [selectedMicrophoneId, setSelectedMicrophoneId] = useState(() => localStorage.getItem(MICROPHONE_PREFERENCE_KEY) || '');
  const [switchingMicrophone, setSwitchingMicrophone] = useState(false);
  const [mixer, setMixer] = useState(null);
  const [showObstacles, setShowObstacles] = useState(false);
  const [mapZoom, setMapZoom] = useState(MAP_ZOOM_MIN);
  const [hearRadius, setHearRadius] = useState(HEAR_RADIUS);
  const [rangeDraft, setRangeDraft] = useState(HEAR_RADIUS);
  const [savingRange, setSavingRange] = useState(false);
  const [rangeError, setRangeError] = useState('');
  const [needsAdminToken, setNeedsAdminToken] = useState(false);
  const [adminToken, setAdminToken] = useState('');
  const [theme, setTheme] = useState(() => (localStorage.getItem(THEME_PREFERENCE_KEY) === 'dark' ? 'dark' : 'light'));
  hearRadiusRef.current = hearRadius;

  useEffect(() => {
    const previousNetwork = previousNetworkRef.current;
    previousNetworkRef.current = network;
    if (previousNetwork === null || previousNetwork === network) return;
    let announcement;
    if (network === 'connecting') announcement = 'Connecting to the office.';
    else if (network === 'connected') {
      announcement = previousNetwork === 'reconnecting' ? 'Connection restored.' : 'Connected to the office.';
    } else if (network === 'reconnecting') announcement = 'Connection interrupted. Reconnecting.';
    else announcement = 'Disconnected from the office.';
    setConnectionAnnouncement((current) => ({ id: current.id + 1, text: announcement }));
  }, [network]);

  useEffect(() => {
    const previous = previousMicrophoneRef.current;
    previousMicrophoneRef.current = { joined, hasMic, micOn };
    if (!joined || !previous) return;
    let announcement;
    if (!previous.joined) {
      announcement = hasMic ? (micOn ? 'Microphone on.' : 'Microphone muted.') : 'Joined in listen-only mode. Microphone unavailable.';
    } else if (previous.hasMic !== hasMic) {
      announcement = hasMic ? (micOn ? 'Microphone enabled and on.' : 'Microphone enabled and muted.') : 'Microphone unavailable.';
    } else if (previous.micOn !== micOn) {
      announcement = micOn ? 'Microphone on.' : 'Microphone muted.';
    }
    if (announcement) setMicrophoneAnnouncement((current) => ({ id: current.id + 1, text: announcement }));
  }, [joined, hasMic, micOn]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_PREFERENCE_KEY, theme);
  }, [theme]);

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
    let active = true;
    void updateAudioInputs();
    navigator.mediaDevices?.addEventListener?.('devicechange', updateAudioInputs);
    return () => {
      active = false;
      navigator.mediaDevices?.removeEventListener?.('devicechange', updateAudioInputs);
    };
  }, [hasMic]);

  const refreshRoster = useCallback(() => {
    const session = sessionRef.current;
    setRoster([...world.users.values()].map((user) => ({
      ...user,
      connection: session?.peers.statusOf(user.id) ?? 'outside',
      speaking: Boolean(session?.mixer.levelOf(user.id) > 0.08),
      volume: session?.mixer.peerVolumeOf(user.id) ?? 1,
      locallyMuted: session?.mixer.isPeerMuted(user.id) ?? false,
      nearby: dist(world.self, user) <= hearRadiusRef.current,
    })));
  }, [world]);

  const addUser = useCallback((u) => {
    const prev = world.users.get(u.id);
    world.users.set(u.id, { id: u.id, name: u.name, color: u.color, avatarId: u.avatarId ?? DEFAULT_AVATAR_ID, avatarImage: u.avatarImage, muted: u.muted ?? true, x: u.x, y: u.y, rx: prev?.rx ?? u.x, ry: prev?.ry ?? u.y });
  }, [world]);

  useEffect(() => () => {
    if (cropSource?.url) URL.revokeObjectURL(cropSource.url);
  }, [cropSource]);

  const loadAvatarFile = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    setAvatarError('');
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setAvatarError('Choose a JPG, PNG, or WebP image.');
      return;
    }
    if (file.size > MAX_AVATAR_FILE_SIZE) {
      setAvatarError('Choose an image smaller than 10 MB.');
      return;
    }
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => setCropSource({ url, width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      setAvatarError('That image could not be opened. Try another image.');
    };
    image.src = url;
    setCropZoom(1);
    setCropX(50);
    setCropY(50);
  };

  const applyAvatarCrop = () => {
    if (!cropSource) return;
    const cropSize = Math.min(cropSource.width, cropSource.height) / cropZoom;
    const sourceX = (cropSource.width - cropSize) * cropX / 100;
    const sourceY = (cropSource.height - cropSize) * cropY / 100;
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext('2d');
    if (!context) {
      setAvatarError('Your browser could not crop this image. Try another browser.');
      return;
    }
    const image = new Image();
    image.onload = () => {
      context.drawImage(image, sourceX, sourceY, cropSize, cropSize, 0, 0, canvas.width, canvas.height);
      const croppedImage = canvas.toDataURL('image/jpeg', 0.78);
      if (!isAvatarImage(croppedImage)) {
        setAvatarError('The cropped image is too large. Try a simpler image.');
        return;
      }
      try {
        localStorage.setItem(AVATAR_IMAGE_PREFERENCE_KEY, croppedImage);
        localStorage.setItem(AVATAR_PREFERENCE_KEY, 'custom');
        setSelectedAvatarImage(croppedImage);
        setSelectedAvatarId('custom');
        setAvatarError('');
        setCropSource(null);
      } catch (storageError) {
        setAvatarError(`Could not save your avatar on this device: ${storageError.message || 'storage is full.'}`);
      }
    };
    image.onerror = () => setAvatarError('That image could not be cropped. Try another image.');
    image.src = cropSource.url;
  };

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
    const displayName = (savedSession?.displayName ?? name).trim();
    const avatarId = savedSession?.avatarId ?? selectedAvatarId;
    const avatarImage = avatarId === 'custom' ? (savedSession?.avatarImage ?? selectedAvatarImage) : '';
    if (avatarId === 'custom' && !isAvatarImage(avatarImage)) return setError('Choose and crop an image for your custom avatar first.');
    if (!displayName) return setError('Please enter your name first.');
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
    world.selfAvatarImage = avatarImage;
    if (stream && pushToTalkEnabled) stream.getAudioTracks().forEach((track) => { track.enabled = false; });
    world.selfMuted = !stream || pushToTalkEnabled;
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
    setMicOn(Boolean(stream) && !pushToTalkEnabled);
    setNetwork('connecting');
    setJoined(true);
    sessionStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify({
      displayName,
      avatarId,
      avatarImage,
      x: world.self.x,
      y: world.self.y,
    }));

    socket.on('connect', () => {
      setNetwork('connected');
      socket.emit('room:join', { roomId: ROOM_ID, participant: { id: selfId, displayName, avatarId, avatarImage, color: world.selfColor, x: world.self.x, y: world.self.y, muted: world.selfMuted } });
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
    if (savedSession.avatarImage) setSelectedAvatarImage(savedSession.avatarImage);
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

  const setMicrophoneTransmitting = useCallback((transmitting) => {
    const session = sessionRef.current;
    if (!session?.stream) {
      setMicOn(false);
      world.selfMuted = true;
      return;
    }
    session.stream.getAudioTracks().forEach((track) => { track.enabled = transmitting; });
    setMicOn(transmitting);
    world.selfMuted = !transmitting;
    session.socket.emit('voice:status', { muted: !transmitting });
    refreshRoster();
  }, [refreshRoster, world]);
  const setPushToTalkSource = useCallback((source, pressed) => {
    if (!pushToTalkEnabledRef.current || !joined || !hasMic) return;
    const sources = pushToTalkSourcesRef.current;
    const previouslyPressed = sources.has(source);
    if (previouslyPressed === pressed) return;
    if (pressed) sources.add(source);
    else sources.delete(source);
    const transmitting = sources.size > 0;
    setPushToTalkActive(transmitting);
    setMicrophoneTransmitting(transmitting);
  }, [hasMic, joined, setMicrophoneTransmitting]);
  const togglePushToTalk = () => {
    const next = !pushToTalkEnabled;
    pushToTalkEnabledRef.current = next;
    pushToTalkSourcesRef.current.clear();
    setPushToTalkEnabled(next);
    setPushToTalkActive(false);
    setMicrophoneTransmitting(false);
  };
  useEffect(() => {
    if (!pushToTalkEnabled || !joined) return undefined;
    const isTyping = (target) => /INPUT|TEXTAREA|SELECT/.test(target?.tagName ?? '') || target?.isContentEditable;
    const onKeyDown = (event) => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.code === 'KeyV' && !isTyping(event.target)) {
        event.preventDefault();
        setPushToTalkSource('keyboard', true);
      } else if ((event.code === 'Space' || event.code === 'Enter') && document.activeElement === pushToTalkButtonRef.current) {
        event.preventDefault();
        setPushToTalkSource('button-keyboard', true);
      }
    };
    const onKeyUp = (event) => {
      if (event.code === 'KeyV') setPushToTalkSource('keyboard', false);
      if (event.code === 'Space' || event.code === 'Enter') setPushToTalkSource('button-keyboard', false);
    };
    const releaseAll = () => {
      if (pushToTalkSourcesRef.current.size === 0) return;
      pushToTalkSourcesRef.current.clear();
      setPushToTalkActive(false);
      setMicrophoneTransmitting(false);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') releaseAll();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', releaseAll);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', releaseAll);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      releaseAll();
    };
  }, [joined, pushToTalkEnabled, setMicrophoneTransmitting, setPushToTalkSource]);

  const toggleMic = () => {
    if (pushToTalkEnabled) return;
    const stream = sessionRef.current?.stream;
    if (!stream) return;
    setMicrophoneTransmitting(!micOn);
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
      const shouldTransmit = !pushToTalkEnabled;
      stream.getAudioTracks().forEach((track) => { track.enabled = shouldTransmit; });
      session.stream = stream;
      const peerIds = session.peers.ids();
      session.peers.closeAll();
      session.peers.stream = stream;
      setHasMic(true);
      setMicOn(shouldTransmit);
      world.selfMuted = !shouldTransmit;
      setError('');
      session.socket.emit('voice:status', { muted: !shouldTransmit });
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
      stream.getAudioTracks().forEach((track) => { track.enabled = pushToTalkEnabled ? pushToTalkActive : micOn; });
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
  const changePeerVolume = (id, v) => {
    sessionRef.current?.mixer.setPeerVolume(id, v / 100);
    refreshRoster();
  };
  const togglePeerMute = (id) => {
    const mixer = sessionRef.current?.mixer;
    if (!mixer) return;
    mixer.setPeerMuted(id, !mixer.isPeerMuted(id));
    refreshRoster();
  };
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
  const changeMapZoom = (direction) => {
    setMapZoom((current) => Math.min(MAP_ZOOM_MAX, Math.max(MAP_ZOOM_MIN, Number((current + direction * MAP_ZOOM_STEP).toFixed(2)))));
  };
  const sendChat = (event) => {
    event.preventDefault();
    const text = chatDraft.trim();
    if (!text || text.length > MAX_CHAT_MESSAGE_LENGTH || !joined || chatSending) return;
    const socket = sessionRef.current?.socket;
    if (!socket?.connected) {
      setChatError('You are disconnected. Reconnect before sending your message.');
      return;
    }
    setChatError('');
    setChatSending(true);
    socket.timeout(5000).emit('chat:send', { text }, (timeoutError, result) => {
      setChatSending(false);
      if (timeoutError) {
        setChatError('Could not confirm your message was sent. Check your connection and try again.');
        return;
      }
      if (!result?.ok) {
        setChatError(result?.error || 'Your message could not be sent. Please try again.');
        return;
      }
      setChatDraft('');
    });
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
  const micControlText = !joined ? 'Microphone' : hasMic ? (micOn ? 'Microphone' : 'Mic muted') : 'Enable mic';
  const micControlState = !joined ? 'READY' : hasMic ? (micOn ? 'ON' : 'OFF') : 'OFF';
  const roomControlState = !joined ? 'READY' : deafened ? 'OFF' : 'ON';
  const localVoiceStatus = !hasMic || world.selfMuted ? 'Microphone muted' : 'Microphone on';

  return (
    <div className="shell">
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true"><span key={connectionAnnouncement.id}>{connectionAnnouncement.text}</span></div>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true"><span key={microphoneAnnouncement.id}>{microphoneAnnouncement.text}</span></div>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <div><h1>proxi<span>speak</span></h1><small>THE SPATIAL OFFICE</small></div>
        </div>
        <div className="topbar-right">
          <button
            type="button"
            className="theme-toggle"
            role="switch"
            aria-checked={theme === 'dark'}
            aria-label="Dark mode"
            onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
          >
            <span className="theme-track"><span className="theme-thumb" aria-hidden="true">{theme === 'dark' ? '☾' : '☀'}</span></span>
            <span className="theme-label">{theme === 'dark' ? 'Dark' : 'Light'}</span>
          </button>
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
            <button type="button" className={`map-action${showObstacles ? ' is-active' : ''}`} onClick={toggleObstacles} aria-pressed={showObstacles}>
              <span aria-hidden="true">▧</span>{showObstacles ? 'Hide layout' : 'Show layout'}
            </button>
          </div>
          <div className="map-frame">
            <WorldCanvas world={world} mixer={mixer} hearRadius={hearRadius} zoom={mapZoom} onZoomChange={changeMapZoom} onMove={onMove} onFrame={onFrame} onStats={(s) => setFps(s.fps)} onDebugChange={setShowObstacles} joined={joined} />
            {!joined && (
              <div className="overlay">
                <div className="card">
                  <div className="card-kicker"><span /> YOUR DESK IS WAITING</div>
                  <h2>Good conversations<br />happen nearby.</h2>
                  <p>Step into the office. Move closer to teammates to hear them naturally.</p>
                  <label className="name-label" htmlFor="display-name">YOUR NAME</label>
                  <input id="display-name" value={name} maxLength={32} placeholder="Type your name" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && join(true)} />
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
                      <button
                        className={`avatar-choice${selectedAvatarId === 'custom' ? ' selected' : ''}`}
                        type="button"
                        aria-label="Choose your custom avatar"
                        aria-pressed={selectedAvatarId === 'custom'}
                        onClick={() => {
                          if (!selectedAvatarImage) {
                            document.getElementById('avatar-file').click();
                            return;
                          }
                          setSelectedAvatarId('custom');
                          localStorage.setItem(AVATAR_PREFERENCE_KEY, 'custom');
                        }}
                      >
                        <span className="avatar-preview" style={{ background: '#687782' }}>
                          {selectedAvatarImage ? <AvatarPreview avatarId="custom" avatarImage={selectedAvatarImage} /> : <span aria-hidden="true">＋</span>}
                        </span>
                        <span>{selectedAvatarImage ? 'Your avatar' : 'Upload avatar'}</span>
                      </button>
                    </div>
                    <label className="avatar-upload" htmlFor="avatar-file">{selectedAvatarImage ? 'Choose a different avatar' : 'Upload an avatar from your device'}</label>
                    <input id="avatar-file" type="file" accept="image/jpeg,image/png,image/webp" onChange={loadAvatarFile} />
                    {cropSource && (
                      <div className="avatar-crop">
                        <span className="name-label">CROP YOUR PHOTO</span>
                        <div className="avatar-crop-preview">
                          <img
                            src={cropSource.url}
                            alt="Crop preview"
                            style={{ objectPosition: `${cropX}% ${cropY}%`, transform: `scale(${cropZoom})` }}
                          />
                        </div>
                        <label>Zoom <input type="range" min="1" max="3" step="0.05" value={cropZoom} onChange={(event) => setCropZoom(Number(event.target.value))} /></label>
                        <label>Horizontal position <input type="range" min="0" max="100" value={cropX} onChange={(event) => setCropX(Number(event.target.value))} /></label>
                        <label>Vertical position <input type="range" min="0" max="100" value={cropY} onChange={(event) => setCropY(Number(event.target.value))} /></label>
                        <div className="avatar-crop-actions">
                          <button type="button" className="listen-button" onClick={() => setCropSource(null)}>Cancel</button>
                          <button type="button" className="primary" onClick={applyAvatarCrop}>Use this avatar</button>
                        </div>
                      </div>
                    )}
                    {avatarError && <p className="error" role="alert">{avatarError}</p>}
                  </div>
                  <div className="join-actions">
                    <button type="button" className="primary" onClick={() => join(true)}><span aria-hidden="true">◉</span> Join with microphone</button>
                    <button type="button" className="listen-button" onClick={() => join(false)}>Listen only</button>
                  </div>
                  {error && <p className="error" role="alert">{error}</p>}
                </div>
              </div>
            )}
            <div className="map-zoom-controls" role="group" aria-label="Map zoom controls">
              <button type="button" aria-label="Zoom out" onClick={() => changeMapZoom(-1)} disabled={mapZoom <= MAP_ZOOM_MIN}>−</button>
              <output aria-live="polite">{Math.round(mapZoom * 100)}%</output>
              <button type="button" aria-label="Zoom in" onClick={() => changeMapZoom(1)} disabled={mapZoom >= MAP_ZOOM_MAX}>+</button>
              <button type="button" className="map-zoom-reset" onClick={() => setMapZoom(MAP_ZOOM_MIN)} disabled={mapZoom === MAP_ZOOM_MIN}>Reset</button>
            </div>
            <div className="map-corner-label"><span>⌖</span> MAIN OFFICE <i /> {WORLD.width} × {WORLD.height}</div>
          </div>
          <div className="hint"><span className="hint-icon" aria-hidden="true">↖</span><span><b>Click anywhere</b> to walk</span><span className="hint-divider" /><span>Tab to the map, then use <b>WASD</b> or arrow keys to move</span><kbd>SHIFT</kbd><span>to run</span><span className="hint-divider" /><span><kbd>O</kbd> layout</span></div>
          <section className="chat-panel" aria-label="Team chat">
            <div className="chat-heading">
              <div><span className="eyebrow">ASYNC CONVERSATION</span><h3>Team chat</h3></div>
              <span className="chat-presence">{joined ? 'Room-wide' : 'Join to chat'}</span>
            </div>
            <div className="chat-feed" role="log" aria-live="polite" aria-relevant="additions">
              {chatEvents.length === 0 ? <p className="chat-empty">{joined ? 'No messages yet. Send a message or quick reaction to start the conversation.' : 'Join the office to see new messages and reactions.'}</p> : chatEvents.map((event) => {
                const sentAt = Number.isFinite(event.createdAt) ? new Date(event.createdAt) : null;
                return (
                  <div className={`chat-event${event.type === 'reaction' ? ' reaction-event' : ''}`} key={event.id}>
                    <span className="chat-event-name">{event.displayName}</span>
                    {sentAt && <time className="chat-event-time" dateTime={sentAt.toISOString()}>{sentAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time>}
                    {event.type === 'reaction' ? <span className="chat-reaction">{event.reaction}</span> : <span className="chat-message">{event.text}</span>}
                  </div>
                );
              })}
            </div>
            <div className="reaction-row" aria-label="Quick reactions">
              {QUICK_REACTIONS.map((reaction) => <button key={reaction} type="button" className="reaction-button" onClick={() => sendReaction(reaction)} disabled={!joined} aria-label={`Send ${reaction} reaction`}>{reaction}</button>)}
            </div>
            <div className="chat-compose-area">
              <form className="chat-compose" onSubmit={sendChat}>
                <input
                  aria-label="Write a message"
                  aria-describedby={chatError ? 'chat-message-counter chat-send-error' : 'chat-message-counter'}
                  value={chatDraft}
                  maxLength={MAX_CHAT_MESSAGE_LENGTH}
                  onChange={(event) => {
                    setChatDraft(event.target.value.slice(0, MAX_CHAT_MESSAGE_LENGTH));
                    setChatError('');
                  }}
                  placeholder={joined ? 'Write a message…' : 'Join the office to send a message'}
                  disabled={!joined || chatSending}
                />
                <button type="submit" className="chat-send" disabled={!joined || chatSending || !chatDraft.trim()} aria-label="Send message">{chatSending ? 'Sending…' : 'Send'}</button>
              </form>
              <span className="chat-counter" id="chat-message-counter">
                {chatDraft.length} / {MAX_CHAT_MESSAGE_LENGTH} characters
              </span>
              {chatError && <p className="chat-send-error" id="chat-send-error" role="alert">{chatError} Your draft is still here; you can try again.</p>}
            </div>
          </section>
        </section>

        <aside className="side">
          <section className="panel">
            <div className="panel-heading"><div><span className="eyebrow">PROXIMITY AUDIO</span><h3>Within earshot</h3></div><span className="count-badge">{nearby}</span></div>
            <div className="range-meter"><span style={{ width: `${Math.min(100, (nearby / Math.max(roster.length, 1)) * 100)}%` }} /></div>
            <p className="muted">{nearby ? `${nearby} ${nearby === 1 ? 'teammate is' : 'teammates are'} close enough to hear.` : 'Walk closer to a teammate to hear their conversation.'}</p>
            <p className="range-note">Clear range <b>{hearRadius}px</b><span>·</span> reconnects until {hearRadius + HEAR_HYSTERESIS}px</p>
            <div className="range-setting">
              <label htmlFor="hear-radius"><span>Listening distance</span><b>{rangeDraft}px</b></label>
              <input id="hear-radius" type="range" min={HEAR_RADIUS_MIN} max={HEAR_RADIUS_MAX} step={HEAR_RADIUS_STEP} value={rangeDraft} onChange={(e) => setRangeDraft(Number(e.target.value))} />
              <button type="button" className="save-range" onClick={saveHearRadius} disabled={savingRange || rangeDraft === hearRadius}>
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
              {joined && <li><span className="dot self-dot" style={{ background: world.selfColor }}><AvatarPreview avatarId={world.selfAvatarId} avatarImage={world.selfAvatarImage} /></span><span className="person-name">{name}<small>You · {network === 'connected' ? 'Live' : statusText}</small><small className={`voice-status${world.selfMuted ? ' is-muted' : ''}`}>{localVoiceStatus}</small></span><span className="online-dot" /></li>}
              {roster.map((p) => {
                const connectionText = { connecting: 'Audio connecting', connected: 'Audio connected', disconnecting: 'Audio disconnecting', outside: 'Outside audio range' }[p.connection] ?? 'Audio unavailable';
                const voiceText = p.muted ? 'Microphone muted' : p.speaking ? 'Speaking' : 'Microphone on';
                return <li key={p.id}><span className="dot" style={{ background: p.color }}><AvatarPreview avatarId={p.avatarId} avatarImage={p.avatarImage} /></span><span className="person-name">{p.name}<span className="participant-states"><small className={`participant-state proximity-status${p.nearby ? ' is-nearby' : ' is-away'}`}><i aria-hidden="true" />{p.nearby ? 'Nearby' : 'Away'}</small><small className={`participant-state voice-status${p.muted ? ' is-muted' : p.speaking ? ' is-speaking' : ''}`}><i aria-hidden="true" />{voiceText}</small></span><small className={`connection-status is-${p.connection}`}>{connectionText}</small><div className="person-volume"><label htmlFor={`volume-${p.id}`}>Volume</label><b>{Math.round(p.volume * 100)}%</b><input id={`volume-${p.id}`} type="range" min="0" max="100" value={Math.round(p.volume * 100)} aria-label={`Volume for ${p.name}`} onChange={(event) => changePeerVolume(p.id, Number(event.target.value))} /><button type="button" className={`person-mute${p.locallyMuted ? ' is-muted' : ''}`} aria-label={`${p.locallyMuted ? 'Unmute' : 'Mute'} ${p.name} locally`} aria-pressed={p.locallyMuted} onClick={() => togglePeerMute(p.id)}>{p.locallyMuted ? 'Unmute' : 'Mute'}</button></div></span><span className="online-dot" /></li>;
              })}
              {!joined && <li className="empty-roster">Join the room to meet your team.</li>}
              {joined && roster.length === 0 && <li className="empty-roster">You’re the first one here. Invite your team!</li>}
            </ul>
          </section>
        </aside>
      </main>

      <footer className="dock" aria-label="Audio controls">
        <div className="dock-inner">
          {joined && error && <p className="error" role="alert">{error}</p>}
          <div className="control-stack">
            <button className={`control-button${!micOn && joined && hasMic ? ' selected' : ''}`} onClick={hasMic ? toggleMic : enableMic} disabled={!joined || (pushToTalkEnabled && hasMic)} aria-pressed={joined && hasMic && !micOn}>
              <span className="control-icon" aria-hidden="true">{micOn ? '♩' : '♬'}</span><span>{micControlText}</span><b>{micControlState}</b>
            </button>
            <button className={`control-button${pushToTalkEnabled ? ' push-to-talk-enabled' : ''}`} onClick={togglePushToTalk} disabled={!joined} aria-pressed={pushToTalkEnabled}>
              <span className="control-icon" aria-hidden="true">⌁</span><span>Push-to-talk</span><b>{pushToTalkEnabled ? 'ON' : 'OFF'}</b>
            </button>
            <button
              ref={pushToTalkButtonRef}
              type="button"
              className={`control-button push-to-talk-hold${pushToTalkActive ? ' is-transmitting' : ''}`}
              disabled={!joined || !hasMic || !pushToTalkEnabled}
              aria-label="Hold to talk. Keyboard shortcut V."
              aria-pressed={pushToTalkActive}
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
                setPushToTalkSource('pointer', true);
              }}
              onPointerUp={() => setPushToTalkSource('pointer', false)}
              onPointerCancel={() => setPushToTalkSource('pointer', false)}
              onLostPointerCapture={() => setPushToTalkSource('pointer', false)}
            >
              <span className="control-icon" aria-hidden="true">◉</span><span>Hold <kbd>V</kbd></span><b>{pushToTalkActive ? 'LIVE' : 'HOLD'}</b>
            </button>
            <button className={`control-button${deafened ? ' selected' : ''}`} onClick={toggleDeafen} disabled={!joined} aria-pressed={deafened}>
              <span className="control-icon" aria-hidden="true">{deafened ? '◌' : '◖'}</span><span>{deafened ? 'Room muted' : 'Room audio'}</span><b>{roomControlState}</b>
            </button>
          </div>
          <label className="dock-field microphone-select">
            <span>Microphone input</span>
            <select aria-label="Microphone input" value={selectedMicrophoneId} onChange={chooseMicrophone} disabled={switchingMicrophone || audioInputs.length === 0}>
              <option value="">System default</option>
              {audioInputs.map((device, index) => (
                <option key={device.deviceId} value={device.deviceId}>{device.label || `Microphone ${index + 1}`}</option>
              ))}
            </select>
            {switchingMicrophone && <small>Switching microphone…</small>}
          </label>
          <label className="dock-field vol"><span>Room volume</span><b>{volume}%</b><input aria-label="Room volume" type="range" min="0" max="100" value={volume} onChange={(e) => changeVolume(Number(e.target.value))} /></label>
          <button className="leave" onClick={leave} disabled={!joined}><span aria-hidden="true">↗</span> Leave office</button>
        </div>
      </footer>
    </div>
  );
}

function AvatarPreview({ avatarId, avatarImage }) {
  const avatar = avatarById(avatarId, avatarImage);
  if (avatar.image) return <img className="avatar-art" src={avatar.image} alt="" />;
  if (avatar.emoji) return <span className="avatar-art">{avatar.emoji}</span>;
  return <span className="avatar-art">Aa</span>;
}