import { useEffect, useRef } from 'react';

export default function App() {
  const revealImgRef = useRef<HTMLDivElement>(null);
  const avatarSectionRef = useRef<HTMLElement>(null);

  const scrollToAvatar = () => {
    avatarSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
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
      
      const maskStyle = `radial-gradient(circle ${radius}px at ${x}px ${y}px, #000 0%, #000 40%, rgba(0,0,0,0.75) 60%, rgba(0,0,0,0.4) 75%, rgba(0,0,0,0.12) 88%, transparent 100%)`;
      
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
          /* Light Theme Colors */
          --cream: #0f172a;         /* Dark Slate for main text */
          --muted: #475569;         /* Medium Grey for secondary text */
          --label: #64748b;         /* Lighter Grey for labels */
          --accent: #0f172a;        /* Black/Dark Slate for accents & buttons */
          --bg-main: #f1f5f9;       /* Light Grey-White background */
          --card: rgba(255, 255, 255, 0.85); /* White glassmorphism */
          --card-border: rgba(0, 0, 0, 0.1); /* Subtle dark border */
        }
        
        * { box-sizing: border-box; margin: 0; padding: 0; }
        
        html, body {
          background-color: var(--bg-main);
          color: var(--cream);
          font-family: 'Inter', system-ui, -apple-system, sans-serif;
          -webkit-font-smoothing: antialiased;
        }

        .scroll-container {
          height: 100vh;
          overflow-y: auto;
          overflow-x: hidden;
          scroll-behavior: smooth;
        }
        
        h1, h2, h3, .heading-font {
          font-family: 'Orbitron', 'Arial Narrow', sans-serif;
          font-weight: 700;
          letter-spacing: 0.02em;
        }
        
        button { font-family: inherit; cursor: pointer; outline: none; }
        
        .hero { position: relative; width: 100%; height: 100vh; height: 100dvh; overflow: hidden; background-color: var(--bg-main); }
        
        .hero-base-img {
          position: absolute; top: 0; right: 0; bottom: 0; left: 0; z-index: 1;
          background-size: cover; background-position: center center;
          background-image: url('https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20260831_115955_2a9adb39-5e9b-4ced-96e2-6900eabe3de9.png&w=1920&q=85');
          opacity: 0; filter: grayscale(100%) opacity(0.12);
        }
        
        .hero-reveal-img {
          position: absolute; top: 0; right: 0; bottom: 0; left: 0; z-index: 2; pointer-events: none;
          background-size: cover; background-position: center center;
          background-image: url('https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20260831_123709_183f0065-efb2-4bb2-a849-13aaa5af2f3f.png&w=1920&q=85');
          -webkit-mask-image: radial-gradient(circle 0px at -999px -999px, #000, transparent);
          mask-image: radial-gradient(circle 0px at -999px -999px, #000, transparent);
          -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat; 
          filter: grayscale(100%) opacity(0.4);
        }
        
        .hero-ui {
          position: absolute; top: 0; right: 0; bottom: 0; left: 0; z-index: 8; display: grid;
          grid-template-columns: 1fr 1fr; grid-template-rows: auto 1fr auto; padding: 36px 44px 40px; pointer-events: none;
        }
        
        .hero-left { grid-column: 1; grid-row: 1 / -1; display: flex; flex-direction: column; justify-content: space-between; align-items: flex-start; gap: 28px; min-width: 0; }
        .hero-copy { max-width: 580px; padding-right: 56px; pointer-events: auto; }
        .hero-copy h1 { font-size: clamp(2rem, 4vw, 3.5rem); line-height: 1; text-transform: uppercase; color: #020617; text-shadow: 0 4px 24px rgba(0,0,0,0.08); }
        .hero-copy h1 > span { display: block; }
        .hero-copy p { margin-top: 18px; max-width: 380px; font-size: 14px; font-weight: 500; line-height: 1.6; color: var(--muted); }
        
        .product-card {
          pointer-events: auto; width: min(340px, 100%); display: grid; grid-template-columns: 86px 1fr; grid-template-rows: auto auto; gap: 10px 14px;
          padding: 14px; border-radius: 18px; background: var(--card); backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);
          border: 1px solid var(--card-border); box-shadow: 0 18px 40px rgba(0,0,0,0.06);
        }
        
        .product-thumb {
          grid-column: 1; grid-row: 1 / -1; width: 86px; min-height: 86px; border-radius: 12px; overflow: hidden;
          background-size: cover; background-position: center; background-image: url('https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20260831_121937_3f02b5a0-5b86-43d9-b30e-03c5e46632e7.png&w=1920&q=85');
          filter: grayscale(100%); opacity: 0.8;
        }
        
        .product-body { grid-column: 2; grid-row: 1; }
        .product-body h2 { font-size: 12px; line-height: 1.25; text-transform: uppercase; color: var(--cream); font-weight: 800; }
        .product-body p { margin-top: 6px; font-size: 11.5px; line-height: 1.45; color: var(--muted); font-weight: 500; }
        
        .cart-btn {
          grid-column: 2; grid-row: 2; justify-self: start; align-self: end; border: 1px solid var(--accent); border-radius: 999px;
          padding: 7px 16px; font-size: 12px; font-weight: 600; color: #ffffff; background: var(--accent); transition: opacity 0.2s ease, transform 0.2s ease;
        }
        .cart-btn:hover { opacity: 0.9; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
        
        .hero-page { position: absolute; top: 36px; right: 44px; font-size: 13px; font-family: 'Orbitron', sans-serif; letter-spacing: 0.1em; color: var(--accent); font-weight: 600; }
        
        .specs { grid-column: 2; grid-row: 3; justify-self: end; pointer-events: auto; width: min(340px, 100%); }
        .specs h3 { font-size: 12px; text-transform: uppercase; margin-bottom: 14px; letter-spacing: 0.12em; color: var(--accent); font-weight: 800; }
        .spec-row { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; padding: 7px 0; }
        .spec-row + .spec-row { border-top: 1px solid var(--card-border); }
        .spec-label { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--label); font-weight: 600; }
        .spec-value { font-size: 12.5px; font-weight: 700; color: var(--cream); text-align: right; white-space: nowrap; }

        /* ========================================================
           AVATAR SECTION (Scrolls below Hero)
           ======================================================== */
        .avatar-section {
          width: 100%; min-height: 100vh;
          display: flex; justify-content: center; align-items: center; 
          background-color: #cbd5e1; /* Slightly darker grey background */
          background-image: radial-gradient(circle at 50% 0%, rgba(0, 0, 0, 0.06) 0%, transparent 60%);
          padding: 80px 20px;
        }

        .avatar-panel {
          width: 100%; max-width: 800px; 
          background: rgba(255, 255, 255, 0.9);
          border: 1px solid rgba(255, 255, 255, 0.6);
          border-radius: 24px; padding: 40px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px;
          box-shadow: 0 30px 60px -12px rgba(0, 0, 0, 0.1);
        }

        .panel-col { display: flex; flex-direction: column; gap: 20px; }
        .panel-title { font-size: 18px; color: var(--accent); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 10px; border-bottom: 1px solid var(--card-border); padding-bottom: 10px; font-weight: 800; }
        
        .upload-box {
          border: 2px dashed rgba(0,0,0,0.15); border-radius: 16px; height: 150px; display: flex; flex-direction: column;
          justify-content: center; align-items: center; cursor: pointer; transition: all 0.2s; color: var(--muted); font-size: 14px;
          background: rgba(0,0,0,0.02); font-weight: 500;
        }
        .upload-box:hover { border-color: var(--accent); color: var(--cream); background: rgba(0, 0, 0, 0.05); }

        .text-input {
          width: 100%; background: #ffffff; border: 1px solid rgba(0,0,0,0.15); border-radius: 8px;
          padding: 12px; color: var(--cream); font-family: inherit; font-size: 14px; outline: none; transition: border-color 0.2s; font-weight: 500;
        }
        .text-input:focus { border-color: var(--accent); box-shadow: 0 0 0 2px rgba(15, 23, 42, 0.1); }
        .text-input::placeholder { color: #94a3b8; }

        .avatar-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; }
        .avatar-circle {
          aspect-ratio: 1; border-radius: 50%; background: #e2e8f0; border: 2px solid transparent; cursor: pointer;
          transition: all 0.2s; display: flex; justify-content: center; align-items: center; overflow: hidden;
        }
        .avatar-circle:hover { border-color: rgba(0,0,0,0.2); }
        .avatar-circle.selected { border-color: var(--accent); box-shadow: 0 4px 12px rgba(0,0,0,0.1); background: #cbd5e1; }

        .action-btn {
          width: 100%; background: var(--accent); color: #ffffff; border: none; padding: 14px; border-radius: 8px;
          font-weight: 600; font-family: 'Orbitron', sans-serif; text-transform: uppercase; margin-top: 20px; transition: opacity 0.2s, transform 0.2s; cursor: pointer; letter-spacing: 0.05em;
        }
        .action-btn:hover { opacity: 0.9; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
        
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
          .avatar-panel { grid-template-columns: 1fr; gap: 20px; padding: 25px; }
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

      <div className="scroll-container">
        {/* =========================================
            1. HERO SECTION
            ========================================= */}
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
                {/* Scroll button triggers scroll to section below */}
                <button className="cart-btn fade-up-reveal" data-delay="1.15" onClick={scrollToAvatar}>
                  Enter Office
                </button>
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
                <span className="spec-value">MongoDB $near & geoWithin</span>
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

        {/* =========================================
            2. AVATAR SETUP SECTION (Below Hero)
            ========================================= */}
        <section ref={avatarSectionRef} className="avatar-section">
            <div className="avatar-panel fade-up-reveal is-visible" style={{ animationDelay: '0.2s' }}>
                <div className="panel-col">
                  <h3 className="panel-title heading-font">1. Create Avatar</h3>
                  <div className="upload-box">
                      <span style={{ fontSize: '24px', marginBottom: '8px' }}>📷</span>
                      <p>Drag & Drop Photo</p>
                  </div>
                  <textarea 
                    className="text-input" 
                    rows={3} 
                    placeholder="Or describe your avatar (e.g. Cyberpunk engineer with neon jacket...)"
                  ></textarea>
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
                      <button className="action-btn">Launch Map</button>
                  </div>
                </div>
            </div>
        </section>

      </div>
    </>
  );
}