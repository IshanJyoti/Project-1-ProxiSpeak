import { useEffect, useRef } from 'react';
import { WORLD, HEAR_RADIUS } from '../../../shared/geo.js';
import { stepSelf, initials } from './world.js';
import { avatarById } from '../../../shared/avatars.js';

const AVATAR_DISPLAY_RADIUS = 22;
const avatarImages = new Map();

// Palette taken from the "cozy pixel office" look
const TAG_BG = 'rgba(27, 20, 22, .92)';
const GREEN = '#3ccf5a';
const ORANGE = '#f5a04a';
const AMBER = '#f0b04a';
const CORAL = '#ff6b5e';

function getAvatarImage(avatar) {
  if (!avatar.image) return null;
  if (!avatarImages.has(avatar.id)) {
    // Reuse each loaded image instead of creating a new Image on every frame.
    const image = new Image();
    image.src = avatar.image;
    avatarImages.set(avatar.id, image);
  }
  return avatarImages.get(avatar.id);
}

// Small cream brick tile, used as the floor until /room.png has loaded.
let brickPattern = null;
function getBrickPattern(ctx) {
  if (brickPattern) return brickPattern;
  const tile = document.createElement('canvas');
  tile.width = 48;
  tile.height = 48;
  const t = tile.getContext('2d');
  t.fillStyle = '#f3e6d9';
  t.fillRect(0, 0, 48, 48);
  t.fillStyle = '#e9d6c5';
  t.fillRect(0, 0, 48, 2);
  t.fillRect(0, 24, 48, 2);
  t.fillRect(0, 0, 2, 24);
  t.fillRect(24, 24, 2, 24);
  brickPattern = ctx.createPattern(tile, 'repeat');
  return brickPattern;
}

// 2D virtual office rendered on an HTML5 canvas with requestAnimationFrame (target: steady 60 FPS).
// The floor plan (room.png) is the background; obstacles from the server are drawn only in debug mode.
function roundedRectPath(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export default function WorldCanvas({ world, mixer, hearRadius, onMove, onFrame, onStats, onDebugChange }) {
  const canvasRef = useRef(null);
  // Keep the animation loop pointed at current props without restarting it
  // whenever audio state or a callback changes.
  const live = useRef({ mixer, hearRadius, onMove, onFrame, onStats, onDebugChange });
  live.current = { mixer, hearRadius, onMove, onFrame, onStats, onDebugChange };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    // Render at the device's pixel density (capped to limit high-DPI work).
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = WORLD.width * dpr;
    canvas.height = WORLD.height * dpr;

    // Load the office floor image; draw() uses a brick-floor fallback meanwhile.
    const bg = new Image();
    bg.src = '/room.png';

    // --- input -----------------------------------------------------------
    // Don't move the character or toggle debug mode while the user is typing.
    const typing = (e) => /INPUT|TEXTAREA|SELECT/.test(e.target?.tagName ?? '');
    const onKeyDown = (e) => {
      if (typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      // Track held keys so world.js can turn them into movement each frame.
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(k)) { world.keys.add(k); e.preventDefault(); }
      if (k === 'o' && !e.repeat) {
        world.showDebug = !world.showDebug;
        live.current.onDebugChange?.(world.showDebug);
      }
    };
    const onKeyUp = (e) => world.keys.delete(e.key.toLowerCase());
    // Clear held keys if the tab loses focus, avoiding stuck movement.
    const onBlur = () => world.keys.clear();
    const onClick = (e) => {
      const r = canvas.getBoundingClientRect();
      // Convert the click's screen position into the world's map coordinates.
      world.target = { x: ((e.clientX - r.left) / r.width) * WORLD.width, y: ((e.clientY - r.top) / r.height) * WORLD.height };
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    canvas.addEventListener('click', onClick);

    // --- loop ------------------------------------------------------------
    let raf = 0;
    let last = performance.now();
    let frames = 0;
    let statsAt = last;
    let lastSent = { x: world.self.x, y: world.self.y, t: 0 };

    const frame = (now) => {
      // Cap large time steps (for example after returning to a background tab).
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      frames++;

      // Advance local movement and send position updates at most every 50 ms.
      if (stepSelf(world, dt) && now - lastSent.t > 50) {
        lastSent = { x: world.self.x, y: world.self.y, t: now };
        live.current.onMove?.(world.self.x, world.self.y);
      }
      // Ease remote avatars toward server updates so network movement looks smooth.
      const ease = 1 - Math.exp(-dt * 14);
      for (const u of world.users.values()) {
        u.rx += (u.x - u.rx) * ease;
        u.ry += (u.y - u.ry) * ease;
      }
      // Let the parent update per-frame behavior, then redraw the complete map.
      live.current.onFrame?.(dt);
      draw(ctx, dpr, world, bg, live.current.mixer, live.current.hearRadius, now);

      // Report an approximate frame rate twice per second, not on every frame.
      if (now - statsAt >= 500) {
        live.current.onStats?.({ fps: Math.round((frames * 1000) / (now - statsAt)) });
        frames = 0;
        statsAt = now;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      // Stop the animation and detach listeners when the canvas unmounts or world changes.
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      canvas.removeEventListener('click', onClick);
    };
  }, [world]);

  return <canvas ref={canvasRef} className="world-canvas" aria-label="Virtual office map. Click to walk, or use WASD / arrow keys." />;
}

function draw(ctx, dpr, world, bg, mixer, hearRadius, now) {
  // Reset canvas scaling and clear the previous frame before painting this one.
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, WORLD.width, WORLD.height);

  // Keep pixel-art floors crisp when the canvas is scaled.
  ctx.imageSmoothingEnabled = false;
  if (bg.complete && bg.naturalWidth) ctx.drawImage(bg, 0, 0, WORLD.width, WORLD.height);
  else { ctx.fillStyle = getBrickPattern(ctx); ctx.fillRect(0, 0, WORLD.width, WORLD.height); }
  ctx.imageSmoothingEnabled = true;

  // Obstacle overlays are only for debugging; they don't affect the floor image.
  if (world.showDebug) {
    for (const o of world.obstacles) {
      ctx.fillStyle = o.kind === 'wall' ? 'rgba(220,60,60,.45)' : 'rgba(230,160,40,.4)';
      ctx.fillRect(o.x, o.y, o.w, o.h);
    }
  }

  const me = world.self;
  const radius = hearRadius ?? HEAR_RADIUS;
  // Show the local voice range so it is clear which nearby users can be heard.
  ctx.save();
  ctx.beginPath();
  ctx.arc(me.x, me.y, radius, 0, Math.PI * 2);
  const radiusGlow = ctx.createRadialGradient(me.x, me.y, 8, me.x, me.y, radius);
  radiusGlow.addColorStop(0, 'rgba(60, 207, 90, .14)');
  radiusGlow.addColorStop(1, 'rgba(60, 207, 90, .02)');
  ctx.fillStyle = radiusGlow;
  ctx.fill();
  ctx.setLineDash([8, 7]);
  ctx.strokeStyle = 'rgba(31, 130, 58, .6)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  // Connect the local avatar to active audio peers; line weight reflects volume.
  for (const id of world.connected) {
    const u = world.users.get(id);
    if (!u) continue;
    const g = mixer?.peers.get(id)?.g ?? 0;
    ctx.beginPath();
    ctx.moveTo(me.x, me.y);
    ctx.lineTo(u.rx, u.ry);
    ctx.strokeStyle = `rgba(31, 130, 58, ${0.2 + g * 0.7})`;
    ctx.lineWidth = 1 + g * 2.5;
    ctx.setLineDash([5, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Draw users back-to-front so avatars lower on the map appear in front.
  const people = [...world.users.values()].filter((u) => u.id !== world.selfId).map((u) => ({ ...u, self: false }));
  people.push({ id: world.selfId, name: world.selfName ?? 'You', color: world.selfColor ?? '#e5bd83', avatarId: world.selfAvatarId, muted: world.selfMuted, rx: me.x, ry: me.y, self: true });
  people.sort((a, b) => a.ry - b.ry);

  for (const p of people) {
    // A voice activity level above the threshold marks a remote user as speaking.
    const speaking = !p.self && mixer && mixer.levelOf(p.id) > 0.08;
    const connection = world.connectionStatuses.get(p.id) ?? 'outside';
    drawAvatar(ctx, p, speaking);
    drawNameTag(ctx, p, speaking, connection);
    if (speaking) drawSpeechBubble(ctx, p, now);
  }

  // Mark the destination selected by the user's last map click.
  if (world.target) {
    const pulse = 1 + Math.sin(now / 160) * 0.12;
    ctx.beginPath();
    ctx.arc(world.target.x, world.target.y, 6 * pulse, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(245, 160, 74, .28)';
    ctx.fill();
    ctx.strokeStyle = ORANGE;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function drawAvatar(ctx, p, speaking) {
  const R = AVATAR_DISPLAY_RADIUS;
  // Ground shadow
  ctx.beginPath();
  ctx.ellipse(p.rx, p.ry + 12, R + 2, R * 0.5, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(40, 24, 20, .22)';
  ctx.fill();
  // Halo: green when speaking, white for yourself
  if (speaking || p.self) {
    ctx.beginPath();
    ctx.arc(p.rx, p.ry, R + (speaking ? 7 : 5), 0, Math.PI * 2);
    ctx.strokeStyle = speaking ? 'rgba(60, 207, 90, .55)' : 'rgba(255, 255, 255, .9)';
    ctx.lineWidth = speaking ? 3 : 2;
    ctx.stroke();
  }
  ctx.save();
  ctx.shadowColor = 'rgba(40, 24, 20, .3)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 2;
  ctx.beginPath();
  ctx.arc(p.rx, p.ry, R, 0, Math.PI * 2);
  const avatar = avatarById(p.avatarId);
  // Fill and clip to a circle, then show the image, emoji, or name initials.
  ctx.fillStyle = avatar.background ?? p.color;
  ctx.fill();
  ctx.clip();
  const avatarImage = getAvatarImage(avatar);
  if (avatarImage?.complete && avatarImage.naturalWidth) {
    const size = R * 2;
    const [sourceX, sourceY, sourceWidth, sourceHeight] = avatar.crop ??
      [0, 0, avatarImage.naturalWidth, avatarImage.naturalHeight];
    ctx.filter = 'brightness(2) saturate(1.12) contrast(1.08)';
    ctx.drawImage(avatarImage, sourceX, sourceY, sourceWidth, sourceHeight, p.rx - size / 2, p.ry - size / 2, size, size);
    ctx.filter = 'none';
  } else if (avatar.emoji) {
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = '#fff';
    ctx.font = '25px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(avatar.emoji, p.rx, p.ry + 0.5);
  } else {
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = '#fff';
    ctx.font = '800 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initials(p.name), p.rx, p.ry + 0.5);
  }
  ctx.restore();
  ctx.lineWidth = 3;
  ctx.strokeStyle = speaking ? GREEN : '#ffffff';
  ctx.stroke();
}

// Dark pill above the avatar: [status icon] Name, with a small pointer.
// A second line only appears when something needs attention (muted, connecting).
function drawNameTag(ctx, p, speaking, connection) {
  const R = AVATAR_DISPLAY_RADIUS;
  const label = p.self ? `${p.name} (You)` : p.name;
  const note = p.muted ? 'Muted'
    : !p.self && connection === 'connecting' ? 'Connecting…'
    : !p.self && connection === 'disconnecting' ? 'Disconnecting…'
    : '';

  ctx.font = '700 13px system-ui, sans-serif';
  const labelWidth = ctx.measureText(label).width;
  ctx.font = '600 10px system-ui, sans-serif';
  const noteWidth = note ? ctx.measureText(note).width : 0;
  const w = Math.max(labelWidth, noteWidth) + 40;
  const h = note ? 38 : 26;
  const x = p.rx - w / 2;
  const y = p.ry - R - 10 - h;

  ctx.save();
  ctx.shadowColor = 'rgba(30, 16, 14, .3)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = TAG_BG;
  roundedRect(ctx, x, y, w, h, 10);
  ctx.fill();
  // Pointer toward the avatar
  ctx.beginPath();
  ctx.moveTo(p.rx - 6, y + h - 1);
  ctx.lineTo(p.rx + 6, y + h - 1);
  ctx.lineTo(p.rx, y + h + 6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Status icon: green dot for you, headset for everyone else
  const iconX = x + 15;
  const iconY = y + 13;
  if (p.self) {
    ctx.beginPath();
    ctx.arc(iconX, iconY, 5, 0, Math.PI * 2);
    ctx.fillStyle = p.muted ? AMBER : GREEN;
    ctx.fill();
  } else {
    drawHeadset(ctx, iconX, iconY, speaking ? GREEN : p.muted ? AMBER : ORANGE, p.muted);
  }

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.font = '700 13px system-ui, sans-serif';
  ctx.fillText(label, x + 28, iconY + 0.5, labelWidth);
  if (note) {
    ctx.font = '600 10px system-ui, sans-serif';
    ctx.fillStyle = p.muted ? '#f4c46e' : '#c9bdb8';
    ctx.fillText(note, x + 28, y + 29, w - 36);
  }
  ctx.textAlign = 'center';
}

function drawHeadset(ctx, cx, cy, color, muted) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy + 1, 5.5, Math.PI, 0);
  ctx.stroke();
  roundedRect(ctx, cx - 8, cy, 3.5, 6.5, 1.5);
  ctx.fill();
  roundedRect(ctx, cx + 4.5, cy, 3.5, 6.5, 1.5);
  ctx.fill();
  if (muted) {
    ctx.strokeStyle = CORAL;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 8, cy - 6);
    ctx.lineTo(cx + 8, cy + 8);
    ctx.stroke();
  }
  ctx.restore();
}

// Chat-style bubble beside a speaking avatar, with three bouncing dots.
function drawSpeechBubble(ctx, p, now) {
  const R = AVATAR_DISPLAY_RADIUS;
  const w = 34;
  const h = 24;
  const x = p.rx + R - 2;
  const y = p.ry - R - 6;
  ctx.save();
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#1b1416';
  ctx.lineWidth = 2.5;
  roundedRect(ctx, x, y, w, h, 12);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + 6, y + h - 1);
  ctx.lineTo(x + 2, y + h + 6);
  ctx.lineTo(x + 13, y + h - 1);
  ctx.closePath();
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.fillStyle = '#1b1416';
  for (let i = 0; i < 3; i++) {
    const bounce = Math.sin(now / 130 + i * 0.9) * 1.8;
    ctx.beginPath();
    ctx.arc(x + 9 + i * 8, y + h / 2 + bounce, 2.3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function roundedRect(ctx, x, y, width, height, radius) {
  // Use the native canvas API where available, with a path-based fallback.
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
    return;
  }
  roundedRectPath(ctx, x, y, width, height, radius);
}