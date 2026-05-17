import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useToast } from '../utils/useToast';

export default function PatientNew() {
  const nav = useNavigate();
  const { show, node } = useToast();

  const [f, setF] = useState({
    full_name: '', date_of_birth: '', sex: '',
    phone: '', email: '', national_id: '',
    address: '', blood_group: '',
    allergies: '', chronic_conditions: '',
    next_of_kin: '', next_of_kin_phone: '',
    sha_member_no: '', nhif_no: '', scheme_type: 'SHA',
    insurance_provider: '', insurance_policy_no: '', insurance_member_name: '',
  });
  const [busy, setBusy] = useState(false);

  const set = (k, v) => setF(s => ({ ...s, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!f.full_name.trim()) { show('Full name is required', 'err'); return; }
    setBusy(true);
    try {
      const r = await api.post('/api/patients', f);
      show(`Patient registered: ${r.patient.patient_id}`);
      nav(`/patients/${r.patient.id}`);
    } catch (e) {
      show(e.message || 'Failed to register', 'err');
    } finally { setBusy(false); }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Register patient</h1>
          <p>A unique Patient ID will be generated automatically.</p>
        </div>
      </div>

      <form className="card" onSubmit={submit}>
        <h3 className="card-title">Personal details</h3>
        <div className="row-2">
          <div className="field"><label>Full name *</label>
            <input value={f.full_name} onChange={e => set('full_name', e.target.value)} required /></div>
          <div className="field"><label>Date of birth</label>
            <input type="date" value={f.date_of_birth} onChange={e => set('date_of_birth', e.target.value)} /></div>
        </div>

        <div className="row-3">
          <div className="field"><label>Sex</label>
            <select value={f.sex} onChange={e => set('sex', e.target.value)}>
              <option value="">—</option>
              <option>Male</option>
              <option>Female</option>
              <option>Other</option>
            </select>
          </div>
          <div className="field"><label>Blood group</label>
            <select value={f.blood_group} onChange={e => set('blood_group', e.target.value)}>
              <option value="">—</option>
              {['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(b => <option key={b}>{b}</option>)}
            </select>
          </div>
          <div className="field"><label>National ID</label>
            <input value={f.national_id} onChange={e => set('national_id', e.target.value)} /></div>
        </div>

        <div className="row-2">
          <div className="field"><label>Phone</label>
            <input value={f.phone} onChange={e => set('phone', e.target.value)} /></div>
          <div className="field"><label>Email</label>
            <input type="email" value={f.email} onChange={e => set('email', e.target.value)} /></div>
        </div>

        <div className="field"><label>Address</label>
          <textarea value={f.address} onChange={e => set('address', e.target.value)} /></div>

        <hr className="hr" />
        <h3 className="card-title">Medical background</h3>
        <div className="row-2">
          <div className="field"><label>Known allergies</label>
            <textarea placeholder="e.g. Penicillin → rash" value={f.allergies} onChange={e => set('allergies', e.target.value)} /></div>
          <div className="field"><label>Chronic conditions</label>
            <textarea placeholder="e.g. Type-2 diabetes, hypertension" value={f.chronic_conditions} onChange={e => set('chronic_conditions', e.target.value)} /></div>
        </div>

        <hr className="hr" />
        <h3 className="card-title">Payment Method / Insurance</h3>
        <div className="row-3">
          <div className="field">
            <label>Payment Method *</label>
            <select value={f.scheme_type} onChange={e => set('scheme_type', e.target.value)}>
              <option value="SHA">SHA (Social Health Authority)</option>
              <option value="NHIF">NHIF (legacy)</option>
              <option value="PRIVATE">Private Insurance</option>
              <option value="CASH">Cash / Self-pay</option>
            </select>
          </div>
          {(f.scheme_type === 'SHA') && (
            <div className="field">
              <label>SHA Member Number</label>
              <input
                placeholder="e.g. SHA-1234567"
                value={f.sha_member_no}
                onChange={e => set('sha_member_no', e.target.value)}
              />
            </div>
          )}
          {(f.scheme_type === 'NHIF') && (
            <div className="field">
              <label>NHIF Number (legacy)</label>
              <input
                placeholder="e.g. 0012345678"
                value={f.nhif_no}
                onChange={e => set('nhif_no', e.target.value)}
              />
            </div>
          )}
        </div>

        {f.scheme_type === 'PRIVATE' && (
          <div className="row-3">
            <div className="field">
              <label>Insurance Provider *</label>
              <select value={f.insurance_provider} onChange={e => set('insurance_provider', e.target.value)}>
                <option value="">— Select provider —</option>
                <option value="AAR">AAR Insurance</option>
                <option value="JUBILEE">Jubilee Insurance</option>
                <option value="CIC">CIC Insurance</option>
                <option value="BRITAM">Britam Insurance</option>
                <option value="APA">APA Insurance</option>
                <option value="MADISON">Madison Insurance</option>
                <option value="RESOLUTION">Resolution Insurance</option>
                <option value="HERITAGE">Heritage Insurance</option>
                <option value="GA">GA Insurance</option>
                <option value="SANLAM">Sanlam Insurance</option>
                <option value="PACIS">Pacis Insurance</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div className="field">
              <label>Policy / Member Number</label>
              <input
                placeholder="e.g. JUB-00123456"
                value={f.insurance_policy_no}
                onChange={e => set('insurance_policy_no', e.target.value)}
              />
            </div>
            <div className="field">
              <label>Member Name on Policy</label>
              <input
                placeholder="Name as on insurance card"
                value={f.insurance_member_name}
                onChange={e => set('insurance_member_name', e.target.value)}
              />
            </div>
          </div>
        )}

        <hr className="hr" />
        <h3 className="card-title">Next of kin</h3>
        <div className="row-2">
          <div className="field"><label>Name</label>
            <input value={f.next_of_kin} onChange={e => set('next_of_kin', e.target.value)} /></div>
          <div className="field"><label>Phone</label>
            <input value={f.next_of_kin_phone} onChange={e => set('next_of_kin_phone', e.target.value)} /></div>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
          <button type="button" className="btn btn-ghost" onClick={() => nav(-1)}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? <span className="spinner" /> : 'Register patient'}
          </button>
        </div>
      </form>

      {node}
    </>
  );
}
