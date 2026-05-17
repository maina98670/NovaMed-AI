/**
 * GoogleCallback.jsx
 * ==================
 * Handles the redirect from the backend after Google OAuth.
 *
 * The backend redirects to:
 *   /auth/google/callback#token=<jwt>       ← success
 *   /login?error=google_denied              ← user cancelled
 *   /login?error=account_disabled           ← banned account
 *
 * This page reads the token from the URL hash, stores it, and navigates
 * to /dashboard. No sensitive data is in query params (hash is never
 * sent to the server).
 */

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function GoogleCallback() {
  const navigate  = useNavigate();
  const { loginWithToken } = useAuth();

  useEffect(() => {
    const hash   = window.location.hash;          // e.g. "#token=eyJ..."
    const params = new URLSearchParams(hash.slice(1)); // strip leading '#'
    const token  = params.get('token');

    if (token) {
      loginWithToken(token)
        .then(() => navigate('/dashboard', { replace: true }))
        .catch(() => navigate('/login?error=google_auth_failed', { replace: true }));
    } else {
      navigate('/login?error=google_no_token', { replace: true });
    }
  }, []);

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', flexDirection: 'column', gap: 16,
      background: '#f5f8fc',
    }}>
      <div style={{
        width: 48, height: 48, border: '4px solid #e2e8f0',
        borderTopColor: '#1e6bff', borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <p style={{ color: '#64748b', fontSize: 14 }}>Signing you in with Google…</p>
    </div>
  );
}
