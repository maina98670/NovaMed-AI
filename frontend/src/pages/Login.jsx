import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLang, LANGUAGES } from '../context/LanguageContext';
import GoogleSignInButton from '../components/GoogleSignInButton';

export default function Login() {
  const { login } = useAuth();
  const { t, lang, setLang, currentLang } = useLang();
  const nav = useNavigate();

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr]           = useState('');
  const [loading, setLoading]   = useState(false);
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [langSearch, setLangSearch] = useState('');

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr(''); setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
      nav('/dashboard');
    } catch (e) {
      setErr(e.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    // Redirect browser to backend Google OAuth route.
    // Backend handles consent flow and redirects back to
    // /auth/google/callback#token=<jwt> on success.
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000';
    window.location.href = `${apiUrl}/api/auth/google`;
  };

  const filteredLangs = LANGUAGES.filter(l =>
    l.name.toLowerCase().includes(langSearch.toLowerCase()) ||
    l.nativeName.toLowerCase().includes(langSearch.toLowerCase())
  );

  return (
    <div style={s.wrap}>
      {/* Language switcher */}
      <div style={s.langSwitcher}>
        <button style={s.langBtn} onClick={() => setShowLangMenu(p => !p)}>
          <span>{currentLang.flag}</span>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{currentLang.nativeName}</span>
          <span style={{ fontSize: 10, opacity: .6 }}>▾</span>
        </button>
        {showLangMenu && (
          <>
            <div style={s.backdrop} onClick={() => setShowLangMenu(false)} />
            <div style={s.langDropdown}>
              <input
                style={s.langSearch}
                placeholder="Search…"
                value={langSearch}
                onChange={e => setLangSearch(e.target.value)}
                autoFocus
              />
              <div style={s.langList}>
                {filteredLangs.map(l => (
                  <button
                    key={l.code}
                    style={{ ...s.langItem, ...(l.code === lang ? s.langItemActive : {}) }}
                    onClick={() => { setLang(l.code); setShowLangMenu(false); setLangSearch(''); }}
                  >
                    <span>{l.flag}</span>
                    <span>{l.nativeName}</span>
                    <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 'auto' }}>{l.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Left panel */}
      <div style={s.left}>
        <div style={s.brand}>
          <div style={s.logo}>N+</div>
          <span>NovaMed AI</span>
        </div>
        <h2 style={s.h2}>Clinical AI, in your workflow.</h2>
        <p style={s.lead}>
          Adaptive history-taking, AI-assisted diagnosis, automated result
          interpretation and structured treatment plans — all in one place.
        </p>
        <ul style={s.list}>
          <li>🩺 Adaptive history-taking with smart follow-ups</li>
          <li>🧠 AI-powered differential diagnosis</li>
          <li>🩻 Reads X-rays, ECGs and lab reports</li>
          <li>⚠️ Auto-flags abnormal vitals and findings</li>
          <li>📄 One-click clinical PDF summaries</li>
        </ul>
      </div>

      {/* Right panel */}
      <div style={s.right}>
        <form className="card" style={s.form} onSubmit={onSubmit}>
          <h2 style={{ margin: 0, fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
            {t.signIn}
          </h2>
          <p className="muted" style={{ marginTop: 4, marginBottom: 20, fontSize: 14 }}>
            {t.welcomeBack}
          </p>

          <GoogleSignInButton
            label={`${t.signInWith} ${t.google}`}
            onClick={handleGoogleLogin}
            disabled={loading}
          />

          <div style={s.divider}>
            <span style={s.dividerLine} />
            <span style={s.dividerText}>{t.orContinueWith}</span>
            <span style={s.dividerLine} />
          </div>

          <div className="field">
            <label>{t.email}</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              autoComplete="email" placeholder="you@example.com" required />
          </div>
          <div className="field">
            <label>{t.password}</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              autoComplete="current-password" placeholder="••••••••" required />
          </div>

          {err && <div style={s.err}>{err}</div>}

          <button className="btn btn-primary btn-block" disabled={loading} type="submit">
            {loading ? <span className="spinner" /> : `${t.signIn} →`}
          </button>

          <p style={{ marginTop: 18, fontSize: 13, color: '#64748b', textAlign: 'center' }}>
            <Link to="/reset-password" style={{ color: '#1e6bff', fontWeight: 600 }}>
              {t.forgotPassword}
            </Link>
          </p>
          <p style={{ marginTop: 6, fontSize: 13, color: '#64748b', textAlign: 'center' }}>
            {t.noAccount}{' '}
            <Link to="/register" style={{ color: '#1e6bff', fontWeight: 600 }}>
              {t.registerHere}
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}

const s = {
  wrap: { minHeight: '100vh', display: 'grid', gridTemplateColumns: '1.1fr 1fr', position: 'relative' },
  left: {
    background: 'linear-gradient(180deg, #1e6bff 0%, #0b3d91 100%)',
    color: '#fff', padding: '60px 56px', display: 'flex', flexDirection: 'column', justifyContent: 'center',
  },
  brand: { display: 'flex', alignItems: 'center', gap: 12, fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: 800, fontSize: 22, marginBottom: 30 },
  logo: { width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg, #4f8eff, #34d399)', display: 'grid', placeItems: 'center', fontWeight: 800 },
  h2: { fontFamily: 'Plus Jakarta Sans, sans-serif', fontSize: 36, fontWeight: 800, lineHeight: 1.1, margin: 0, letterSpacing: '-.02em' },
  lead: { color: '#cfe1ff', fontSize: 15.5, lineHeight: 1.6, marginTop: 14, maxWidth: 480 },
  list: { color: '#dbeafe', fontSize: 14.5, marginTop: 28, listStyle: 'none', padding: 0, lineHeight: 2.2 },
  right: { display: 'grid', placeItems: 'center', padding: 24, background: '#f5f8fc' },
  form: { width: '100%', maxWidth: 380, padding: 32 },
  err: { background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', padding: '10px 12px', borderRadius: 10, fontSize: 13, marginBottom: 14 },
  divider: { display: 'flex', alignItems: 'center', gap: 10, margin: '16px 0' },
  dividerLine: { flex: 1, height: 1, background: '#e2e8f0' },
  dividerText: { fontSize: 12, color: '#94a3b8', whiteSpace: 'nowrap' },
  langSwitcher: { position: 'absolute', top: 16, right: 20, zIndex: 200 },
  langBtn: {
    display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px',
    background: 'rgba(255,255,255,.15)', border: '1px solid rgba(255,255,255,.25)',
    borderRadius: 20, cursor: 'pointer', color: '#fff', backdropFilter: 'blur(6px)',
  },
  langDropdown: {
    position: 'absolute', top: '110%', right: 0,
    background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 14,
    boxShadow: '0 12px 40px rgba(0,0,0,.15)', width: 240, overflow: 'hidden', zIndex: 300,
  },
  langSearch: {
    width: '100%', padding: '10px 14px', border: 'none', borderBottom: '1px solid #f1f5f9',
    outline: 'none', fontSize: 13, boxSizing: 'border-box', fontFamily: 'inherit',
  },
  langList: { maxHeight: 280, overflowY: 'auto' },
  langItem: {
    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
    padding: '9px 14px', border: 'none', background: 'none', cursor: 'pointer',
    fontSize: 13, color: '#0f172a', textAlign: 'left',
  },
  langItemActive: { background: '#eff6ff', color: '#1e6bff', fontWeight: 600 },
  backdrop: { position: 'fixed', inset: 0, zIndex: 199 },
};
