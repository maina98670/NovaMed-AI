import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../services/api';

export default function ResetPassword() {
  const nav = useNavigate();
  const [step, setStep] = useState(1);   // 1 = email, 2 = otp + new pwd
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [demoCode, setDemoCode] = useState('');
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  const requestCode = async (e) => {
    e.preventDefault();
    setErr(''); setInfo('');
    setLoading(true);
    try {
      const r = await api.post('/api/auth/reset/request', { email: email.trim().toLowerCase() });
      setInfo(r.message || 'Reset code generated.');
      if (r.code) setDemoCode(r.code);
      setStep(2);
    } catch (e) {
      setErr(e.message || 'Could not generate code');
    } finally { setLoading(false); }
  };

  const submitReset = async (e) => {
    e.preventDefault();
    setErr('');
    if (!/^\d{6}$/.test(otp)) return setErr('Enter the 6-digit code.');
    if (newPassword.length < 6) return setErr('Password must be at least 6 characters.');
    if (newPassword !== confirm) return setErr('Passwords do not match.');
    setLoading(true);
    try {
      await api.post('/api/auth/reset/confirm', {
        email: email.trim().toLowerCase(),
        otp, newPassword,
      });
      setInfo('Password updated! Redirecting to sign-in…');
      setTimeout(() => nav('/login'), 1200);
    } catch (e) {
      setErr(e.message || 'Reset failed');
    } finally { setLoading(false); }
  };

  return (
    <div style={s.wrap}>
      <div style={s.left}>
        <div style={s.brand}>
          <div style={s.logo}>N+</div>
          <span>NovaMed AI</span>
        </div>
        <h2 style={s.h2}>Reset your password.</h2>
        <p style={s.lead}>
          Enter your registered email and we'll generate a 6-digit verification
          code stored securely in the database. Use it to set a new password.
        </p>
      </div>

      <div style={s.right}>
        <form className="card" style={s.form} onSubmit={step === 1 ? requestCode : submitReset}>
          <h2 style={{ margin: 0, fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
            {step === 1 ? 'Forgot password' : 'Set new password'}
          </h2>
          <p className="muted" style={{ marginTop: 4, marginBottom: 18, fontSize: 14 }}>
            {step === 1 ? 'Step 1 of 2 — verify your email.' : 'Step 2 of 2 — enter your code and new password.'}
          </p>

          {step === 1 && (
            <div className="field">
              <label>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
            </div>
          )}

          {step === 2 && (
            <>
              {demoCode && (
                <div style={s.codeBox}>
                  <div style={{ fontSize: 11, opacity: .9, letterSpacing: '.1em', textTransform: 'uppercase' }}>Reset code</div>
                  <div style={s.codeDigits}>{demoCode}</div>
                  <div style={{ fontSize: 12, opacity: .85 }}>Stored hashed in DB · valid for 10 minutes.</div>
                </div>
              )}
              <div className="field">
                <label>6-digit code</label>
                <input
                  value={otp}
                  onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric"
                  required
                  style={{ letterSpacing: '.5em', fontFamily: 'monospace', fontSize: 18, textAlign: 'center' }}
                />
              </div>
              <div className="field">
                <label>New password</label>
                <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required />
              </div>
              <div className="field">
                <label>Confirm new password</label>
                <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required />
              </div>
              <button type="button" className="btn btn-ghost btn-block" style={{ marginBottom: 10 }} onClick={() => setStep(1)}>
                ← Use a different email
              </button>
            </>
          )}

          {err && <div style={s.err}>{err}</div>}
          {info && !err && <div style={s.info}>{info}</div>}

          <button className="btn btn-primary btn-block" type="submit" disabled={loading}>
            {loading ? <span className="spinner" /> : (step === 1 ? 'Send reset code →' : 'Update password →')}
          </button>

          <p style={{ marginTop: 18, fontSize: 13, color: '#64748b', textAlign: 'center' }}>
            <Link to="/login" style={{ color: '#1e6bff', fontWeight: 600 }}>← Back to sign in</Link>
          </p>
        </form>
      </div>
    </div>
  );
}

const s = {
  wrap:  { minHeight: '100vh', display: 'grid', gridTemplateColumns: '1.1fr 1fr' },
  left:  { background: 'linear-gradient(180deg, #1e6bff 0%, #0b3d91 100%)', color: '#fff', padding: '60px 56px', display: 'flex', flexDirection: 'column', justifyContent: 'center' },
  brand: { display: 'flex', alignItems: 'center', gap: 12, fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: 800, fontSize: 22, marginBottom: 30 },
  logo:  { width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg, #4f8eff, #34d399)', display: 'grid', placeItems: 'center', fontWeight: 800 },
  h2:    { fontFamily: 'Plus Jakarta Sans, sans-serif', fontSize: 36, fontWeight: 800, lineHeight: 1.1, margin: 0, letterSpacing: '-.02em' },
  lead:  { color: '#cfe1ff', fontSize: 15.5, lineHeight: 1.6, marginTop: 14, maxWidth: 480 },
  right: { display: 'grid', placeItems: 'center', padding: 24, background: '#f5f8fc', overflowY: 'auto' },
  form:  { width: '100%', maxWidth: 440, padding: 32, margin: '24px 0' },
  err:   { background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', padding: '10px 12px', borderRadius: 10, fontSize: 13, marginBottom: 14 },
  info:  { background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0', padding: '10px 12px', borderRadius: 10, fontSize: 13, marginBottom: 14 },
  codeBox: { background: 'linear-gradient(135deg, #1e6bff, #0b3d91)', color: '#fff', padding: 14, borderRadius: 12, marginBottom: 14, textAlign: 'center' },
  codeDigits: { fontSize: 28, fontFamily: 'monospace', fontWeight: 700, letterSpacing: '.4em', margin: '6px 0' },
};
