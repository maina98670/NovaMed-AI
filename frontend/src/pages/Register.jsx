import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';

const ROLES = ['doctor', 'nurse', 'clinician'];     // admin NOT shown
const SPECIALTIES = [
  'General Practice', 'Internal Medicine', 'Pediatrics', 'Obstetrics & Gynaecology',
  'Surgery', 'Orthopaedics', 'Cardiology', 'Neurology', 'Psychiatry', 'Radiology',
  'Anaesthesiology', 'Emergency Medicine', 'Ophthalmology', 'ENT', 'Dermatology',
  'Urology', 'Oncology', 'Pathology', 'Other',
];

export default function Register() {
  const { login } = useAuth();
  const nav = useNavigate();

  const [step, setStep] = useState(1);   // 1 = details, 2 = otp + password
  const [form, setForm] = useState({
    full_name: '', email: '', password: '', confirm: '',
    role: 'doctor', specialty: '', otp: '',
  });
  const [demoCode, setDemoCode] = useState('');   // shown when OTP_VISIBLE=true
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  /* Step 1: validate, request OTP, advance to step 2 */
  const requestOtp = async (e) => {
    e.preventDefault();
    setErr(''); setInfo('');
    if (!form.full_name.trim()) return setErr('Please enter your full name.');
    if (!ROLES.includes(form.role)) return setErr('Please choose a role.');
    if (form.password.length < 6) return setErr('Password must be at least 6 characters.');
    if (form.password !== form.confirm) return setErr('Passwords do not match.');

    setLoading(true);
    try {
      const r = await api.post('/api/auth/otp/request', { email: form.email.trim().toLowerCase() });
      setInfo(r.message || 'Verification code generated.');
      if (r.code) setDemoCode(r.code);    // dev/demo display
      setStep(2);
    } catch (e) {
      setErr(e.message || 'Could not generate code');
    } finally {
      setLoading(false);
    }
  };

  /* Step 2: submit OTP + everything else, log in immediately */
  const submitFinal = async (e) => {
    e.preventDefault();
    setErr('');
    if (!/^\d{6}$/.test(form.otp)) return setErr('Enter the 6-digit code.');
    setLoading(true);
    try {
      await api.post('/api/auth/register', {
        full_name: form.full_name.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        role: form.role,
        specialty: form.specialty || null,
        otp: form.otp,
      });
      await login(form.email.trim().toLowerCase(), form.password);
      nav('/dashboard');
    } catch (e) {
      setErr(e.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={s.wrap}>
      <div style={s.left}>
        <div style={s.brand}>
          <div style={s.logo}>N+</div>
          <span>NovaMed AI</span>
        </div>
        <h2 style={s.h2}>Join NovaMed AI today.</h2>
        <p style={s.lead}>
          Secure clinical decision support for nurses, doctors and clinicians —
          adaptive history, smart diagnosis, automated treatment plans.
        </p>
        <ul style={s.list}>
          <li>🩺 Adaptive history-taking with smart follow-ups</li>
          <li>🧠 AI-powered differential diagnosis</li>
          <li>🩻 Reads X-rays, ECGs and lab reports</li>
          <li>⚠️ Auto-flags abnormal vitals and findings</li>
          <li>📄 One-click clinical PDF summaries</li>
        </ul>
      </div>

      <div style={s.right}>
        <form
          className="card"
          style={s.form}
          onSubmit={step === 1 ? requestOtp : submitFinal}
        >
          <h2 style={{ margin: 0, fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
            {step === 1 ? 'Create your account' : 'Verify your email'}
          </h2>
          <p className="muted" style={{ marginTop: 4, marginBottom: 18, fontSize: 14 }}>
            {step === 1
              ? 'Step 1 of 2 — your details.'
              : `Step 2 of 2 — enter the 6-digit code we generated for ${form.email}.`}
          </p>

          {step === 1 && (
            <>
              <div className="field">
                <label>Full name</label>
                <input value={form.full_name} onChange={set('full_name')} placeholder="Dr. Jane Doe" autoComplete="name" required />
              </div>
              <div className="field">
                <label>Email</label>
                <input type="email" value={form.email} onChange={set('email')} placeholder="you@hospital.org" autoComplete="email" required />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="field">
                  <label>Role</label>
                  <select value={form.role} onChange={set('role')} required style={s.select}>
                    {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Specialty <span style={{ color: '#94a3b8' }}>(optional)</span></label>
                  <select value={form.specialty} onChange={set('specialty')} style={s.select}>
                    <option value="">— select —</option>
                    {SPECIALTIES.map(sp => <option key={sp} value={sp}>{sp}</option>)}
                  </select>
                </div>
              </div>
              <div className="field">
                <label>Password</label>
                <input type="password" value={form.password} onChange={set('password')} placeholder="Min. 6 characters" autoComplete="new-password" required />
              </div>
              <div className="field">
                <label>Confirm password</label>
                <input type="password" value={form.confirm} onChange={set('confirm')} placeholder="Repeat your password" autoComplete="new-password" required />
              </div>
            </>
          )}

          {step === 2 && (
            <>
              {demoCode && (
                <div style={s.codeBox}>
                  <div style={{ fontSize: 11, opacity: .9, letterSpacing: '.1em', textTransform: 'uppercase' }}>Verification code</div>
                  <div style={s.codeDigits}>{demoCode}</div>
                  <div style={{ fontSize: 12, opacity: .85 }}>Codes are stored hashed in the database, valid for 10 minutes.</div>
                </div>
              )}

              <div className="field">
                <label>6-digit code</label>
                <input
                  value={form.otp}
                  onChange={(e) => setForm(f => ({ ...f, otp: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
                  placeholder="123456"
                  inputMode="numeric"
                  pattern="\d{6}"
                  required
                  style={{ letterSpacing: '.5em', fontFamily: 'monospace', fontSize: 18, textAlign: 'center' }}
                />
              </div>

              <button
                type="button"
                className="btn btn-ghost btn-block"
                style={{ marginBottom: 10 }}
                onClick={() => setStep(1)}
              >
                ← Back to details
              </button>
            </>
          )}

          {err && <div style={s.err}>{err}</div>}
          {info && !err && <div style={s.info}>{info}</div>}

          <button className="btn btn-primary btn-block" disabled={loading} type="submit">
            {loading ? <span className="spinner" /> : (step === 1 ? 'Send verification code →' : 'Create account →')}
          </button>

          <p style={{ marginTop: 18, fontSize: 13, color: '#64748b', textAlign: 'center' }}>
            Already have an account?{' '}
            <Link to="/login" style={{ color: '#1e6bff', fontWeight: 600 }}>Sign in</Link>
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
  list:  { color: '#dbeafe', fontSize: 14.5, marginTop: 28, listStyle: 'none', padding: 0, lineHeight: 2.2 },
  right: { display: 'grid', placeItems: 'center', padding: 24, background: '#f5f8fc', overflowY: 'auto' },
  form:  { width: '100%', maxWidth: 440, padding: 32, margin: '24px 0' },
  err:   { background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', padding: '10px 12px', borderRadius: 10, fontSize: 13, marginBottom: 14 },
  info:  { background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0', padding: '10px 12px', borderRadius: 10, fontSize: 13, marginBottom: 14 },
  select:{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 14, background: '#fff', color: '#0f172a' },
  codeBox: { background: 'linear-gradient(135deg, #1e6bff, #0b3d91)', color: '#fff', padding: 14, borderRadius: 12, marginBottom: 14, textAlign: 'center' },
  codeDigits: { fontSize: 28, fontFamily: 'monospace', fontWeight: 700, letterSpacing: '.4em', margin: '6px 0' },
};
