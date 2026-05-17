/**
 * GoogleSignInButton
 *
 * ── SETUP ──────────────────────────────────────────────────────────────
 * 1. Go to https://console.cloud.google.com/
 * 2. Create a project → APIs & Services → Credentials
 * 3. Click "Create Credentials" → "OAuth 2.0 Client ID" → Web application
 * 4. Under "Authorised JavaScript origins" add:
 *      http://localhost:5173        (Vite dev)
 *      https://yourdomain.com       (production)
 * 5. Under "Authorised redirect URIs" add:
 *      http://localhost:4000/api/auth/google/callback   (dev)
 *      https://yourdomain.com/api/auth/google/callback  (prod)
 * 6. Copy the Client ID → paste into frontend/.env as VITE_GOOGLE_CLIENT_ID
 * 7. Copy the Client Secret → paste into backend/.env as GOOGLE_CLIENT_SECRET
 *
 * ── HOW IT WORKS ───────────────────────────────────────────────────────
 * Clicking the button redirects the browser to Google's consent screen.
 * Google then redirects back to your backend callback URL with a code.
 * Your backend exchanges the code for a token, creates/finds the user,
 * and returns a JWT — same as normal login.
 *
 * ── ALTERNATIVE: Firebase / Supabase ───────────────────────────────────
 * If you use Firebase Auth instead of a custom backend OAuth flow, replace
 * the onClick handler with:
 *
 *   import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
 *   const result = await signInWithPopup(auth, new GoogleAuthProvider());
 *   const idToken = await result.user.getIdToken();
 *   await api.post('/api/auth/google', { idToken });   // verify on backend
 */

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

export default function GoogleSignInButton({ label = 'Continue with Google', disabled, onClick }) {
  const handleClick = () => {
    // If a parent onClick is provided (Login.jsx passes one), use it.
    // Otherwise fall back to the direct backend redirect.
    if (onClick) { onClick(); return; }

    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000';
    window.location.href = `${apiUrl}/api/auth/google`;
  };

  return (
    <button
      type="button"
      style={s.btn}
      onClick={handleClick}
      disabled={disabled}
      className="google-btn"
    >
      <style>{css}</style>
      {/* Official Google "G" logo SVG */}
      <svg width="18" height="18" viewBox="0 0 18 18" style={{ flexShrink: 0 }}>
        <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
        <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
        <path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"/>
        <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z"/>
      </svg>
      <span style={s.label}>{label}</span>
    </button>
  );
}

const css = `
  .google-btn { transition: box-shadow .18s, background .18s; }
  .google-btn:hover:not(:disabled) {
    background: #f8fafc !important;
    box-shadow: 0 2px 8px rgba(0,0,0,.12) !important;
  }
  .google-btn:active:not(:disabled) { background: #f1f5f9 !important; }
`;

const s = {
  btn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
    width: '100%', padding: '10px 16px',
    background: '#fff', border: '1.5px solid #e2e8f0',
    borderRadius: 10, cursor: 'pointer',
    fontSize: 14, fontWeight: 600, color: '#1e293b',
    fontFamily: 'inherit',
    boxShadow: '0 1px 3px rgba(0,0,0,.07)',
  },
  label: { letterSpacing: '.01em' },
};
