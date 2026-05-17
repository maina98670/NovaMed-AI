import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLang, LANGUAGES } from '../context/LanguageContext';

export default function LanguageSelect() {
  const { setLang, t } = useLang();
  const nav = useNavigate();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);

  const filtered = LANGUAGES.filter(l =>
    l.name.toLowerCase().includes(search.toLowerCase()) ||
    l.nativeName.toLowerCase().includes(search.toLowerCase())
  );

  const handleContinue = () => {
    if (selected) {
      setLang(selected);
      nav('/login', { replace: true });
    }
  };

  return (
    <div style={s.wrap}>
      <style>{css}</style>

      {/* Floating medical glyphs */}
      <div style={s.glyphs} aria-hidden="true">
        {['❤️','🩺','💊','🧬','🩻','🧠'].map((g, i) => (
          <span key={i} style={{
            ...s.glyph,
            top: ['14%','24%','70%','80%','45%','55%'][i],
            left: i % 2 === 0 ? ['10%','14%','6%'][Math.floor(i/2)] : undefined,
            right: i % 2 !== 0 ? ['12%','16%','8%'][Math.floor(i/2)] : undefined,
            animationDelay: `${-i * 0.8}s`,
          }}>{g}</span>
        ))}
      </div>

      <div style={s.card}>
        {/* Logo */}
        <div style={s.logoRow}>
          <div style={s.logoBox}>N+</div>
          <span style={s.brandName}>NovaMed AI</span>
        </div>

        <h2 style={s.title}>
          {t?.selectLanguage || 'Select your language'}
        </h2>
        <p style={s.subtitle}>Choose the language you'd like to use</p>

        {/* Search */}
        <div style={s.searchWrap}>
          <span style={s.searchIcon}>🔍</span>
          <input
            style={s.searchInput}
            placeholder={t?.searchLang || 'Search language…'}
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />
          {search && (
            <button style={s.clearBtn} onClick={() => setSearch('')}>✕</button>
          )}
        </div>

        {/* Language grid */}
        <div style={s.grid}>
          {filtered.map(lang => (
            <button
              key={lang.code}
              style={{
                ...s.langBtn,
                ...(selected === lang.code ? s.langBtnActive : {}),
              }}
              onClick={() => setSelected(lang.code)}
              className="lang-btn"
            >
              <span style={s.flag}>{lang.flag}</span>
              <span style={s.nativeName}>{lang.nativeName}</span>
              <span style={s.engName}>{lang.name}</span>
              {selected === lang.code && <span style={s.check}>✓</span>}
            </button>
          ))}
          {filtered.length === 0 && (
            <p style={s.noResults}>No languages found</p>
          )}
        </div>

        {/* Continue */}
        <button
          style={{ ...s.continueBtn, ...(selected ? {} : s.continueBtnDisabled) }}
          onClick={handleContinue}
          disabled={!selected}
        >
          {t?.continueBtn || 'Continue'} →
        </button>
      </div>
    </div>
  );
}

const css = `
  @keyframes floatY {
    0%, 100% { transform: translateY(0); }
    50%       { transform: translateY(-14px); }
  }
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(16px); }
    to   { opacity: 1; transform: none; }
  }
  .lang-btn:hover {
    border-color: #1e6bff !important;
    background: #eff6ff !important;
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(30,107,255,.12) !important;
  }
`;

const s = {
  wrap: {
    minHeight: '100vh',
    background: 'radial-gradient(ellipse at top, #1e6bff 0%, #0b3d91 55%, #062a6b 100%)',
    display: 'grid',
    placeItems: 'center',
    padding: '24px 16px',
    position: 'relative',
    overflow: 'hidden',
  },
  glyphs: { position: 'absolute', inset: 0, pointerEvents: 'none' },
  glyph: {
    position: 'absolute', fontSize: 34, opacity: 0.3,
    animation: 'floatY 5s ease-in-out infinite',
  },
  card: {
    background: '#fff',
    borderRadius: 24,
    padding: '36px 32px',
    width: '100%',
    maxWidth: 680,
    boxShadow: '0 24px 80px rgba(0,0,0,.25)',
    animation: 'fadeUp .7s ease both',
    position: 'relative',
    zIndex: 1,
  },
  logoRow: {
    display: 'flex', alignItems: 'center', gap: 10,
    marginBottom: 24,
  },
  logoBox: {
    width: 40, height: 40, borderRadius: 11,
    background: 'linear-gradient(135deg, #4f8eff, #34d399)',
    display: 'grid', placeItems: 'center',
    fontWeight: 800, fontSize: 15, color: '#fff',
  },
  brandName: {
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    fontWeight: 800, fontSize: 18, color: '#0f172a',
  },
  title: {
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    fontSize: 24, fontWeight: 800, color: '#0f172a',
    margin: '0 0 4px',
  },
  subtitle: { fontSize: 14, color: '#64748b', margin: '0 0 20px' },
  searchWrap: {
    position: 'relative', marginBottom: 18,
    display: 'flex', alignItems: 'center',
  },
  searchIcon: {
    position: 'absolute', left: 12, fontSize: 15, pointerEvents: 'none',
  },
  searchInput: {
    width: '100%', padding: '10px 36px 10px 36px',
    border: '1.5px solid #e2e8f0', borderRadius: 10,
    fontSize: 14, outline: 'none', boxSizing: 'border-box',
    fontFamily: 'inherit',
    transition: 'border-color .2s',
  },
  clearBtn: {
    position: 'absolute', right: 12, background: 'none', border: 'none',
    cursor: 'pointer', fontSize: 13, color: '#94a3b8', padding: '2px 4px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))',
    gap: 10,
    maxHeight: 340,
    overflowY: 'auto',
    padding: '4px 2px',
    marginBottom: 20,
  },
  langBtn: {
    position: 'relative',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    gap: 4, padding: '14px 10px',
    border: '1.5px solid #e2e8f0', borderRadius: 12,
    background: '#fff', cursor: 'pointer',
    textAlign: 'center', transition: 'all .18s',
  },
  langBtnActive: {
    borderColor: '#1e6bff',
    background: '#eff6ff',
    boxShadow: '0 0 0 3px rgba(30,107,255,.15)',
  },
  flag: { fontSize: 26 },
  nativeName: { fontSize: 13, fontWeight: 700, color: '#0f172a', lineHeight: 1.2 },
  engName: { fontSize: 11, color: '#94a3b8', lineHeight: 1.2 },
  check: {
    position: 'absolute', top: 6, right: 8,
    fontSize: 13, color: '#1e6bff', fontWeight: 700,
  },
  noResults: { gridColumn: '1/-1', textAlign: 'center', color: '#94a3b8', padding: 24 },
  continueBtn: {
    width: '100%', padding: '13px',
    background: 'linear-gradient(135deg, #1e6bff, #0b3d91)',
    color: '#fff', border: 'none', borderRadius: 12,
    fontSize: 15, fontWeight: 700, cursor: 'pointer',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    transition: 'opacity .2s',
  },
  continueBtnDisabled: { opacity: 0.45, cursor: 'not-allowed' },
};
