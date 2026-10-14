import { useEffect, useRef } from 'react';
import { WORLD, HEAR_RADIUS } from '../../../shared/geo.js';
import { stepSelf, initials } from './world.js';
import { avatarById } from '../../../shared/avatars.js';

const AVATAR_DISPLAY_RADIUS = 22;
const avatarImages = new Map();

function getAvatarImage(avatar) {
  if (!avatar.image) return null;
  if (!avatarImages.has(avatar.id)) {
    const image = new Image();
    image.src = avatar.image;
    avatarImages.set(avatar.id, image);
  }
  return avatarImages.get(avatar.id);
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
  const live = useRef({ mixer, hearRadius, onMove, onFrame, onStats, onDebugChange });
  live.current = { mixer, hearRadius, onMove, onFrame, onStats, onDebugChange };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = WORLD.width * dpr;
    canvas.height = WORLD.height * dpr;

    const bg = new Image();
    bg.src = '/room.png';

    // --- input -----------------------------------------------------------
    const typing = (e) => /INPUT|TEXTAREA|SELECT/.test(e.target?.tagName ?? '');
    const onKeyDown = (e) => {
      if (typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(k)) { world.keys.add(k); e.preventDefault(); }
      if (k === 'o' && !e.repeat) {
        world.showDebug = !world.showDebug;
        live.current.onDebugChange?.(world.showDebug);
      }
    };
    const onKeyUp = (e) => world.keys.delete(e.key.toLowerCase());
    const onBlur = () => world.keys.clear();
    const onClick = (e) => {
      const r = canvas.getBoundingClientRect();
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
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      frames++;

      if (stepSelf(world, dt) && now - lastSent.t > 50) {
        lastSent = { x: world.self.x, y: world.self.y, t: now };
        live.current.onMove?.(world.self.x, world.self.y);
      }
      // smooth remote avatars towards the latest server position
      const ease = 1 - Math.exp(-dt * 14);
      for (const u of world.users.values()) {
        u.rx += (u.x - u.rx) * ease;
        u.ry += (u.y - u.ry) * ease;
      }
      live.current.onFrame?.(dt);
      draw(ctx, dpr, world, bg, live.current.mixer, live.current.hearRadius);

      if (now - statsAt >= 500) {
        live.current.onStats?.({ fps: Math.round((frames * 1000) / (now - statsAt)) });
        frames = 0;
        statsAt = now;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      canvas.removeEventListener('click', onClick);
    };
  }, [world]);

  return <canvas ref={canvasRef} className="world-canvas" aria-label="Virtual office map. Click to walk, or use WASD / arrow keys." />;
}

function draw(ctx, dpr, world, bg, mixer, hearRadius) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, WORLD.width, WORLD.height);
  if (bg.complete && bg.naturalWidth) ctx.drawImage(bg, 0, 0, WORLD.width, WORLD.height);
  else { ctx.fillStyle = '#f1f1ef'; ctx.fillRect(0, 0, WORLD.width, WORLD.height); }

  if (world.showDebug) {
    for (const o of world.obstacles) {
      ctx.fillStyle = o.kind === 'wall' ? 'rgba(220,60,60,.45)' : 'rgba(230,160,40,.4)';
      ctx.fillRect(o.x, o.y, o.w, o.h);
    }
  }

  const me = world.self;
  // earshot radius
  ctx.save();
  ctx.beginPath();
  ctx.arc(me.x, me.y, hearRadius ?? HEAR_RADIUS, 0, Math.PI * 2);
  const radiusGlow = ctx.createRadialGradient(me.x, me.y, 8, me.x, me.y, hearRadius ?? HEAR_RADIUS);
  radiusGlow.addColorStop(0, 'rgba(55, 183, 151, .16)');
  radiusGlow.addColorStop(1, 'rgba(55, 183, 151, .015)');
  ctx.fillStyle = radiusGlow;
  ctx.fill();
  ctx.setLineDash([6, 6]);
  ctx.strokeStyle = 'rgba(26, 135, 109, .55)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  // lines to connected peers, thickness follows the current gain
  for (const id of world.connected) {
    const u = world.users.get(id);
    if (!u) continue;
    const g = mixer?.peers.get(id)?.g ?? 0;
    ctx.beginPath();
    ctx.moveTo(me.x, me.y);
    ctx.lineTo(u.rx, u.ry);
    ctx.strokeStyle = `rgba(26, 135, 109, ${0.18 + g * 0.7})`;
    ctx.lineWidth = 1 + g * 2.5;
    ctx.setLineDash([5, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  const people = [...world.users.values()].filter((u) => u.id !== world.selfId).map((u) => ({ ...u, self: false }));
  people.push({ id: world.selfId, name: world.selfName ?? 'You', color: world.selfColor ?? '#e5bd83', avatarId: world.selfAvatarId, rx: me.x, ry: me.y, self: true });
  people.sort((a, b) => a.ry - b.ry);

  for (const p of people) {
    const speaking = !p.self && mixer && mixer.levelOf(p.id) > 0.08;
    ctx.beginPath();
    ctx.ellipse(p.rx, p.ry + 10, AVATAR_DISPLAY_RADIUS + 4, AVATAR_DISPLAY_RADIUS * 0.62, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(31, 42, 53, .23)';
    ctx.fill();
    if (speaking || p.self) {
      ctx.beginPath();
      ctx.arc(p.rx, p.ry, AVATAR_DISPLAY_RADIUS + (speaking ? 7 : 5), 0, Math.PI * 2);
      ctx.strokeStyle = speaking ? 'rgba(26, 135, 109, .27)' : 'rgba(255, 255, 255, .82)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.save();
    ctx.shadowColor = 'rgba(20, 34, 46, .26)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;
    ctx.beginPath();
    ctx.arc(p.rx, p.ry, AVATAR_DISPLAY_RADIUS, 0, Math.PI * 2);
    const avatar = avatarById(p.avatarId);
    ctx.fillStyle = avatar.background ?? p.color;
    ctx.fill();
    ctx.clip();
    const avatarImage = getAvatarImage(avatar);
    if (avatarImage?.complete && avatarImage.naturalWidth) {
      const size = AVATAR_DISPLAY_RADIUS * 2;
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
    } else if (avatar.id === 'initials') {
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = '#fff';
      ctx.font = '700 15px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(initials(p.name), p.rx, p.ry + 0.5);
    } else if (!avatar.emoji) {
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = '#fff';
      ctx.font = '700 15px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(initials(p.name), p.rx, p.ry + 0.5);
    }
    ctx.restore();
    ctx.lineWidth = speaking ? 2.5 : 2;
    ctx.strokeStyle = speaking ? '#16866c' : p.self ? '#ffffff' : 'rgba(255, 255, 255, .94)';
    ctx.stroke();
    ctx.font = '700 11px system-ui, sans-serif';
    const label = p.self ? `${p.name} (You)` : p.name;
    const labelWidth = ctx.measureText(label).width;
    const w = labelWidth + 32;
    ctx.fillStyle = 'rgba(19, 34, 45, .86)';
    roundedRect(ctx, p.rx - w / 2, p.ry - AVATAR_DISPLAY_RADIUS - 21, w, 17, 6);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(p.rx - w / 2 + 9, p.ry - AVATAR_DISPLAY_RADIUS - 12.5, 2, 0, Math.PI * 2);
    ctx.fillStyle = speaking ? '#61e0b5' : p.self ? '#78e1bc' : '#d6e2e0';
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.fillText(label, p.rx - w / 2 + 21, p.ry - AVATAR_DISPLAY_RADIUS - 12.5, labelWidth);
    ctx.textAlign = 'center';
  }

  if (world.target) {
    ctx.beginPath();
    ctx.arc(world.target.x, world.target.y, 5, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(27,42,65,.5)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function roundedRect(ctx, x, y, width, height, radius) {
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, width, height, radius);
    return;
  }
  roundedRectPath(ctx, x, y, width, height, radius);
}
