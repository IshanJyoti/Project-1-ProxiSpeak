import React, { useEffect, useRef, useState } from 'react';

// --- CSS Extracted safely to avoid JSX curly brace parsing errors ---
const STYLES = `
  :root {
    --cream: #0f172a; --muted: #475569; --label: #64748b; --accent: #0f172a;
    --bg-main: #f1f5f9; --card: rgba(255, 255, 255, 0.85); --card-border: rgba(0, 0, 0, 0.1);
    --lime: #84cc16; --danger: #ef4444; --log-bg: #1e293b; --log-text: #38bdf8;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { background-color: var(--bg-main); color: var(--cream); font-family: 'Inter', system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
  .scroll-container { height: 100vh; overflow-y: auto; overflow-x: hidden; scroll-behavior: smooth; }
  h1, h2, h3, .heading-font { font-family: 'Orbitron', 'Arial Narrow', sans-serif; font-weight: 700; letter-spacing: 0.02em; }
  button { font-family: inherit; cursor: pointer; outline: none; }
  
  /* HERO */
  .hero { position: relative; width: 100%; height: 100vh; height: 100dvh; overflow: hidden; background-color: var(--bg-main); }
  .hero-base-img { position: absolute; top: 0; right: 0; bottom: 0; left: 0; z-index: 1; background-size: cover; background-position: center center; background-image: url('https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20260831_115955_2a9adb39-5e9b-4ced-96e2-6900eabe3de9.png&w=1920&q=85'); opacity: 0; filter: grayscale(100%) opacity(0.12); }
  .hero-reveal-img { position: absolute; top: 0; right: 0; bottom: 0; left: 0; z-index: 2; pointer-events: none; background-size: cover; background-position: center center; background-image: url('https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20260831_123709_183f0065-efb2-4bb2-a849-13aaa5af2f3f.png&w=1920&q=85'); -webkit-mask-image: radial-gradient(circle 0px at -999px -999px, #000, transparent); mask-image: radial-gradient(circle 0px at -999px -999px, #000, transparent); -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat; filter: grayscale(100%) opacity(0.4); }
  .hero-ui { position: absolute; top: 0; right: 0; bottom: 0; left: 0; z-index: 8; display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: auto 1fr auto; padding: 36px 44px 40px; pointer-events: none; }
  .hero-left { grid-column: 1; grid-row: 1 / -1; display: flex; flex-direction: column; justify-content: space-between; align-items: flex-start; gap: 28px; min-width: 0; }
  .hero-copy { max-width: 580px; padding-right: 56px; pointer-events: auto; }
  .hero-copy h1 { font-size: clamp(2rem, 4vw, 3.5rem); line-height: 1; text-transform: uppercase; color: #020617; text-shadow: 0 4px 24px rgba(0,0,0,0.08); }
  .hero-copy h1 > span { display: block; }
  .hero-copy p { margin-top: 18px; max-width: 380px; font-size: 14px; font-weight: 500; line-height: 1.6; color: var(--muted); }
  .product-card { pointer-events: auto; width: min(340px, 100%); display: grid; grid-template-columns: 86px 1fr; grid-template-rows: auto auto; gap: 10px 14px; padding: 14px; border-radius: 18px; background: var(--card); backdrop-filter: blur(24px); border: 1px solid var(--card-border); box-shadow: 0 18px 40px rgba(0,0,0,0.06); }
  .product-thumb { grid-column: 1; grid-row: 1 / -1; width: 86px; min-height: 86px; border-radius: 12px; overflow: hidden; background-size: cover; background-position: center; background-image: url('https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20260831_121937_3f02b5a0-5b86-43d9-b30e-03c5e46632e7.png&w=1920&q=85'); filter: grayscale(100%); opacity: 0.8; }
  .product-body { grid-column: 2; grid-row: 1; }
  .product-body h2 { font-size: 12px; line-height: 1.25; text-transform: uppercase; color: var(--cream); font-weight: 800; }
  .product-body p { margin-top: 6px; font-size: 11.5px; line-height: 1.45; color: var(--muted); font-weight: 500; }
  .cart-btn { grid-column: 2; grid-row: 2; justify-self: start; align-self: end; border: 1px solid var(--accent); border-radius: 999px; padding: 7px 16px; font-size: 12px; font-weight: 600; color: #ffffff; background: var(--accent); transition: opacity 0.2s ease, transform 0.2s ease; }
  .cart-btn:hover { opacity: 0.9; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
  .hero-page { position: absolute; top: 36px; right: 44px; font-size: 13px; font-family: 'Orbitron', sans-serif; letter-spacing: 0.1em; color: var(--accent); font-weight: 600; }
  .specs { grid-column: 2; grid-row: 3; justify-self: end; pointer-events: auto; width: min(340px, 100%); }
  .specs h3 { font-size: 12px; text-transform: uppercase; margin-bottom: 14px; letter-spacing: 0.12em; color: var(--accent); font-weight: 800; }
  .spec-row { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; padding: 7px 0; border-bottom: 1px solid var(--card-border); }
  .spec-row:last-child { border-bottom: none; }
  .spec-label { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--label); font-weight: 600; }
  .spec-value { font-size: 12.5px; font-weight: 700; color: var(--cream); text-align: right; white-space: nowrap; }

  /* AVATAR */
  .avatar-section { width: 100%; min-height: 100vh; display: flex; justify-content: center; align-items: center; background-color: #cbd5e1; padding: 80px 20px; }
  .avatar-panel { width: 100%; max-width: 800px; background: rgba(255, 255, 255, 0.9); border: 1px solid rgba(255, 255, 255, 0.6); border-radius: 24px; padding: 40px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; box-shadow: 0 30px 60px -12px rgba(0, 0, 0, 0.1); }
  .panel-col { display: flex; flex-direction: column; gap: 20px; }
  .panel-title { font-size: 18px; color: var(--accent); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 10px; border-bottom: 1px solid var(--card-border); padding-bottom: 10px; font-weight: 800; }
  .upload-box { border: 2px dashed rgba(0,0,0,0.15); border-radius: 16px; height: 150px; display: flex; flex-direction: column; justify-content: center; align-items: center; cursor: pointer; transition: all 0.2s; color: var(--muted); font-size: 14px; background: rgba(0,0,0,0.02); font-weight: 500; }
  .upload-box:hover { border-color: var(--accent); color: var(--cream); background: rgba(0, 0, 0, 0.05); }
  .text-input { width: 100%; background: #ffffff; border: 1px solid rgba(0,0,0,0.15); border-radius: 8px; padding: 12px; color: var(--cream); font-family: inherit; font-size: 14px; outline: none; transition: border-color 0.2s; font-weight: 500; }
  .text-input:focus { border-color: var(--accent); box-shadow: 0 0 0 2px rgba(15, 23, 42, 0.1); }
  .avatar-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; }
  .avatar-circle { aspect-ratio: 1; border-radius: 50%; background: #e2e8f0; border: 2px solid transparent; cursor: pointer; transition: all 0.2s; display: flex; justify-content: center; align-items: center; overflow: hidden; }
  .avatar-circle.selected { border-color: var(--accent); box-shadow: 0 4px 12px rgba(0,0,0,0.1); background: #94a3b8; }
  .action-btn { width: 100%; background: var(--accent); color: #ffffff; border: none; padding: 14px; border-radius: 8px; font-weight: 600; font-family: 'Orbitron', sans-serif; text-transform: uppercase; margin-top: 20px; transition: opacity 0.2s, transform 0.2s; cursor: pointer; }

  /* MAP SELECTION */
  .map-section { width: 100%; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; background-color: #f1f5f9; padding: 80px 20px; border-bottom: 1px solid rgba(0,0,0,0.05); }
  .map-header { text-align: center; margin-bottom: 50px; max-width: 600px; }
  .map-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; width: 100%; max-width: 900px; }
  .map-card { background: rgba(255,255,255,0.95); border: 2px solid transparent; border-radius: 20px; padding: 20px; cursor: pointer; transition: all 0.25s ease; box-shadow: 0 4px 15px rgba(0,0,0,0.03); }
  .map-card.active { border-color: var(--accent); box-shadow: 0 8px 24px rgba(0,0,0,0.12); }
  .map-img { width: 100%; height: 160px; background: #e2e8f0; border-radius: 12px; margin-bottom: 16px; background-size: cover; background-position: center; position: relative; overflow: hidden; }
  .map-tag { position: absolute; top: 10px; right: 10px; background: rgba(255,255,255,0.9); padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; color: var(--accent); }

  /* WORKSPACE / SIMULATION */
  .workspace-section { width: 100%; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; background-color: #cbd5e1; padding: 60px 20px; }
  .workspace-layout { display: flex; gap: 24px; width: 100%; max-width: 1200px; height: 600px; }
  .server-panel { width: 320px; background: var(--log-bg); border-radius: 20px; padding: 20px; display: flex; flex-direction: column; box-shadow: 0 20px 40px rgba(0,0,0,0.2); overflow: hidden; border: 1px solid rgba(255,255,255,0.1); }
  .log-terminal { flex: 1; background: #0f172a; border-radius: 12px; padding: 12px; margin-top: 15px; font-family: monospace; font-size: 11px; color: var(--log-text); overflow-y: auto; box-shadow: inset 0 4px 12px rgba(0,0,0,0.5); }
  .log-entry { margin-bottom: 8px; line-height: 1.4; opacity: 0.9; }
  .log-time { color: #94a3b8; margin-right: 8px; }
  .map-canvas { flex: 1; background: #e2e8f0; border-radius: 20px; position: relative; overflow: hidden; background-image: linear-gradient(rgba(0,0,0,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.05) 1px, transparent 1px); background-size: 40px 40px; border: 4px solid var(--accent); box-shadow: inset 0 0 20px rgba(0,0,0,0.05), 0 20px 40px rgba(0,0,0,0.1); }
  .controls-hint { position: absolute; top: 16px; left: 16px; background: rgba(255,255,255,0.9); padding: 8px 12px; border-radius: 8px; font-size: 11px; font-weight: 700; color: var(--accent); z-index: 10; display: flex; align-items: center; gap: 8px; border: 1px solid rgba(0,0,0,0.1); }
  .key-btn { background: #fff; border: 1px solid #ccc; padding: 2px 6px; border-radius: 4px; box-shadow: 0 2px 0 #ccc; }
  
  .sprite { position: absolute; width: 44px; height: 44px; transform: translate(-50%, -50%); z-index: 20; }
  .sprite-img { width: 100%; height: 100%; border-radius: 50%; border: 2px solid var(--accent); background: #fff; box-shadow: 0 4px 10px rgba(0,0,0,0.15); object-fit: cover; }
  .sprite-name { position: absolute; top: calc(100% + 6px); left: 50%; transform: translateX(-50%); background: rgba(15, 23, 42, 0.85); color: #fff; font-size: 11px; font-weight: 600; padding: 4px 8px; border-radius: 6px; pointer-events: none; white-space: nowrap; backdrop-filter: blur(4px); box-shadow: 0 2px 6px rgba(0,0,0,0.1); display: flex; flex-direction: column; align-items: center; }
  .audio-bar { width: 100%; height: 4px; background: rgba(255,255,255,0.2); border-radius: 2px; margin-top: 4px; overflow: hidden; }
  .audio-fill { height: 100%; background: var(--lime); transition: width 0.1s linear; }

  .proximity-ring { position: absolute; width: 250px; height: 250px; transform: translate(-50%, -50%); border: 2px dashed rgba(132, 204, 22, 0.6); border-radius: 50%; background: rgba(132, 204, 22, 0.08); pointer-events: none; z-index: 10; }

  /* Animations */
  @keyframes heroImageIn { from { opacity: 0; transform: scale(1.1); } to { opacity: 1; transform: scale(1); } }
  .hero-image-animate { animation: heroImageIn 1.2s cubic-bezier(0.25,0.46,0.45,0.94) forwards; animation-delay: 0.1s; }
  @keyframes wordPullUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
  .pull-word { display: inline-block; opacity: 0; transform: translateY(20px); }
  .pull-word:not(:last-child) { margin-right: 0.3em; }
  .words-visible .pull-word { animation: wordPullUp 0.55s ease forwards; }
  @keyframes fadeUp { from { opacity: 0; transform: translateY(14px); filter: blur(4px); } to { opacity: 1; transform: translateY(0); filter: blur(0); } }
  .fade-up-reveal { opacity: 0; transform: translateY(14px); filter: blur(4px); }
  .fade-up-reveal.is-visible { animation: fadeUp 0.6s ease forwards; }
`;

export default function App() {
  // Explicitly typed refs to prevent 'never' errors
  const revealImgRef = useRef<HTMLDivElement>(null);
  const avatarSectionRef = useRef<HTMLElement>(null);
  const mapSectionRef = useRef<HTMLElement>(null);
  const workspaceSectionRef = useRef<HTMLElement>(null);
  const terminalRef = useRef<HTMLDivElement>(null);
  
  const [selectedMap, setSelectedMap] = useState<number>(1);
  const [playerPos, setPlayerPos] = useState({ x: 400, y: 300 });
  const [serverLogs, setServerLogs] = useState<string[]>([]);
  
  const posRef = useRef({ x: 400, y: 300 });
  const keys = useRef<{ [key: string]: boolean }>({});
  const lastUpdateRef = useRef<number>(0);

  const scrollToAvatar = () => avatarSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
  const scrollToMap = () => mapSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
  const scrollToWorkspace = () => workspaceSectionRef.current?.scrollIntoView({ behavior: 'smooth' });

  // Add Log Helper
  const addLog = (message: string) => {
    const time = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 });
    setServerLogs(prev => {
      const newLogs = [...prev, `[${time}] ${message}`];
      return newLogs.length > 25 ? newLogs.slice(newLogs.length - 25) : newLogs;
    });
  };

  // Scroll to bottom of terminal when logs update
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [serverLogs]);

  useEffect(() => {
    // 1. Text Animation Splitting
    const wordElements = document.querySelectorAll<HTMLElement>('.words-pull-up');
    wordElements.forEach((el) => {
      if (el.dataset.split) return;
      el.dataset.split = "true";
      let wordIndex = 0;
      
      if (el.tagName.toLowerCase() === 'h1') {
        const lines = Array.from(el.children);
        el.innerHTML = '';
        lines.forEach(lineSpan => {
          const lineWrap = document.createElement('span');
          lineWrap.className = 'pull-line';
          lineWrap.style.display = 'block';
          const words = (lineSpan as HTMLElement).innerText.trim().split(/\s+/);
          words.forEach((word: string) => {
            const span = document.createElement('span');
            span.className = 'pull-word';
            span.style.animationDelay = `${wordIndex * 0.1}s`;
            span.innerText = word;
            lineWrap.appendChild(span);
            wordIndex++;
          });
          el.appendChild(lineWrap);
        });
      } else {
        const words = el.innerText.trim().split(/\s+/);
        el.innerHTML = '';
        words.forEach((word: string) => {
          const span = document.createElement('span');
          span.className = 'pull-word';
          span.style.animationDelay = `${wordIndex * 0.1}s`;
          span.innerText = word;
          el.appendChild(span);
          wordIndex++;
        });
      }
    });

    // 2. Observers
    if ('IntersectionObserver' in window) {
      const pullObserver = new IntersectionObserver((entries, obs) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('words-visible');
            obs.unobserve(entry.target);
          }
        });
      }, { threshold: 0.2 });
      document.querySelectorAll<HTMLElement>('.words-pull-up').forEach(el => pullObserver.observe(el));

      const fadeObserver = new IntersectionObserver((entries, obs) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const target = entry.target as HTMLElement;
            const delay = target.dataset.delay || "0";
            target.style.animationDelay = `${delay}s`;
            target.classList.add('is-visible');
            obs.unobserve(target);
          }
        });
      }, { threshold: 0.15 });
      document.querySelectorAll<HTMLElement>('.fade-up-reveal').forEach(el => fadeObserver.observe(el));
    }

    // 3. Spotlight
    const handleMove = (e: MouseEvent | TouchEvent) => {
      const revealImg = revealImgRef.current;
      if (!revealImg) return;
      let clientX = 0, clientY = 0;
      if ('touches' in e && e.touches.length > 0) {
        clientX = e.touches[0].clientX; clientY = e.touches[0].clientY;
      } else if ('clientX' in e) {
        clientX = (e as MouseEvent).clientX; clientY = (e as MouseEvent).clientY;
      }
      const rect = revealImg.getBoundingClientRect();
      const x = clientX - rect.left, y = clientY - rect.top;
      const winWidth = window.innerWidth;
      const radius = winWidth < 480 ? 120 : winWidth < 720 ? 160 : 260;
      const maskStyle = `radial-gradient(circle ${radius}px at ${x}px ${y}px, #000 0%, #000 40%, rgba(0,0,0,0.75) 60%, rgba(0,0,0,0.4) 75%, rgba(0,0,0,0.12) 88%, transparent 100%)`;
      revealImg.style.webkitMaskImage = maskStyle;
      revealImg.style.maskImage = maskStyle;
    };
    window.addEventListener('mousemove', handleMove as EventListener);
    window.addEventListener('touchmove', handleMove as EventListener, { passive: true });

    // 4. Game Loop
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;
      const key = e.key.toLowerCase();
      if (['w', 'a', 's', 'd'].includes(key)) {
        if (key === 'w' || key === 's') e.preventDefault();
        keys.current[key] = true;
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (['w', 'a', 's', 'd'].includes(key)) keys.current[key] = false;
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    let animationFrameId: number;
    const SPEED = 4;
    const MAP_WIDTH = 800; // Expected Canvas Width
    const MAP_HEIGHT = 560;

    const gameLoop = () => {
      let { x, y } = posRef.current;
      let moved = false;
      if (keys.current['w']) { y = Math.max(20, y - SPEED); moved = true; }
      if (keys.current['s']) { y = Math.min(MAP_HEIGHT - 20, y + SPEED); moved = true; }
      if (keys.current['a']) { x = Math.max(20, x - SPEED); moved = true; }
      if (keys.current['d']) { x = Math.min(MAP_WIDTH - 20, x + SPEED); moved = true; }

      if (moved) {
        posRef.current = { x, y };
        setPlayerPos({ x, y });
        
        // Throttle backend logs to ~every 250ms while moving
        const now = Date.now();
        if (now - lastUpdateRef.current > 250) {
          addLog(`MongoDB $near query executed for [${Math.round(x)}, ${Math.round(y)}]`);
          lastUpdateRef.current = now;
        }
      }
      animationFrameId = requestAnimationFrame(gameLoop);
    };
    animationFrameId = requestAnimationFrame(gameLoop);

    return () => {
      window.removeEventListener('mousemove', handleMove as EventListener);
      window.removeEventListener('touchmove', handleMove as EventListener);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  const mapData = [
    { id: 1, name: "Central Hub", desc: "Main collaboration area. High traffic.", tag: "50+ Online", count: 52 },
    { id: 2, name: "Breakroom", desc: "Casual proximity chat.", tag: "12 Online", count: 12 },
    { id: 3, name: "Meeting Rooms", desc: "Private enclaves with hard cut-offs.", tag: "4 Active", count: 4 },
    { id: 4, name: "Deep Work Zone", desc: "Muted zones. Audio strictly 2m.", tag: "Quiet", count: 8 }
  ];

  // Mock Users
  const otherUsers = [
    { id: 1, name: "Sarah", x: 450, y: 150, avatar: "https://api.dicebear.com/9.x/avataaars/svg?seed=Sarah" },
    { id: 2, name: "Dev_Jack", x: 200, y: 380, avatar: "https://api.dicebear.com/9.x/avataaars/svg?seed=Jack" },
    { id: 3, name: "Alek", x: 650, y: 320, avatar: "https://api.dicebear.com/9.x/avataaars/svg?seed=Alek" },
    { id: 4, name: "Mia", x: 250, y: 100, avatar: "https://api.dicebear.com/9.x/avataaars/svg?seed=Mia" }
  ];

  const PROXIMITY_RADIUS = 125;
  const isWithinEarshot = (ux: number, uy: number) => {
    return Math.sqrt(Math.pow(playerPos.x - ux, 2) + Math.pow(playerPos.y - uy, 2)) <= PROXIMITY_RADIUS;
  };
  
  const getVolume = (ux: number, uy: number) => {
    const dist = Math.sqrt(Math.pow(playerPos.x - ux, 2) + Math.pow(playerPos.y - uy, 2));
    if (dist > PROXIMITY_RADIUS) return 0;
    // Linear falloff volume (100% at center, 0% at edge)
    return Math.max(0, 1 - (dist / PROXIMITY_RADIUS)) * 100; 
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />

      <div className="scroll-container">
        {/* HERO SECTION */}
        <main className="hero">
          <div className="hero-base-img hero-image-animate"></div>
          <div className="hero-reveal-img" ref={revealImgRef}></div>
          <div className="hero-ui">
            <div className="hero-left">
              <div className="hero-copy">
                <h1 className="words-pull-up">
                  <span>PROXISPEAK //</span>
                  <span>GEOSPATIAL</span>
                  <span>ECOSYSTEM</span>
                </h1>
                <p className="fade-up-reveal" data-delay="0.5">
                  Break out of rigid rooms. Hear your team organically as you move closer on the Canvas map, powered by WebRTC and real-time MongoDB geospatial clusters.
                </p>
              </div>
              <article className="product-card">
                <div className="product-thumb" aria-hidden="true"></div>
                <div className="product-body">
                  <h2 className="words-pull-up">SPATIAL MIXER</h2>
                  <p className="fade-up-reveal" data-delay="1.05">Active connections dynamically pan and gain based on 125px earshot.</p>
                </div>
                <button className="cart-btn fade-up-reveal" data-delay="1.15" onClick={scrollToAvatar}>
                  Enter Office
                </button>
              </article>
            </div>
            <div className="hero-page fade-up-reveal" data-delay="0.75">SYSTEM ONLINE</div>
            <div className="specs">
              <h3 className="words-pull-up">Architecture</h3>
              <div className="spec-row fade-up-reveal" data-delay="1.2"><span className="spec-label">Audio Layer</span><span className="spec-value">WebRTC & Web Audio API</span></div>
              <div className="spec-row fade-up-reveal" data-delay="1.3"><span className="spec-label">Proximity</span><span className="spec-value">MongoDB $near & geoWithin</span></div>
              <div className="spec-row fade-up-reveal" data-delay="1.4"><span className="spec-label">Rendering</span><span className="spec-value">React HTML5 Canvas (60FPS)</span></div>
              <div className="spec-row fade-up-reveal" data-delay="1.5"><span className="spec-label">Signaling</span><span className="spec-value">Node.js + Socket.io Mesh</span></div>
            </div>
          </div>
        </main>

        {/* AVATAR SETUP */}
        <section ref={avatarSectionRef} className="avatar-section">
            <div className="avatar-panel fade-up-reveal" data-delay="0.1">
                <div className="panel-col">
                  <h3 className="panel-title heading-font">1. Create Avatar</h3>
                  <div className="upload-box">
                      <span style={{ fontSize: '24px', marginBottom: '8px' }}>📷</span>
                      <p>Drag & Drop Photo</p>
                  </div>
                  <textarea className="text-input" rows={3} placeholder="Or describe your avatar (e.g. Cyberpunk engineer with neon jacket...)"></textarea>
                </div>
                <div className="panel-col">
                  <h3 className="panel-title heading-font">2. Select Preset</h3>
                  <div className="avatar-grid">
                      {[1, 2, 3, 4, 5, 6].map((i) => (
                        <div key={i} className={`avatar-circle ${i === 1 ? 'selected' : ''}`}>
                            <span style={{ color: 'var(--label)', fontWeight: 'bold' }}>{i}</span>
                        </div>
                      ))}
                  </div>
                  <div style={{ marginTop: 'auto' }}>
                      <input type="text" className="text-input" placeholder="Enter Display Name" style={{ marginBottom: '15px' }} />
                      <button className="action-btn" onClick={scrollToMap}>Next: Select Map</button>
                  </div>
                </div>
            </div>
        </section>

        {/* MAP SELECTION */}
        <section ref={mapSectionRef} className="map-section">
            <div className="map-header fade-up-reveal" data-delay="0.1">
                <h2 className="heading-font" style={{fontSize: '32px', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.05em'}}>Select Workspace</h2>
                <p style={{color: 'var(--muted)', marginTop: '12px', fontSize: '15px'}}>Choose your starting point in the ProxiSpeak ecosystem to begin spatial collaboration.</p>
            </div>
            <div className="map-grid fade-up-reveal" data-delay="0.2">
                {mapData.map((map) => (
                  <div key={map.id} className={`map-card ${selectedMap === map.id ? 'active' : ''}`} onClick={() => setSelectedMap(map.id)}>
                    <div className="map-img" style={{
                      backgroundImage: `url('https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20260831_123709_183f0065-efb2-4bb2-a849-13aaa5af2f3f.png&w=1920&q=85')`, 
                      filter: selectedMap === map.id ? 'grayscale(0%)' : 'grayscale(100%)',
                      transition: 'filter 0.3s ease'
                    }}>
                      <div className="map-tag">{map.tag}</div>
                    </div>
                    <h3 className="heading-font" style={{color: 'var(--accent)', fontSize: '18px', marginBottom: '6px'}}>{map.name}</h3>
                    <p style={{color: 'var(--muted)', fontSize: '13px', lineHeight: '1.5'}}>{map.desc}</p>
                  </div>
                ))}
            </div>
            <div className="fade-up-reveal" data-delay="0.3" style={{ width: '100%', maxWidth: '900px', display: 'flex', justifyContent: 'flex-end', marginTop: '30px' }}>
                <button className="action-btn" style={{ maxWidth: '280px', margin: '0' }} onClick={() => {
                  scrollToWorkspace();
                  addLog("Initializing WebRTC Socket Handshake...");
                  setTimeout(() => addLog("MongoDB Geospatial Engine Connected."), 500);
                }}>Initialize Connection</button>
            </div>
        </section>

        {/* WORKSPACE CANVAS */}
        <section ref={workspaceSectionRef} className="workspace-section">
           <div className="workspace-layout fade-up-reveal" data-delay="0.1">
              
              {/* Sidebar: Backend Terminal Log */}
              <div className="server-panel">
                 <h3 className="heading-font" style={{fontSize: '15px', color: '#fff', textTransform: 'uppercase', letterSpacing: '0.05em'}}>Backend Engine</h3>
                 <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '6px' }}>Simulating Node.js WebRTC routing & MongoDB proximity data.</p>
                 
                 <div className="log-terminal" ref={terminalRef}>
                    {serverLogs.map((log, i) => {
                      const split = log.split('] ');
                      return (
                        <div key={i} className="log-entry">
                          <span className="log-time">{split[0]}]</span> 
                          <span style={{ color: log.includes('WebRTC') ? 'var(--lime)' : log.includes('MongoDB') ? '#facc15' : 'inherit' }}>{split[1]}</span>
                        </div>
                      )
                    })}
                 </div>
              </div>

              {/* Main Canvas Area */}
              <div className="map-canvas">
                 <div className="controls-hint">
                    Use <span className="key-btn">W</span><span className="key-btn">A</span><span className="key-btn">S</span><span className="key-btn">D</span> to move
                 </div>
                 
                 {/* Player Proximity Ring */}
                 <div className="proximity-ring" style={{ left: playerPos.x, top: playerPos.y }}></div>

                 {/* Other Users */}
                 {otherUsers.map(user => {
                   const inEarshot = isWithinEarshot(user.x, user.y);
                   const volume = getVolume(user.x, user.y);
                   
                   // Dynamic log for WebRTC connection
                   if (inEarshot && Math.random() < 0.05) {
                      addLog(`WebRTC DataChannel update: Received audio chunks from ${user.name}`);
                   }

                   return (
                     <div key={user.id} className="sprite" style={{ left: user.x, top: user.y }}>
                       <img src={user.avatar} alt={user.name} className="sprite-img" style={{ borderColor: inEarshot ? 'var(--lime)' : 'rgba(0,0,0,0.2)', opacity: inEarshot ? 1 : 0.6 }} />
                       <div className="sprite-name" style={{ background: inEarshot ? 'var(--lime)' : 'rgba(15, 23, 42, 0.85)', color: inEarshot ? '#000' : '#fff' }}>
                         <span>{user.name}</span>
                         {inEarshot && (
                            <div className="audio-bar">
                               <div className="audio-fill" style={{ width: `${volume}%` }}></div>
                            </div>
                         )}
                       </div>
                     </div>
                   );
                 })}

                 {/* The Player Avatar */}
                 <div className="sprite" style={{ left: playerPos.x, top: playerPos.y, zIndex: 30 }}>
                    <img src="https://api.dicebear.com/9.x/avataaars/svg?seed=You" alt="You" className="sprite-img" style={{ borderColor: 'var(--lime)', borderWidth: '3px' }} />
                    <div className="sprite-name" style={{ background: 'var(--accent)' }}>
                       <span>You</span>
                    </div>
                 </div>
              </div>
           </div>
        </section>

      </div>
    </>
  );
}