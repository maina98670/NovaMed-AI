import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LanguageContext';

/**
 * Animated splash — routes to /select-language if no lang chosen,
 * otherwise to /dashboard (if logged in) or /login.
 */
export default function Splash() {
  const nav = useNavigate();
  const { user, loading } = useAuth();
  const { lang } = useLang();

  useEffect(() => {
    const t = setTimeout(() => {
      if (loading) return;
      if (!lang) {
        nav('/select-language', { replace: true });
      } else {
        nav(user ? '/dashboard' : '/login', { replace: true });
      }
    }, 2400);
    return () => clearTimeout(t);
  }, [loading, user, nav, lang]);

  return (
    <div style={styles.wrap}>
      <style>{css}</style>

      {/* floating medical glyphs */}
      <div style={styles.glyphs} aria-hidden="true">
        <span style={{ ...styles.glyph, top: '14%',  left: '10%', animationDelay: '0s' }}>❤️</span>
        <span style={{ ...styles.glyph, top: '24%', right: '12%', animationDelay: '-2s' }}>🩺</span>
        <span style={{ ...styles.glyph, bottom: '20%', left: '14%', animationDelay: '-3s' }}>💊</span>
        <span style={{ ...styles.glyph, bottom: '14%', right: '16%', animationDelay: '-1s' }}>🧬</span>
        <span style={{ ...styles.glyph, top: '50%', left: '6%', animationDelay: '-4s' }}>🩻</span>
        <span style={{ ...styles.glyph, top: '54%', right: '8%', animationDelay: '-2.5s' }}>🧠</span>
      </div>

      <div style={styles.center}>
        <div style={styles.cross}>
          <div className="pulse" style={styles.pulse} />
          <svg width="96" height="96" viewBox="0 0 64 64" fill="none">
            <rect width="64" height="64" rx="18" fill="url(#gg)"/>
            <path d="M26 12h12v14h14v12H38v14H26V38H12V26h14z" fill="#fff"/>
            <defs>
              <linearGradient id="gg" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#4f8eff"/>
                <stop offset="1" stopColor="#34d399"/>
              </linearGradient>
            </defs>
          </svg>
        </div>

        <h1 style={styles.title}>
          Nova<span style={{ color: '#34d399' }}>Med</span>{' '}
          <span style={styles.aiBadge}>AI</span>
        </h1>
        <p style={styles.tag}>Intelligent clinical assistant for modern hospitals</p>

        {/* ECG line */}
        <svg style={styles.ecg} viewBox="0 0 600 80" preserveAspectRatio="none">
          <path className="ecg-line" d="M0 40 L100 40 L130 40 L150 10 L170 70 L190 25 L210 40 L300 40 L330 40 L350 12 L370 68 L390 28 L410 40 L600 40"
                fill="none" stroke="#fff" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"/>
        </svg>

        <div style={styles.bar}><div className="bar-fill" /></div>
        <p style={styles.foot}>Loading clinical engine…</p>
      </div>
    </div>
  );
}

const css = `
  .pulse { animation: pulse 2.2s ease-in-out infinite; }
  @keyframes pulse {
    0%, 100% { transform: scale(1);   opacity: .55; }
    50%      { transform: scale(1.4); opacity: 0;  }
  }
  .ecg-line {
    stroke-dasharray: 1500;
    stroke-dashoffset: 1500;
    animation: draw 2s ease-out forwards .4s;
    filter: drop-shadow(0 0 6px rgba(255,255,255,.6));
  }
  @keyframes draw { to { stroke-dashoffset: 0; } }
  .bar-fill {
    height: 100%;
    background: linear-gradient(90deg, #4f8eff, #34d399);
    border-radius: 4px;
    width: 30%;
    animation: load 1.6s ease-in-out infinite;
  }
  @keyframes load {
    0%   { margin-left: -30%; }
    100% { margin-left: 100%; }
  }
  @keyframes floatY {
    0%, 100% { transform: translateY(0); }
    50%      { transform: translateY(-14px); }
  }
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(14px); }
    to   { opacity: 1; transform: none; }
  }
`;

const styles = {
  wrap: {
    position: 'fixed', inset: 0, zIndex: 9999,
    background: 'radial-gradient(ellipse at top, #1e6bff 0%, #0b3d91 50%, #062a6b 100%)',
    color: '#fff', display: 'grid', placeItems: 'center',
    overflow: 'hidden',
  },
  glyphs: { position: 'absolute', inset: 0, pointerEvents: 'none' },
  glyph: {
    position: 'absolute', fontSize: 38, opacity: 0.4,
    animation: 'floatY 5s ease-in-out infinite',
    filter: 'drop-shadow(0 4px 14px rgba(0,0,0,.3))',
  },
  center: { position: 'relative', textAlign: 'center', maxWidth: 560, padding: '0 24px' },
  cross: {
    position: 'relative', display: 'inline-grid', placeItems: 'center',
    width: 130, height: 130, marginBottom: 22,
  },
  pulse: {
    position: 'absolute', inset: 0, borderRadius: 28,
    background: 'rgba(255,255,255,.25)',
  },
  title: {
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    fontSize: 'clamp(2.2rem, 6vw, 3.6rem)',
    fontWeight: 800, margin: 0, letterSpacing: '-.02em',
    animation: 'fadeUp .9s ease .2s both',
  },
  aiBadge: {
    background: 'rgba(255,255,255,.18)',
    padding: '4px 14px', borderRadius: 12, fontSize: '.6em',
    verticalAlign: 'middle', letterSpacing: '.1em',
    border: '1px solid rgba(255,255,255,.25)',
  },
  tag: {
    fontSize: '1.05rem', color: '#cfe1ff', marginTop: 10,
    animation: 'fadeUp .9s ease .35s both',
  },
  ecg: {
    width: '100%', maxWidth: 520, height: 70, marginTop: 22, opacity: .9,
  },
  bar: {
    width: 260, height: 4, background: 'rgba(255,255,255,.18)', margin: '24px auto 12px',
    borderRadius: 4, overflow: 'hidden',
  },
  foot: {
    fontSize: 12, color: '#cfe1ff', letterSpacing: '.18em',
    textTransform: 'uppercase', margin: 0,
    animation: 'fadeUp .9s ease .55s both',
  },
};
