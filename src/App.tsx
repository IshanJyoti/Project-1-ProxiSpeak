import { useEffect, useRef } from 'react';

export default function App() {
  // Fix: Explicitly type the ref as HTMLDivElement so it isn't inferred as 'never'
  const revealImgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 1. Word Splitting Logic
    // Fix: Explicitly tell TypeScript we are selecting HTMLElements
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
          words.forEach(word => {
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
        words.forEach(word => {
          const span = document.createElement('span');
          span.className = 'pull-word';
          span.style.animationDelay = `${wordIndex * 0.1}s`;
          span.innerText = word;
          el.appendChild(span);
          wordIndex++;
        });
      }
    });

    // 2. Intersection Observers
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
    } else {
      document.querySelectorAll<HTMLElement>('.words-pull-up').forEach(el => el.classList.add('words-visible'));
      document.querySelectorAll<HTMLElement>('.fade-up-reveal').forEach(el => {
        const delay = el.dataset.delay || "0";
        el.style.animationDelay = `${delay}s`;
        el.classList.add('is-visible');
      });
    }

    // 3. Spotlight Reveal Logic
    // Fix: Explicitly type the event parameter
    const handleMove = (e: MouseEvent | TouchEvent) => {
      const revealImg = revealImgRef.current;
      if (!revealImg) return;
      
      let clientX = 0;
      let clientY = 0;
      
      if ('touches' in e && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else if ('clientX' in e) {
        clientX = (e as MouseEvent).clientX;
        clientY = (e as MouseEvent).clientY;
      }

      const rect = revealImg.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      
      const winWidth = window.innerWidth;
      const radius = winWidth < 480 ? 120 : winWidth < 720 ? 160 : 260;
      
      const maskStyle = `radial-gradient(circle ${radius}px at ${x}px ${y}px, #fff 0%, #fff 40%, rgba(255,255,255,0.75) 60%, rgba(255,255,255,0.4) 75%, rgba(255,255,255,0.12) 88%, transparent 100%)`;
      
      revealImg.style.webkitMaskImage = maskStyle;
      revealImg.style.maskImage = maskStyle;
    };

    window.addEventListener('mousemove', handleMove as EventListener);
    window.addEventListener('touchmove', handleMove as EventListener, { passive: true });

    return () => {
      window.removeEventListener('mousemove', handleMove as EventListener);
      window.removeEventListener('touchmove', handleMove as EventListener);
    };
  }, []);

  return (
    <>
      <style>{`
        :root {
          --cream: #f8fafc;
          --muted: #94a3b8;
          --label: #64748b;
          --orange: #84cc16;
          --card: rgba(15, 23, 42, 0.65);
        }
        
        * { box-sizing: border-box; margin: 0; padding: 0; }
        
        html, body {
          background-color: #020617;
          color: var(--cream);
          overflow-x: hidden;
          font-family: 'Inter', system-ui, -apple-system, sans-serif;
          -webkit-font-smoothing: antialiased;
        }
        
        h1, h2, h3, .heading-font {
          font-family: 'Orbitron', 'Arial Narrow', sans-serif;
          font-weight: 700;
          letter-spacing: 0.02em;
        }
        
        button { font-family: inherit; cursor: pointer; outline: none; }
        
        .hero { position: relative; width: 100%; height: 100vh; height: 100dvh; overflow: hidden; background-color: #020617; }
        
        .hero-base-img {
          position: absolute; top: 0; right: 0; bottom: 0; left: 0; z-index: 1;
          background-size: cover; background-position: center center;
          background-image: url('https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20260831_115955_2a9adb39-5e9b-4ced-96e2-6900eabe3de9.png&w=1920&q=85');
          opacity: 0; filter: grayscale(100%) brightness(0.6);
        }
        
        .hero-reveal-img {
          position: absolute; top: 0; right: 0; bottom: 0; left: 0; z-index: 2; pointer-events: none;
          background-size: cover; background-position: center center;
          background-image: url('https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20260831_123709_183f0065-efb2-4bb2-a849-13aaa5af2f3f.png&w=1920&q=85');
          -webkit-mask-image: radial-gradient(circle 0px at -999px -999px, #fff, transparent);
          mask-image: radial-gradient(circle 0px at -999px -999px, #fff, transparent);
          -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat; filter: grayscale(100%);
        }
        
        .hero-ui {
          position: absolute; top: 0; right: 0; bottom: 0; left: 0; z-index: 8; display: grid;
          grid-template-columns: 1fr 1fr; grid-template-rows: auto 1fr auto; padding: 36px 44px 40px; pointer-events: none;
        }
        
        .hero-left { grid-column: 1; grid-row: 1 / -1; display: flex; flex-direction: column; justify-content: space-between; align-items: flex-start; gap: 28px; min-width: 0; }
        
        .hero-copy { max-width: 580px; padding-right: 56px; pointer-events: auto; }
        
        .hero-copy h1 { font-size: clamp(2rem, 4vw, 3.5rem); line-height: 1; text-transform: uppercase; color: #fff; text-shadow: 0 2px 28px rgba(0,0,0,0.5); }
        .hero-copy h1 > span { display: block; }
        .hero-copy p { margin-top: 18px; max-width: 380px; font-size: 14px; font-weight: 400; line-height: 1.6; color: var(--muted); }
        
        .product-card {
          pointer-events: auto; width: min(340px, 100%); display: grid; grid-template-columns: 86px 1fr; grid-template-rows: auto auto; gap: 10px 14px;
          padding: 14px; border-radius: 18px; background: var(--card); backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);
          border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 18px 50px rgba(0,0,0,0.4);
        }
        
        .product-thumb {
          grid-column: 1; grid-row: 1 / -1; width: 86px; min-height: 86px; border-radius: 12px; overflow: hidden;
          background-size: cover; background-position: center; background-image: url('https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20260831_121937_3f02b5a0-5b86-43d9-b30e-03c5e46632e7.png&w=1920&q=85');
          filter: grayscale(100%);
        }
        
        .product-body { grid-column: 2; grid-row: 1; }
        .product-body h2 { font-size: 12px; line-height: 1.25; text-transform: uppercase; color: var(--cream); }
        .product-body p { margin-top: 6px; font-size: 11.5px; line-height: 1.45; color: var(--muted); }
        
        .cart-btn {
          grid-column: 2; grid-row: 2; justify-self: start; align-self: end; border: 1px solid var(--orange); border-radius: 999px;
          padding: 7px 16px; font-size: 12px; font-weight: 600; color: #020617; background: var(--orange); transition: opacity 0.2s ease, transform 0.2s ease;
        }
        .cart-btn:hover { opacity: 0.9; transform: translateY(-1px); }
        
        .hero-page { position: absolute; top: 36px; right: 44px; font-size: 13px; font-family: 'Orbitron', sans-serif; letter-spacing: 0.1em; color: var(--orange); }
        
        .specs { grid-column: 2; grid-row: 3; justify-self: end; pointer-events: auto; width: min(340px, 100%); }
        .specs h3 { font-size: 12px; text-transform: uppercase; margin-bottom: 14px; letter-spacing: 0.12em; color: var(--orange); }
        .spec-row { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; padding: 7px 0; }
        .spec-row + .spec-row { border-top: 1px solid rgba(255,255,255,0.08); }
        .spec-label { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--label); }
        .spec-value { font-size: 12.5px; font-weight: 500; color: var(--cream); text-align: right; white-space: nowrap; }
        
        @keyframes heroImageIn { from { opacity: 0; transform: scale(1.1); } to { opacity: 1; transform: scale(1); } }
        .hero-image-animate { animation: heroImageIn 1.2s cubic-bezier(0.25,0.46,0.45,0.94) forwards; animation-delay: 0.1s; }
        
        @keyframes wordPullUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        .pull-word { display: inline-block; opacity: 0; transform: translateY(20px); }
        .pull-word:not(:last-child) { margin-right: 0.3em; }
        .words-visible .pull-word { animation: wordPullUp 0.55s ease forwards; }
        
        @keyframes fadeUp { from { opacity: 0; transform: translateY(14px); filter: blur(4px); } to { opacity: 1; transform: translateY(0); filter: blur(0); } }
        .fade-up-reveal { opacity: 0; transform: translateY(14px); filter: blur(4px); }
        .fade-up-reveal.is-visible { animation: fadeUp 0.6s ease forwards; }
        
        @media (max-width: 768px) {
          .hero-ui { grid-template-columns: 1fr; grid-template-rows: auto 1fr auto; padding: 24px 20px 28px 20px; }
          .hero-left { grid-row: 1 / 3; gap: 24px; }
          .hero-page { top: 24px; right: 20px; }
          .specs { grid-row: 3; grid-column: 1; justify-self: stretch; width: 100%; margin-top: 8px; }
        }
        @media (max-width: 720px) {
          .hero { height: auto; min-height: 100vh; min-height: 100dvh; }
          .hero-ui { position: relative; display: flex; flex-direction: column; min-height: 100vh; min-height: 100dvh; justify-content: flex-start; gap: 28px; }
          .hero-left { width: 100%; }
          .hero-copy { max-width: 100%; padding-right: 48px; }
          .product-card, .specs { width: 100%; }
          .specs { margin-top: auto; }
          .hero-base-img, .hero-reveal-img { position: absolute; }
        }
      `}</style>

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
                <p className="fade-up-reveal" data-delay="1.05">Active connections dynamically pan and gain based on 100px earshot.</p>
              </div>
              <button className="cart-btn fade-up-reveal" data-delay="1.15">Enter Office</button>
            </article>
          </div>

          <div className="hero-page fade-up-reveal" data-delay="0.75">SYSTEM ONLINE</div>

          <div className="specs">
            <h3 className="words-pull-up">Architecture</h3>
            <div className="spec-row fade-up-reveal" data-delay="1.2">
              <span className="spec-label">Audio Layer</span>
              <span className="spec-value">WebRTC & Web Audio API</span>
            </div>
            <div className="spec-row fade-up-reveal" data-delay="1.3">
              <span className="spec-label">Proximity</span>
              <span className="spec-value">MongoDB $near & $geoWithin</span>
            </div>
            <div className="spec-row fade-up-reveal" data-delay="1.4">
              <span className="spec-label">Rendering</span>
              <span className="spec-value">React HTML5 Canvas (60FPS)</span>
            </div>
            <div className="spec-row fade-up-reveal" data-delay="1.5">
              <span className="spec-label">Signaling</span>
              <span className="spec-value">Node.js + Socket.io Mesh</span>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}