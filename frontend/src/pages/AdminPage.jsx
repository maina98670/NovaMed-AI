import React, { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useLang, LANGUAGES } from '../context/LanguageContext';
import GoogleSignInButton from '../components/GoogleSignInButton';

const fmt     = d => d ? new Date(d).toLocaleString()    : '—';
const fmtDate = d => d ? new Date(d).toLocaleDateString() : '—';

/* ──────────────────────────────────────────────────────────
   ROOT COMPONENT
────────────────────────────────────────────────────────── */
export default function AdminPage() {
  const { user, logout, login: authLogin } = useAuth();
  const { t, lang, setLang, currentLang } = useLang();
  const [tab,   setTab]   = useState('users');
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [audit, setAudit] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast,   setToast]   = useState({ msg: '', type: 'ok' });

  /* admin login panel state */
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPass,  setAdminPass]  = useState('');
  const [adminErr,   setAdminErr]   = useState('');
  const [adminLoading, setAdminLoading] = useState(false);
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [langSearch,   setLangSearch]   = useState('');

  /* medical knowledge state */
  const [mkTab,     setMkTab]     = useState('diseases');
  const [diseases,  setDiseases]  = useState([]);
  const [symptoms,  setSymptoms]  = useState([]);
  const [questions, setQuestions] = useState([]);
  const [synonyms,  setSynonyms]  = useState([]);
  const [mkLoading, setMkLoading] = useState(false);

  /* epidemiology state */
  const [epiOverview,    setEpiOverview]    = useState(null);
  const [epiDiagnoses,   setEpiDiagnoses]   = useState([]);
  const [epiTrends,      setEpiTrends]      = useState([]);
  const [epiCategories,  setEpiCategories]  = useState([]);
  const [epiAlerts,      setEpiAlerts]      = useState(null);
  const [epiDoctors,     setEpiDoctors]     = useState([]);
  const [epiLoading,     setEpiLoading]     = useState(false);
  const [epiDays,        setEpiDays]        = useState(30);

  /* facility & tariffs state */
  const [facility, setFacility] = useState({});
  const [tariffs,  setTariffs]  = useState([]);
  const [facLoading,  setFacLoading]  = useState(false);
  const [tarLoading,  setTarLoading]  = useState(false);

  /* SHA schedule (from uploaded sha_tariffs.sql) */
  const [shaPackages,   setShaPackages]   = useState([]);
  const [shaItems,      setShaItems]      = useState([]);
  const [shaSurgical,   setShaSurgical]   = useState([]);
  const [shaSpecialties, setShaSpecialties] = useState([]);
  const [shaScheduleLoaded, setShaScheduleLoaded] = useState(false);

  const loadFacility = async () => {
    setFacLoading(true);
    try {
      const r = await api.get('/api/admin/facility');
      setFacility(r.facility || {});
    } catch (e) { notify(e.message, 'err'); }
    finally { setFacLoading(false); }
  };

  const loadTariffs = async () => {
    setTarLoading(true);
    try {
      const r = await api.get('/api/admin/tariffs');
      setTariffs(r.tariffs || []);
    } catch (e) { notify(e.message, 'err'); }
    finally { setTarLoading(false); }
  };

  const loadShaSchedule = async () => {
    try {
      const [pkgs, surg] = await Promise.all([
        api.get('/api/admin/sha-schedule/packages'),
        api.get('/api/admin/sha-schedule/surgical'),
      ]);
      setShaPackages(pkgs.packages || []);
      setShaSurgical(surg.procedures || []);
      setShaSpecialties(surg.specialties || []);
      // Load first batch of items
      const items = await api.get('/api/admin/sha-schedule/items?limit=200');
      setShaItems(items.items || []);
      setShaScheduleLoaded(true);
    } catch (e) { /* schedule tables may not exist yet */ setShaScheduleLoaded(true); }
  };

  /* modals */
  const [modal,      setModal]      = useState(null);   // { type, data? }
  const [viewDisease, setViewDisease] = useState(null); // disease detail

  const notify = (msg, type = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg: '', type: 'ok' }), 4000);
  };

  /* ── load core data ── */
  const loadCore = async () => {
    setLoading(true);
    try {
      const [u, s, a] = await Promise.all([
        api.get('/api/admin/users'),
        api.get('/api/admin/stats'),
        api.get('/api/admin/audit'),
      ]);
      setUsers(u.users || []);
      setStats(s.stats || null);
      setAudit(a.log   || []);
    } catch (e) { notify(e.message, 'err'); }
    finally { setLoading(false); }
  };

  /* ── load medical knowledge ── */
  const loadMK = async (section = 'all') => {
    setMkLoading(true);
    try {
      if (section === 'diseases' || section === 'all') {
        const r = await api.get('/api/admin/mk/diseases');
        setDiseases(r.diseases || []);
      }
      if (section === 'symptoms' || section === 'all') {
        const r = await api.get('/api/admin/mk/symptoms');
        setSymptoms(r.symptoms || []);
      }
      if (section === 'questions' || section === 'all') {
        const r = await api.get('/api/admin/mk/questions');
        setQuestions(r.questions || []);
      }
      if (section === 'synonyms' || section === 'all') {
        const r = await api.get('/api/admin/mk/synonyms');
        setSynonyms(r.synonyms || []);
      }
      /* also refresh stats so KB count badges update */
      const s = await api.get('/api/admin/stats');
      setStats(s.stats || null);
    } catch (e) { notify(e.message, 'err'); }
    finally { setMkLoading(false); }
  };

  const loadEpi = async (days = epiDays) => {
    setEpiLoading(true);
    try {
      const [ov, dx, tr, cat, al, doc] = await Promise.all([
        api.get('/api/admin/epidemiology/overview'),
        api.get(`/api/admin/epidemiology/top-diagnoses?days=${days}&limit=500`),
        api.get(`/api/admin/epidemiology/trends?days=${days}`),
        api.get(`/api/admin/epidemiology/category-breakdown?days=${days}`),
        api.get('/api/admin/epidemiology/alerts'),
        api.get(`/api/admin/epidemiology/by-doctor?days=${days}`),
      ]);
      setEpiOverview(ov.overview || null);
      setEpiDiagnoses(dx.diagnoses || []);
      setEpiTrends(tr.trends || []);
      setEpiCategories(cat.categories || []);
      setEpiAlerts(al || null);
      setEpiDoctors(doc.doctors || []);
    } catch (e) { notify(e.message, 'err'); }
    finally { setEpiLoading(false); }
  };

  useEffect(() => { loadCore(); }, []);
  useEffect(() => { if (tab === 'medical')  loadMK('all'); }, [tab]);
  useEffect(() => { if (tab === 'facility') loadFacility(); }, [tab]);
  useEffect(() => { if (tab === 'tariffs')  { loadTariffs(); loadShaSchedule(); } }, [tab]);
  useEffect(() => { if (tab === 'epi')      loadEpi(epiDays); }, [tab]);

  /* access guard — show admin login screen if not authenticated as admin */
  if (!user || user?.role !== 'admin') {
    const handleAdminLogin = async (e) => {
      e.preventDefault();
      setAdminErr(''); setAdminLoading(true);
      try {
        const u = await authLogin(adminEmail.trim().toLowerCase(), adminPass);
        if (u?.role !== 'admin') {
          setAdminErr('This account does not have administrator privileges.');
        }
      } catch (err) {
        setAdminErr(err.message || 'Login failed');
      } finally {
        setAdminLoading(false);
      }
    };

    const handleGoogleAdmin = async () => {
      alert('Google OAuth: connect your provider (see GoogleSignInButton.jsx for instructions).');
    };

    const filteredLangs = LANGUAGES.filter(l =>
      l.name.toLowerCase().includes(langSearch.toLowerCase()) ||
      l.nativeName.toLowerCase().includes(langSearch.toLowerCase())
    );

    return (
      <div style={adminLoginS.wrap}>
        {/* Lang switcher */}
        <div style={adminLoginS.langSwitcher}>
          <button style={adminLoginS.langBtn} onClick={() => setShowLangMenu(p => !p)}>
            <span>{currentLang.flag}</span>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{currentLang.nativeName}</span>
            <span style={{ fontSize: 10, opacity: .6 }}>▾</span>
          </button>
          {showLangMenu && (
            <>
              <div style={adminLoginS.backdrop} onClick={() => setShowLangMenu(false)} />
              <div style={adminLoginS.langDropdown}>
                <input style={adminLoginS.langSearch} placeholder="Search…"
                  value={langSearch} onChange={e => setLangSearch(e.target.value)} autoFocus />
                <div style={adminLoginS.langList}>
                  {filteredLangs.map(l => (
                    <button key={l.code}
                      style={{ ...adminLoginS.langItem, ...(l.code === lang ? adminLoginS.langItemActive : {}) }}
                      onClick={() => { setLang(l.code); setShowLangMenu(false); setLangSearch(''); }}>
                      <span>{l.flag}</span><span>{l.nativeName}</span>
                      <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 'auto' }}>{l.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <form style={adminLoginS.card} onSubmit={handleAdminLogin}>
          <div style={adminLoginS.shieldWrap}>
            <div style={adminLoginS.shield}>🛡️</div>
          </div>
          <h2 style={adminLoginS.title}>{t.adminConsole || 'Admin Console'}</h2>
          <p style={adminLoginS.sub}>{t.adminWelcome || 'Administrator access. Please sign in.'}</p>

          <GoogleSignInButton
            label={`${t.signInWith || 'Sign in with'} ${t.google || 'Google'}`}
            onClick={handleGoogleAdmin}
            disabled={adminLoading}
          />
          <div style={adminLoginS.divider}>
            <span style={adminLoginS.divLine}/><span style={adminLoginS.divTxt}>{t.orContinueWith || 'or continue with'}</span><span style={adminLoginS.divLine}/>
          </div>

          <div className="field">
            <label>{t.email || 'Email'}</label>
            <input type="email" value={adminEmail} onChange={e => setAdminEmail(e.target.value)}
              placeholder="admin@hospital.com" required autoFocus />
          </div>
          <div className="field">
            <label>{t.password || 'Password'}</label>
            <input type="password" value={adminPass} onChange={e => setAdminPass(e.target.value)}
              placeholder="••••••••" required />
          </div>
          {adminErr && <div style={adminLoginS.err}>{adminErr}</div>}
          <button className="btn btn-primary btn-block" type="submit" disabled={adminLoading}>
            {adminLoading ? <span className="spinner"/> : (t.adminSignIn || 'Sign in to Admin')}
          </button>
          <p style={{ textAlign: 'center', marginTop: 16, fontSize: 13, color: '#64748b' }}>
            <Link to="/login" style={{ color: '#1e6bff', fontWeight: 600 }}>← Back to user login</Link>
          </p>
        </form>
      </div>
    );
  }


  const toggleUser = async (u) => {
    try {
      await api.post(`/api/admin/users/${u.id}/${u.is_active ? 'disable' : 'enable'}`);
      await loadCore();
      notify(`${u.email} ${u.is_active ? 'disabled' : 'enabled'}.`);
    } catch (e) { notify(e.message, 'err'); }
  };

  const deleteDisease = async (id) => {
    if (!confirm('Delete this disease and ALL linked keywords / investigations / treatments?')) return;
    try { await api.delete(`/api/admin/mk/diseases/${id}`); notify('Disease deleted.'); loadMK('diseases'); }
    catch (e) { notify(e.message, 'err'); }
  };
  const deleteSymptom = async (id) => {
    if (!confirm('Delete this symptom?')) return;
    try { await api.delete(`/api/admin/mk/symptoms/${id}`); notify('Symptom deleted.'); loadMK('symptoms'); }
    catch (e) { notify(e.message, 'err'); }
  };
  const deleteQuestion = async (id) => {
    if (!confirm('Delete this question?')) return;
    try { await api.delete(`/api/admin/mk/questions/${id}`); notify('Question deleted.'); loadMK('questions'); }
    catch (e) { notify(e.message, 'err'); }
  };
  const deleteSynonym = async (id) => {
    if (!confirm('Delete this synonym?')) return;
    try { await api.delete(`/api/admin/mk/synonyms/${id}`); notify('Synonym deleted.'); loadMK('synonyms'); }
    catch (e) { notify(e.message, 'err'); }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f5f8fc', padding: 24 }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:12, marginBottom:18 }}>
          <div>
            <h1 style={{ margin:0, fontFamily:'Plus Jakarta Sans,sans-serif', fontSize:28 }}>🛡️ Admin console</h1>
            <p className="muted" style={{ margin:'4px 0 0' }}>User management · Medical knowledge base · Audit log</p>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn btn-ghost" onClick={loadCore}>↻ Refresh</button>
            <button className="btn btn-danger" onClick={logout}>Sign out</button>
          </div>
        </div>

        {/* Toast */}
        {toast.msg && (
          <div className="card" style={{
            background: toast.type==='err' ? '#fef2f2' : '#ecfdf5',
            borderColor: toast.type==='err' ? '#fca5a5' : '#a7f3d0',
            color: toast.type==='err' ? '#7f1d1d' : '#065f46',
            marginBottom:14, padding:'10px 16px'
          }}>{toast.msg}</div>
        )}

        {/* Stats bar */}
        {stats && (
          <div className="stat-grid" style={{ marginBottom:18 }}>
            <div className="stat-card"><div className="ic">👥</div><div className="lbl">Users</div><div className="val">{stats.users}</div></div>
            <div className="stat-card mint"><div className="ic">✅</div><div className="lbl">Active</div><div className="val">{stats.users_active}</div></div>
            <div className="stat-card warn"><div className="ic">🚫</div><div className="lbl">Disabled</div><div className="val">{stats.users_disabled}</div></div>
            <div className="stat-card"><div className="ic">🦠</div><div className="lbl">Diseases</div><div className="val">{stats.diseases}</div></div>
            <div className="stat-card mint"><div className="ic">🩺</div><div className="lbl">Symptoms</div><div className="val">{stats.symptoms ?? '—'}</div></div>
            <div className="stat-card"><div className="ic">❓</div><div className="lbl">Questions</div><div className="val">{stats.questions ?? '—'}</div></div>
            <div className="stat-card mint"><div className="ic">🔤</div><div className="lbl">Synonyms</div><div className="val">{stats.synonyms ?? '—'}</div></div>
          </div>
        )}

        {/* Global SQL upload button */}
        <div style={{
          display:'flex', justifyContent:'flex-end', gap:8, marginBottom:12, flexWrap:'wrap'
        }}>
          <button className="btn btn-primary" style={{fontSize:13}}
            onClick={()=>setModal({type:'sqlupload', section:'database'})}>
            ⬆ Upload SQL file
          </button>
        </div>

        {/* Main tabs */}
        <div className="card" style={{ padding:0 }}>
          <div style={{ display:'flex', borderBottom:'1px solid #e2e8f0', flexWrap:'wrap' }}>
            <TabBtn active={tab==='users'}    onClick={()=>setTab('users')}>👥 Users ({users.length})</TabBtn>
            <TabBtn active={tab==='epi'}      onClick={()=>setTab('epi')}>📊 Epidemiology</TabBtn>
            <TabBtn active={tab==='medical'}  onClick={()=>setTab('medical')}>🧬 Medical Knowledge</TabBtn>
            <TabBtn active={tab==='facility'} onClick={()=>setTab('facility')}>🏥 Hospital Details</TabBtn>
            <TabBtn active={tab==='tariffs'}  onClick={()=>setTab('tariffs')}>💰 SHA Tariffs</TabBtn>
            <TabBtn active={tab==='audit'}    onClick={()=>setTab('audit')}>📋 Audit log</TabBtn>
          </div>
          <div style={{ padding:18 }}>
            {loading && tab !== 'medical' && tab !== 'facility' && tab !== 'tariffs' && tab !== 'epi'
              ? <div className="empty"><span className="spinner"/> Loading…</div>
              : tab==='users'   ? <UsersTab users={users} toggleUser={toggleUser} onResetPassword={u=>setModal({type:'resetpwd', data:u})}/>
              : tab==='epi'     ? (
                <ErrorBoundary label="Epidemiology dashboard">
                  <EpidemiologyTab
                    overview={epiOverview}
                    diagnoses={epiDiagnoses}
                    trends={epiTrends}
                    categories={epiCategories}
                    alerts={epiAlerts}
                    doctors={epiDoctors}
                    loading={epiLoading}
                    days={epiDays}
                    onChangeDays={d => { setEpiDays(d); loadEpi(d); }}
                  />
                </ErrorBoundary>
              )
              : tab==='medical' ? (
                <MedicalTab
                  mkTab={mkTab}
                  setMkTab={t => { setMkTab(t); loadMK(t); }}
                  diseases={diseases} symptoms={symptoms} questions={questions} synonyms={synonyms}
                  loading={mkLoading}
                  onAddDisease={()=>setModal({type:'disease'})}
                  onEditDisease={d=>setModal({type:'disease', data:d})}
                  onViewDisease={d=>setViewDisease(d)}
                  onDeleteDisease={deleteDisease}
                  onAddSymptom={()=>setModal({type:'symptom'})}
                  onEditSymptom={s=>setModal({type:'symptom', data:s})}
                  onDeleteSymptom={deleteSymptom}
                  onAddQuestion={()=>setModal({type:'question'})}
                  onEditQuestion={q=>setModal({type:'question', data:q})}
                  onDeleteQuestion={deleteQuestion}
                  onAddSynonym={()=>setModal({type:'synonym'})}
                  onEditSynonym={s=>setModal({type:'synonym', data:s})}
                  onDeleteSynonym={deleteSynonym}
                  onImport={section=>setModal({type:'sqlupload', section})}
                />
              )
              : tab==='facility' ? (
                <FacilityTab
                  facility={facility}
                  loading={facLoading}
                  onSave={async (data) => {
                    try {
                      const r = await api.put('/api/admin/facility', data);
                      setFacility(r.facility || data);
                      notify('Hospital details saved.');
                    } catch (e) { notify(e.message, 'err'); }
                  }}
                />
              )
              : tab==='tariffs' ? (
                <TariffsTab
                  tariffs={tariffs}
                  loading={tarLoading}
                  onAdd={async (data) => {
                    try {
                      await api.post('/api/admin/tariffs', data);
                      await loadTariffs();
                      notify('Tariff added.');
                    } catch (e) { notify(e.message, 'err'); }
                  }}
                  onEdit={async (id, data) => {
                    try {
                      await api.put(`/api/admin/tariffs/${id}`, data);
                      await loadTariffs();
                      notify('Tariff updated.');
                    } catch (e) { notify(e.message, 'err'); }
                  }}
                  onDelete={async (id) => {
                    if (!confirm('Delete this tariff override?')) return;
                    try {
                      await api.delete(`/api/admin/tariffs/${id}`);
                      await loadTariffs();
                      notify('Tariff deleted.');
                    } catch (e) { notify(e.message, 'err'); }
                  }}
                  onUploadShaSQL={() => setModal({ type:'sqlupload', section:'sha_tariffs' })}
                  onShaScheduleRefresh={loadShaSchedule}
                  shaPackages={shaPackages}
                  shaItems={shaItems}
                  shaSurgical={shaSurgical}
                  shaSpecialties={shaSpecialties}
                  shaScheduleLoaded={shaScheduleLoaded}
                />
              )
              : <AuditTab audit={audit}/>
            }
          </div>
        </div>

        <div className="card" style={{ marginTop:18, fontSize:13, color:'#64748b' }}>
          <strong>Privacy notice:</strong> Admin access is limited to user management and the medical knowledge base.
          Patient records and clinical encounter data are NOT visible here. All admin actions are audit-logged.
        </div>
      </div>

      {/* ── Modals ── */}
      {modal?.type==='disease' && (
        <DiseaseModal data={modal.data} onClose={()=>setModal(null)}
          onSaved={()=>{ setModal(null); loadMK('diseases'); notify(modal.data ? 'Disease updated.' : 'Disease added.'); }}
          notify={notify}/>
      )}
      {modal?.type==='symptom' && (
        <SymptomModal data={modal.data} onClose={()=>setModal(null)}
          onSaved={()=>{ setModal(null); loadMK('symptoms'); notify(modal.data ? 'Symptom updated.' : 'Symptom added.'); }}
          notify={notify}/>
      )}
      {modal?.type==='question' && (
        <QuestionModal data={modal.data} onClose={()=>setModal(null)}
          onSaved={()=>{ setModal(null); loadMK('questions'); notify(modal.data ? 'Question updated.' : 'Question added.'); }}
          notify={notify}/>
      )}
      {modal?.type==='synonym' && (
        <SynonymModal data={modal.data} onClose={()=>setModal(null)}
          onSaved={()=>{ setModal(null); loadMK('synonyms'); notify(modal.data ? 'Synonym updated.' : 'Synonym added.'); }}
          notify={notify}/>
      )}
      {modal?.type==='sqlupload' && (
        <SqlUploadModal section={modal.section} onClose={()=>setModal(null)}
          onImported={()=>{
            setModal(null);
            if (modal.section === 'sha_tariffs') {
              loadShaSchedule();
              notify('SHA tariff schedule uploaded successfully.');
            } else {
              loadMK('all');
            }
          }}
          notify={notify}/>
      )}
      {modal?.type==='resetpwd' && (
        <ResetPasswordModal user={modal.data} onClose={()=>setModal(null)}
          onDone={()=>setModal(null)}
          notify={notify}/>
      )}
      {viewDisease && (
        <DiseaseDetailModal disease={viewDisease} onClose={()=>setViewDisease(null)}
          notify={notify} reload={()=>loadMK('diseases')}/>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   USERS TAB
────────────────────────────────────────────────────────── */
function UsersTab({ users, toggleUser, onResetPassword }) {
  if (!users.length) return <div className="empty">No users registered yet.</div>;
  return (
    <div style={{ overflowX:'auto' }}>
      <table className="table">
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Specialty</th><th>Patients</th><th>Last login</th><th>Created</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>{users.map(u=>(
          <tr key={u.id}>
            <td><strong>{u.full_name}</strong></td>
            <td>{u.email}</td>
            <td><span className="pill pill-violet">{u.role}</span></td>
            <td>{u.specialty||'—'}</td>
            <td>{u.patients_count}</td>
            <td style={{fontSize:12}}>{fmt(u.last_login_at)}</td>
            <td style={{fontSize:12}}>{fmtDate(u.created_at)}</td>
            <td>
              <button className={'toggle-btn '+(u.is_active?'toggle-on':'toggle-off')} onClick={()=>toggleUser(u)}>
                {u.is_active ? '● Active' : '○ Disabled'}
              </button>
            </td>
            <td>
              <button className="btn btn-ghost" style={{fontSize:12,padding:'4px 10px'}}
                onClick={()=>onResetPassword(u)} title="Reset this user's password">
                🔑 Reset password
              </button>
            </td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   AUDIT TAB
────────────────────────────────────────────────────────── */
function AuditTab({ audit }) {
  if (!audit.length) return <div className="empty">No audit events recorded.</div>;
  return (
    <div style={{ overflowX:'auto' }}>
      <table className="table">
        <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Detail</th></tr></thead>
        <tbody>{audit.map(a=>(
          <tr key={a.id}>
            <td style={{fontSize:12,whiteSpace:'nowrap'}}>{fmt(a.created_at)}</td>
            <td>{a.user_name||'—'}<br/><span className="muted" style={{fontSize:11}}>{a.user_email}</span></td>
            <td><span className="pill pill-gray">{a.action}</span></td>
            <td style={{fontSize:12,fontFamily:'monospace'}}>{a.detail?JSON.stringify(a.detail):'—'}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   MEDICAL KNOWLEDGE TAB
────────────────────────────────────────────────────────── */
function MedicalTab({ mkTab, setMkTab, diseases, symptoms, questions, synonyms, loading,
  onAddDisease, onEditDisease, onViewDisease, onDeleteDisease,
  onAddSymptom, onEditSymptom, onDeleteSymptom,
  onAddQuestion, onEditQuestion, onDeleteQuestion,
  onAddSynonym, onEditSynonym, onDeleteSynonym, onImport }) {
  const [search, setSearch] = useState('');

  const sections = [
    { key:'diseases',  label:'🦠 Diseases',          count:diseases.length  },
    { key:'symptoms',  label:'🩺 Symptoms',           count:symptoms.length  },
    { key:'questions', label:'❓ History Questions',  count:questions.length },
    { key:'synonyms',  label:'🔤 Synonyms',           count:synonyms.length  },
  ];

  const q = search.toLowerCase();
  const filteredDiseases  = diseases.filter(d => !q || d.name.toLowerCase().includes(q) || (d.category||'').toLowerCase().includes(q));
  const filteredSymptoms  = symptoms.filter(s => !q || s.name.toLowerCase().includes(q) || (s.body_system||'').toLowerCase().includes(q));
  const filteredQuestions = questions.filter(x => !q || x.question.toLowerCase().includes(q) || x.section.toLowerCase().includes(q));
  const filteredSynonyms  = synonyms.filter(x => !q || (x.canonical||'').toLowerCase().includes(q) || (x.synonym||'').toLowerCase().includes(q));

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:8, marginBottom:16 }}>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
          {sections.map(s=>(
            <button key={s.key} onClick={()=>setMkTab(s.key)} style={{
              padding:'6px 14px', borderRadius:20, border:'2px solid',
              borderColor: mkTab===s.key ? '#1d4ed8' : '#e2e8f0',
              background: mkTab===s.key ? '#eff6ff' : 'white',
              color: mkTab===s.key ? '#1d4ed8' : '#64748b',
              fontWeight:600, fontSize:13, cursor:'pointer'
            }}>
              {s.label} <span style={{background:'#e2e8f0',borderRadius:10,padding:'1px 7px',fontSize:11,marginLeft:4}}>{s.count}</span>
            </button>
          ))}
        </div>
        <input placeholder="Search…" value={search} onChange={e=>setSearch(e.target.value)}
          style={{padding:'6px 12px',border:'1px solid #e2e8f0',borderRadius:8,fontSize:13,width:200}}/>
      </div>

      {loading
        ? <div className="empty"><span className="spinner"/> Loading…</div>
        : mkTab==='diseases'
          ? <DiseasesTable items={filteredDiseases}
              onAdd={onAddDisease} onEdit={onEditDisease} onView={onViewDisease}
              onDelete={onDeleteDisease} onImport={()=>onImport('diseases')}/>
          : mkTab==='symptoms'
          ? <SymptomsTable items={filteredSymptoms}
              onAdd={onAddSymptom} onEdit={onEditSymptom}
              onDelete={onDeleteSymptom} onImport={()=>onImport('symptoms')}/>
          : mkTab==='questions'
          ? <QuestionsTable items={filteredQuestions}
              onAdd={onAddQuestion} onEdit={onEditQuestion}
              onDelete={onDeleteQuestion} onImport={()=>onImport('questions')}/>
          : <SynonymsTable items={filteredSynonyms}
              onAdd={onAddSynonym} onEdit={onEditSynonym}
              onDelete={onDeleteSynonym} onImport={()=>onImport('synonyms')}/>
      }
    </div>
  );
}

function DiseasesTable({ items, onAdd, onEdit, onView, onDelete, onImport }) {
  return (
    <div>
      <TableHeader count={items.length} label="condition" onAdd={onAdd} addLabel="+ Add disease" onImport={onImport}/>
      {!items.length ? <div className="empty">No diseases yet. Add one or import a CSV.</div> : (
        <div style={{overflowX:'auto'}}>
          <table className="table">
            <thead><tr><th>Name</th><th>ICD-10</th><th>Category</th><th>Age</th><th>Sex</th><th>Red flags</th><th>Actions</th></tr></thead>
            <tbody>{items.map(d=>(
              <tr key={d.id}>
                <td><strong>{d.name}</strong></td>
                <td><span style={{fontFamily:'monospace',fontSize:12}}>{d.icd10||'—'}</span></td>
                <td>{d.category||'—'}</td>
                <td>{d.age_group||'any'}</td>
                <td>{d.sex||'any'}</td>
                <td style={{fontSize:12}}>
                  {Array.isArray(d.red_flags)&&d.red_flags.length
                    ? <span style={{color:'#dc2626'}}>⚠ {d.red_flags.length}</span> : '—'}
                </td>
                <td><RowActions onView={()=>onView(d)} onEdit={()=>onEdit(d)} onDelete={()=>onDelete(d.id)}/></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SymptomsTable({ items, onAdd, onEdit, onDelete, onImport }) {
  return (
    <div>
      <TableHeader count={items.length} label="symptom" onAdd={onAdd} addLabel="+ Add symptom" onImport={onImport}/>
      {!items.length ? <div className="empty">No symptoms yet.</div> : (
        <div style={{overflowX:'auto'}}>
          <table className="table">
            <thead><tr><th>Name</th><th>Body system</th><th>Description</th><th>Actions</th></tr></thead>
            <tbody>{items.map(s=>(
              <tr key={s.id}>
                <td><strong>{s.name}</strong></td>
                <td>{s.body_system||'—'}</td>
                <td style={{fontSize:12,maxWidth:300}}>{s.description||'—'}</td>
                <td><RowActions onEdit={()=>onEdit(s)} onDelete={()=>onDelete(s.id)}/></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function QuestionsTable({ items, onAdd, onEdit, onDelete, onImport }) {
  const sections = [...new Set(items.map(q=>q.section))].sort();
  const [secFilter, setSecFilter] = useState('');
  const filtered = secFilter ? items.filter(q=>q.section===secFilter) : items;
  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12,flexWrap:'wrap',gap:8}}>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          <span style={{fontSize:13,color:'#64748b'}}>{filtered.length} question{filtered.length!==1?'s':''}</span>
          <select value={secFilter} onChange={e=>setSecFilter(e.target.value)}
            style={{padding:'4px 8px',border:'1px solid #e2e8f0',borderRadius:6,fontSize:13}}>
            <option value="">All sections</option>
            {sections.map(s=><option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button className="btn btn-ghost" style={{fontSize:13}} onClick={onImport}>⬆ Upload SQL</button>
          <button className="btn btn-primary" style={{fontSize:13}} onClick={onAdd}>+ Add question</button>
        </div>
      </div>
      {!filtered.length ? <div className="empty">No questions yet.</div> : (
        <div style={{overflowX:'auto'}}>
          <table className="table">
            <thead><tr><th>Section</th><th>Question</th><th>Importance</th><th>Follow-up for</th><th>Actions</th></tr></thead>
            <tbody>{filtered.map(q=>(
              <tr key={q.id}>
                <td><span className="pill pill-violet">{q.section}</span></td>
                <td style={{maxWidth:400}}>{q.question}</td>
                <td><ImpBar value={q.importance}/></td>
                <td style={{fontSize:12}}>{q.follow_up_for||'—'}</td>
                <td><RowActions onEdit={()=>onEdit(q)} onDelete={()=>onDelete(q.id)}/></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   DISEASE DETAIL MODAL  (keywords / investigations / treatments)
────────────────────────────────────────────────────────── */
function SynonymsTable({ items, onAdd, onEdit, onDelete, onImport }) {
  // Group synonyms by canonical for cleaner display
  const grouped = items.reduce((acc, s) => {
    const key = s.canonical || '—';
    if (!acc[key]) acc[key] = [];
    acc[key].push(s);
    return acc;
  }, {});
  const canonicalKeys = Object.keys(grouped).sort();

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12,flexWrap:'wrap',gap:8}}>
        <span style={{fontSize:13,color:'#64748b'}}>
          {items.length} synonym{items.length!==1?'s':''} across {canonicalKeys.length} canonical term{canonicalKeys.length!==1?'s':''}
        </span>
        <div style={{display:'flex',gap:8}}>
          <button className="btn btn-ghost" style={{fontSize:13}} onClick={onImport}>⬆ Upload SQL</button>
          <button className="btn btn-primary" style={{fontSize:13}} onClick={onAdd}>+ Add synonym</button>
        </div>
      </div>

      <div style={{
        background:'#f0f9ff', border:'1px solid #bae6fd', borderRadius:8,
        padding:12, marginBottom:12, fontSize:13, color:'#0369a1'
      }}>
        <strong>💡 How synonyms work:</strong> The diagnosis engine expands the case text using these mappings before scoring.
        For example, if the canonical term is <code>shortness of breath</code> and synonyms include <code>sob</code>, <code>dyspnoea</code>, and <code>breathlessness</code>,
        the engine will recognise all of them when matching keywords from the diseases table.
      </div>

      {!items.length ? <div className="empty">No synonyms defined yet. Click "+ Add synonym" to start.</div> : (
        <div style={{overflowX:'auto'}}>
          <table className="table">
            <thead><tr><th>Canonical Term</th><th>Synonyms / Alternates</th><th style={{width:140}}>Actions</th></tr></thead>
            <tbody>{canonicalKeys.map(key => (
              <tr key={key}>
                <td><strong style={{color:'#1d4ed8'}}>{key}</strong></td>
                <td>
                  <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                    {grouped[key].map(s => (
                      <span key={s.id} style={{
                        background:'#f1f5f9', borderRadius:6, padding:'3px 10px',
                        fontSize:12, display:'inline-flex', alignItems:'center', gap:6
                      }}>
                        {s.synonym}
                        <button onClick={()=>onEdit(s)} title="Edit"
                          style={{border:'none',background:'transparent',cursor:'pointer',color:'#64748b',fontSize:11,padding:0}}>✏️</button>
                        <button onClick={()=>onDelete(s.id)} title="Delete"
                          style={{border:'none',background:'transparent',cursor:'pointer',color:'#dc2626',fontSize:11,padding:0}}>×</button>
                      </span>
                    ))}
                  </div>
                </td>
                <td>
                  <button className="btn btn-ghost" style={{fontSize:12,padding:'4px 10px'}}
                    onClick={()=>onAdd && onEdit({ canonical: key })}>+ Add to group</button>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   DISEASE DETAIL MODAL  (keywords / investigations / treatments)
────────────────────────────────────────────────────────── */
function DiseaseDetailModal({ disease, onClose, notify, reload }) {
  const [sub, setSub]   = useState('keywords');
  const [kws,  setKws]  = useState([]);
  const [invs, setInvs] = useState([]);
  const [txs,  setTxs]  = useState([]);
  const [busy, setBusy] = useState(true);
  const [form, setForm] = useState({});

  const load = async () => {
    setBusy(true);
    try {
      const [k, i, t] = await Promise.all([
        api.get(`/api/admin/mk/diseases/${disease.id}/keywords`),
        api.get(`/api/admin/mk/diseases/${disease.id}/investigations`),
        api.get(`/api/admin/mk/diseases/${disease.id}/treatments`),
      ]);
      setKws(k.keywords||[]);
      setInvs(i.investigations||[]);
      setTxs(t.treatments||[]);
    } catch(e) { notify(e.message,'err'); }
    finally { setBusy(false); }
  };
  useEffect(()=>{ load(); }, [disease.id]);

  const del = async (endpoint, id, label) => {
    if (!confirm(`Delete this ${label}?`)) return;
    try { await api.delete(`${endpoint}/${id}`); notify(`${label} deleted.`); load(); }
    catch(e) { notify(e.message,'err'); }
  };

  const addKw = async () => {
    if (!form.kw?.trim()) { notify('Keyword required.','err'); return; }
    try {
      await api.post(`/api/admin/mk/diseases/${disease.id}/keywords`,
        { keyword:form.kw, weight:form.kwW||1, against:form.kwA||false });
      setForm({}); load(); notify('Keyword added.');
    } catch(e) { notify(e.message,'err'); }
  };
  const addInv = async () => {
    if (!form.invT?.trim()) { notify('Test name required.','err'); return; }
    try {
      await api.post(`/api/admin/mk/diseases/${disease.id}/investigations`,
        { category:form.invC||'lab', test:form.invT, reason:form.invR });
      setForm({}); load(); notify('Investigation added.');
    } catch(e) { notify(e.message,'err'); }
  };
  const addTx = async () => {
    if (!form.txI?.trim()) { notify('Item required.','err'); return; }
    try {
      await api.post(`/api/admin/mk/diseases/${disease.id}/treatments`, {
        type:form.txT||'medication', item:form.txI, dose:form.txD,
        route:form.txR, frequency:form.txF, duration:form.txDu, notes:form.txN,
      });
      setForm({}); load(); notify('Treatment added.');
    } catch(e) { notify(e.message,'err'); }
  };

  return (
    <Overlay onClose={onClose} wide>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:12}}>
        <div>
          <h2 style={{margin:0,fontSize:20}}>🦠 {disease.name}</h2>
          <p style={{margin:'4px 0 0',fontSize:13,color:'#64748b'}}>
            {disease.icd10 && <span style={{fontFamily:'monospace',marginRight:10}}>{disease.icd10}</span>}
            {[disease.category, disease.age_group, disease.sex].filter(Boolean).join(' · ')}
          </p>
        </div>
      </div>

      {disease.reasoning && (
        <div style={{background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:8,padding:'10px 14px',fontSize:13,marginBottom:12}}>
          <strong>Clinical reasoning:</strong> {disease.reasoning}
        </div>
      )}
      {Array.isArray(disease.red_flags)&&disease.red_flags.length>0 && (
        <div style={{background:'#fef2f2',border:'1px solid #fca5a5',borderRadius:8,padding:'10px 14px',fontSize:13,marginBottom:12}}>
          <strong style={{color:'#dc2626'}}>⚠ Red flags:</strong> {disease.red_flags.join(' · ')}
        </div>
      )}

      {/* sub-tabs */}
      <div style={{display:'flex',gap:0,borderBottom:'1px solid #e2e8f0',marginBottom:14}}>
        {['keywords','investigations','treatments'].map(t=>(
          <button key={t} onClick={()=>setSub(t)} style={{
            padding:'8px 16px',background:'none',border:'none',
            borderBottom:`3px solid ${sub===t?'#1d4ed8':'transparent'}`,
            color:sub===t?'#1d4ed8':'#64748b',fontWeight:600,fontSize:13,
            cursor:'pointer',textTransform:'capitalize'
          }}>{t}</button>
        ))}
      </div>

      {busy ? <div className="empty"><span className="spinner"/> Loading…</div> : <>
        {/* KEYWORDS */}
        {sub==='keywords' && (
          <div>
            <table className="table" style={{marginBottom:12}}>
              <thead><tr><th>Keyword</th><th>Weight</th><th>Type</th><th></th></tr></thead>
              <tbody>
                {!kws.length ? <tr><td colSpan={4} style={{textAlign:'center',color:'#94a3b8'}}>None yet</td></tr>
                  : kws.map(k=>(
                  <tr key={k.id}>
                    <td>{k.keyword}</td><td>{k.weight}</td>
                    <td>{k.against?<span style={{color:'#dc2626'}}>Against</span>:<span style={{color:'#16a34a'}}>For</span>}</td>
                    <td><button className="btn btn-danger" style={{fontSize:11,padding:'2px 8px'}} onClick={()=>del('/api/admin/mk/keywords',k.id,'keyword')}>×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <AddRow>
              <F label="Keyword" v={form.kw||''} onChange={v=>setForm(f=>({...f,kw:v}))}/>
              <F label="Weight" v={form.kwW||''} onChange={v=>setForm(f=>({...f,kwW:v}))} placeholder="1.0" style={{width:80}}/>
              <div>
                <label style={lbl}>Type</label>
                <select value={form.kwA||false} onChange={e=>setForm(f=>({...f,kwA:e.target.value==='true'}))} style={selSt}>
                  <option value={false}>For (adds score)</option>
                  <option value={true}>Against (subtracts)</option>
                </select>
              </div>
              <button className="btn btn-primary" style={{fontSize:13,alignSelf:'flex-end'}} onClick={addKw}>Add</button>
            </AddRow>
          </div>
        )}

        {/* INVESTIGATIONS */}
        {sub==='investigations' && (
          <div>
            <table className="table" style={{marginBottom:12}}>
              <thead><tr><th>Category</th><th>Test</th><th>Reason</th><th></th></tr></thead>
              <tbody>
                {!invs.length ? <tr><td colSpan={4} style={{textAlign:'center',color:'#94a3b8'}}>None yet</td></tr>
                  : invs.map(i=>(
                  <tr key={i.id}>
                    <td><span className="pill pill-gray">{i.category}</span></td>
                    <td>{i.test}</td><td style={{fontSize:12}}>{i.reason||'—'}</td>
                    <td><button className="btn btn-danger" style={{fontSize:11,padding:'2px 8px'}} onClick={()=>del('/api/admin/mk/investigations',i.id,'investigation')}>×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <AddRow>
              <div>
                <label style={lbl}>Category</label>
                <select value={form.invC||'lab'} onChange={e=>setForm(f=>({...f,invC:e.target.value}))} style={selSt}>
                  <option value="lab">Lab</option><option value="imaging">Imaging</option>
                  <option value="bedside">Bedside</option><option value="specialist">Specialist</option>
                </select>
              </div>
              <F label="Test name *" v={form.invT||''} onChange={v=>setForm(f=>({...f,invT:v}))} placeholder="e.g. FBC"/>
              <F label="Reason" v={form.invR||''} onChange={v=>setForm(f=>({...f,invR:v}))} placeholder="Clinical indication"/>
              <button className="btn btn-primary" style={{fontSize:13,alignSelf:'flex-end'}} onClick={addInv}>Add</button>
            </AddRow>
          </div>
        )}

        {/* TREATMENTS */}
        {sub==='treatments' && (
          <div>
            <div style={{overflowX:'auto',marginBottom:12}}>
              <table className="table">
                <thead><tr><th>Type</th><th>Item</th><th>Dose</th><th>Route</th><th>Freq</th><th>Duration</th><th></th></tr></thead>
                <tbody>
                  {!txs.length ? <tr><td colSpan={7} style={{textAlign:'center',color:'#94a3b8'}}>None yet</td></tr>
                    : txs.map(t=>(
                    <tr key={t.id}>
                      <td><span className="pill pill-violet">{t.type}</span></td>
                      <td>{t.item}</td>
                      <td style={{fontSize:12}}>{t.dose||'—'}</td><td style={{fontSize:12}}>{t.route||'—'}</td>
                      <td style={{fontSize:12}}>{t.frequency||'—'}</td><td style={{fontSize:12}}>{t.duration||'—'}</td>
                      <td><button className="btn btn-danger" style={{fontSize:11,padding:'2px 8px'}} onClick={()=>del('/api/admin/mk/treatments',t.id,'treatment')}>×</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <AddRow wrap>
              <div>
                <label style={lbl}>Type</label>
                <select value={form.txT||'medication'} onChange={e=>setForm(f=>({...f,txT:e.target.value}))} style={selSt}>
                  {['immediate','medication','non_pharm','monitoring','advice','red_flag','referral','follow_up'].map(v=>(
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>
              <F label="Item *" v={form.txI||''} onChange={v=>setForm(f=>({...f,txI:v}))} placeholder="e.g. Aspirin"/>
              <F label="Dose"     v={form.txD||''} onChange={v=>setForm(f=>({...f,txD:v}))} placeholder="300mg"  style={{width:90}}/>
              <F label="Route"    v={form.txR||''} onChange={v=>setForm(f=>({...f,txR:v}))} placeholder="oral"   style={{width:90}}/>
              <F label="Frequency"v={form.txF||''} onChange={v=>setForm(f=>({...f,txF:v}))} placeholder="BD"    style={{width:90}}/>
              <F label="Duration" v={form.txDu||''} onChange={v=>setForm(f=>({...f,txDu:v}))} placeholder="5 days" style={{width:90}}/>
              <button className="btn btn-primary" style={{fontSize:13,alignSelf:'flex-end'}} onClick={addTx}>Add</button>
            </AddRow>
          </div>
        )}
      </>}

      <div style={{display:'flex',justifyContent:'flex-end',marginTop:20}}>
        <button className="btn btn-ghost" onClick={onClose}>Close</button>
      </div>
    </Overlay>
  );
}

/* ──────────────────────────────────────────────────────────
   DISEASE MODAL  (add / edit master record)
────────────────────────────────────────────────────────── */
function DiseaseModal({ data, onClose, onSaved, notify }) {
  const isEdit = !!data?.id;
  const [form, setForm] = useState({
    name: data?.name||'', icd10: data?.icd10||'', category: data?.category||'',
    age_group: data?.age_group||'any', sex: data?.sex||'any',
    description: data?.description||'', reasoning: data?.reasoning||'',
    red_flags: Array.isArray(data?.red_flags) ? data.red_flags.join('\n') : '',
  });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!form.name.trim()) { notify('Name is required.','err'); return; }
    setSaving(true);
    try {
      const payload = { ...form, red_flags: form.red_flags.split('\n').map(s=>s.trim()).filter(Boolean) };
      if (isEdit) await api.put(`/api/admin/mk/diseases/${data.id}`, payload);
      else        await api.post('/api/admin/mk/diseases', payload);
      onSaved();
    } catch(e) { notify(e.message,'err'); }
    finally { setSaving(false); }
  };
  return (
    <Overlay onClose={onClose}>
      <h2 style={{margin:'0 0 16px',fontSize:20}}>{isEdit?'✏️ Edit disease':'➕ Add disease'}</h2>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
        <F label="Disease name *" v={form.name}     onChange={v=>setForm(f=>({...f,name:v}))}/>
        <F label="ICD-10 code"    v={form.icd10}    onChange={v=>setForm(f=>({...f,icd10:v}))} placeholder="e.g. I21.0"/>
        <F label="Category"       v={form.category} onChange={v=>setForm(f=>({...f,category:v}))} placeholder="e.g. Cardiovascular"/>
        <div>
          <label style={lbl}>Age group</label>
          <select value={form.age_group} onChange={e=>setForm(f=>({...f,age_group:e.target.value}))} style={selSt}>
            {['any','adult','pediatric','elderly'].map(v=><option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>Sex</label>
          <select value={form.sex} onChange={e=>setForm(f=>({...f,sex:e.target.value}))} style={selSt}>
            {['any','male','female'].map(v=><option key={v} value={v}>{v}</option>)}
          </select>
        </div>
      </div>
      <div style={{marginTop:12}}><TA label="Description"       v={form.description} onChange={v=>setForm(f=>({...f,description:v}))} rows={2}/></div>
      <div style={{marginTop:12}}><TA label="Clinical reasoning" v={form.reasoning}   onChange={v=>setForm(f=>({...f,reasoning:v}))}   rows={2}/></div>
      <div style={{marginTop:12}}><TA label="Red flags (one per line)" v={form.red_flags} onChange={v=>setForm(f=>({...f,red_flags:v}))} rows={3} placeholder={"Sudden chest pain\nHaemoptysis"}/></div>
      <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:20}}>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save} disabled={saving}>{saving?'Saving…':isEdit?'Save changes':'Add disease'}</button>
      </div>
    </Overlay>
  );
}

/* ──────────────────────────────────────────────────────────
   SYMPTOM MODAL
────────────────────────────────────────────────────────── */
function SymptomModal({ data, onClose, onSaved, notify }) {
  const isEdit = !!data?.id;
  const [form, setForm] = useState({ name:data?.name||'', body_system:data?.body_system||'', description:data?.description||'' });
  const [saving,setSaving] = useState(false);
  const save = async () => {
    if (!form.name.trim()) { notify('Name required.','err'); return; }
    setSaving(true);
    try {
      if (isEdit) await api.put(`/api/admin/mk/symptoms/${data.id}`, form);
      else        await api.post('/api/admin/mk/symptoms', form);
      onSaved();
    } catch(e) { notify(e.message,'err'); }
    finally { setSaving(false); }
  };
  return (
    <Overlay onClose={onClose}>
      <h2 style={{margin:'0 0 16px',fontSize:20}}>{isEdit?'✏️ Edit symptom':'➕ Add symptom'}</h2>
      <F label="Symptom name *" v={form.name}        onChange={v=>setForm(f=>({...f,name:v}))}/>
      <div style={{marginTop:12}}>
        <F label="Body system" v={form.body_system} onChange={v=>setForm(f=>({...f,body_system:v}))} placeholder="e.g. Cardiovascular"/>
      </div>
      <div style={{marginTop:12}}>
        <TA label="Description" v={form.description} onChange={v=>setForm(f=>({...f,description:v}))} rows={3}/>
      </div>
      <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:20}}>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save} disabled={saving}>{saving?'Saving…':isEdit?'Save changes':'Add symptom'}</button>
      </div>
    </Overlay>
  );
}

/* ──────────────────────────────────────────────────────────
   QUESTION MODAL
────────────────────────────────────────────────────────── */
function QuestionModal({ data, onClose, onSaved, notify }) {
  const isEdit = !!data?.id;
  const [form, setForm] = useState({
    section: data?.section||'HPC',
    question: data?.question||'',
    importance: data?.importance??5,
    follow_up_for: data?.follow_up_for||'',
    triggers: Array.isArray(data?.triggers) ? data.triggers.join(', ') : '',
  });
  const [saving,setSaving] = useState(false);
  const save = async () => {
    if (!form.question.trim()) { notify('Question required.','err'); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        triggers: form.triggers.split(',').map(s=>s.trim()).filter(Boolean),
        importance: Number(form.importance),
      };
      if (isEdit) await api.put(`/api/admin/mk/questions/${data.id}`, payload);
      else        await api.post('/api/admin/mk/questions', payload);
      onSaved();
    } catch(e) { notify(e.message,'err'); }
    finally { setSaving(false); }
  };
  return (
    <Overlay onClose={onClose}>
      <h2 style={{margin:'0 0 16px',fontSize:20}}>{isEdit?'✏️ Edit question':'➕ Add question'}</h2>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
        <div>
          <label style={lbl}>Section *</label>
          <select value={form.section} onChange={e=>setForm(f=>({...f,section:e.target.value}))} style={selSt}>
            {['HPC','PMH','DH','FH','SH','ROS'].map(s=><option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>Importance (1–10)</label>
          <input type="number" min={1} max={10} value={form.importance}
            onChange={e=>setForm(f=>({...f,importance:e.target.value}))}
            style={{...inpSt,width:'100%'}}/>
        </div>
      </div>
      <div style={{marginTop:12}}><TA label="Question *" v={form.question} onChange={v=>setForm(f=>({...f,question:v}))} rows={2}/></div>
      <div style={{marginTop:12}}><F label="Follow-up for" v={form.follow_up_for} onChange={v=>setForm(f=>({...f,follow_up_for:v}))} placeholder="e.g. chest pain"/></div>
      <div style={{marginTop:12}}><F label="Triggers (comma-separated)" v={form.triggers} onChange={v=>setForm(f=>({...f,triggers:v}))} placeholder="fever, cough, pain"/></div>
      <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:20}}>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save} disabled={saving}>{saving?'Saving…':isEdit?'Save changes':'Add question'}</button>
      </div>
    </Overlay>
  );
}

/* ──────────────────────────────────────────────────────────
   SYNONYM MODAL
────────────────────────────────────────────────────────── */
function SynonymModal({ data, onClose, onSaved, notify }) {
  const isEdit = !!data?.id;
  const [form, setForm] = useState({
    canonical: data?.canonical || '',
    synonym:   data?.synonym   || '',
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.canonical.trim()) { notify('Canonical term is required.', 'err'); return; }
    if (!form.synonym.trim())   { notify('Synonym is required.', 'err'); return; }
    setSaving(true);
    try {
      const payload = {
        canonical: form.canonical.trim().toLowerCase(),
        synonym:   form.synonym.trim().toLowerCase(),
      };
      if (isEdit) await api.put(`/api/admin/mk/synonyms/${data.id}`, payload);
      else        await api.post('/api/admin/mk/synonyms', payload);
      onSaved();
    } catch (e) {
      notify(e.message, 'err');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Overlay onClose={onClose}>
      <h2 style={{margin:'0 0 16px',fontSize:20}}>{isEdit?'✏️ Edit synonym':'➕ Add synonym'}</h2>

      <div style={{
        background:'#fef3c7', border:'1px solid #fde68a', borderRadius:8,
        padding:10, marginBottom:14, fontSize:12, color:'#92400e'
      }}>
        <strong>Tip:</strong> The canonical term should match a keyword used in your diseases table
        (e.g. <code>shortness of breath</code>). The synonym is any alternate way doctors might write it
        (e.g. <code>sob</code>, <code>dyspnoea</code>).
      </div>

      <div style={{marginBottom:12}}>
        <F label="Canonical term *" v={form.canonical}
          onChange={v=>setForm(f=>({...f,canonical:v}))}
          placeholder="e.g. shortness of breath"/>
      </div>
      <div>
        <F label="Synonym / abbreviation *" v={form.synonym}
          onChange={v=>setForm(f=>({...f,synonym:v}))}
          placeholder="e.g. sob"/>
      </div>

      <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:20}}>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving?'Saving…':isEdit?'Save changes':'Add synonym'}
        </button>
      </div>
    </Overlay>
  );
}

/* ──────────────────────────────────────────────────────────
   IMPORT MODAL  (CSV drag-drop with template download)
────────────────────────────────────────────────────────── */
/* ──────────────────────────────────────────────────────────
   SQL UPLOAD MODAL — execute a .sql file against the DB
────────────────────────────────────────────────────────── */
const SQL_TEMPLATE_FALLBACK = {
  diseases:
`-- Add a new disease with keywords, investigations and treatments.
-- The whole file runs in one transaction; if any statement fails, nothing is saved.

INSERT INTO diseases (name, icd10, category, age_group, sex, reasoning, red_flags)
VALUES (
  'Pulmonary Embolism',
  'I26.9',
  'Respiratory',
  'adult',
  'any',
  'Sudden breathlessness + pleuritic chest pain + risk factors strongly suggest PE.',
  ARRAY['Haemodynamic collapse','SpO2 < 90%','Massive haemoptysis','Syncope']
);

INSERT INTO disease_keywords (disease_id, keyword, weight, against) VALUES
  ((SELECT id FROM diseases WHERE name='Pulmonary Embolism'), 'sudden breathlessness', 3.0, FALSE),
  ((SELECT id FROM diseases WHERE name='Pulmonary Embolism'), 'pleuritic chest pain',  3.0, FALSE),
  ((SELECT id FROM diseases WHERE name='Pulmonary Embolism'), 'haemoptysis',           2.5, FALSE),
  ((SELECT id FROM diseases WHERE name='Pulmonary Embolism'), 'leg swelling',          2.0, FALSE),
  ((SELECT id FROM diseases WHERE name='Pulmonary Embolism'), 'productive cough',      1.0, TRUE);

INSERT INTO disease_investigations (disease_id, category, test, reason) VALUES
  ((SELECT id FROM diseases WHERE name='Pulmonary Embolism'), 'lab',     'D-dimer', 'Sensitive screening test'),
  ((SELECT id FROM diseases WHERE name='Pulmonary Embolism'), 'imaging', 'CTPA',    'Definitive diagnosis');

INSERT INTO disease_treatments (disease_id, type, item, dose, route, frequency, duration, notes) VALUES
  ((SELECT id FROM diseases WHERE name='Pulmonary Embolism'), 'medication', 'Enoxaparin', '1 mg/kg', 'SC', 'BD', '5–10 days', 'Adjust in renal impairment'),
  ((SELECT id FROM diseases WHERE name='Pulmonary Embolism'), 'immediate',  'Oxygen to maintain SpO2 ≥ 94%', NULL, NULL, NULL, NULL, NULL);
`,

  synonyms:
`-- Bulk add synonyms (canonical → alternate spelling/abbreviation)
INSERT INTO symptom_synonyms (canonical, synonym) VALUES
  ('shortness of breath', 'sob'),
  ('shortness of breath', 'dyspnoea'),
  ('shortness of breath', 'breathlessness'),
  ('chest pain',          'chest tightness'),
  ('fever',               'pyrexia'),
  ('hypertension',        'htn'),
  ('myocardial infarction','mi'),
  ('diabetes',            'dm')
ON CONFLICT (canonical, synonym) DO NOTHING;
`,

  questions:
`-- Add new history questions
INSERT INTO history_questions (section, question, importance, follow_up_for, triggers) VALUES
  ('HPC', 'Does the pain radiate to the jaw, left arm, or shoulder?', 9, 'chest pain', ARRAY['chest pain','crushing']),
  ('HPC', 'Has the patient had any recent travel, immobility, or surgery?', 8, 'breathlessness', ARRAY['breathlessness','pleuritic']);
`,

  symptoms:
`-- Add new symptoms
INSERT INTO symptoms (name, body_system, description) VALUES
  ('Pleuritic chest pain', 'Respiratory', 'Sharp chest pain worse on inspiration')
ON CONFLICT (name) DO NOTHING;
`,

  sha_tariffs:
`-- SHA TARIFF SCHEDULE TEMPLATE
-- Social Health Insurance Act No. 16 of 2023
-- Upload the official sha_tariffs.sql or use this template to add custom entries.

-- Create tables if not already present
CREATE TABLE IF NOT EXISTS benefit_packages (
    id         SERIAL PRIMARY KEY,
    fund       VARCHAR(100) NOT NULL,
    package    VARCHAR(200) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tariff_items (
    id            SERIAL PRIMARY KEY,
    package_id    INT REFERENCES benefit_packages(id),
    service_name  VARCHAR(300) NOT NULL,
    access_point  VARCHAR(200),
    tariff_amount NUMERIC(12,2),
    tariff_unit   VARCHAR(100),
    ppm           VARCHAR(100),
    limit_notes   TEXT,
    access_rules  TEXT,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS surgical_procedures (
    id             SERIAL PRIMARY KEY,
    specialty      VARCHAR(100) NOT NULL,
    procedure_name VARCHAR(300) NOT NULL,
    tariff_kes     NUMERIC(12,2) NOT NULL,
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Example: Add a benefit package
INSERT INTO benefit_packages (fund, package) VALUES
  ('SOCIAL HEALTH INSURANCE FUND', 'OUTPATIENT CARE SERVICES')
ON CONFLICT DO NOTHING;

-- Example: Add a service tariff item
INSERT INTO tariff_items (package_id, service_name, tariff_amount, tariff_unit, ppm) VALUES
  (1, 'General Outpatient Consultation', 500.00, 'per visit', 'Fee for Service')
ON CONFLICT DO NOTHING;

-- Example: Add a surgical procedure
INSERT INTO surgical_procedures (specialty, procedure_name, tariff_kes) VALUES
  ('General Surgery', 'Appendicectomy', 45000.00),
  ('Obstetrics', 'Caesarean Section', 32600.00)
ON CONFLICT DO NOTHING;
`,
};

function SqlUploadModal({ section, onClose, onImported, notify }) {
  const [file,    setFile]    = useState(null);
  const [preview, setPreview] = useState('');
  const [running, setRunning] = useState(false);
  const [result,  setResult]  = useState(null);
  const ref = useRef();

  const SECTION_LABELS = {
    sha_tariffs: '📋 SHA Official Tariff Schedule (sha_tariffs.sql)',
    diseases:    '🦠 Diseases',
    symptoms:    '💊 Symptoms',
    database:    '🗄️ Database',
  };
  const sectionLabel = SECTION_LABELS[section] || section || 'database';

  const pick = f => {
    if (!f) return;
    if (!/\.sql$/i.test(f.name)) {
      notify('Only .sql files are accepted.', 'err');
      return;
    }
    setFile(f);
    setResult(null);
    const reader = new FileReader();
    reader.onload = e => setPreview(String(e.target.result).slice(0, 2000));
    reader.readAsText(f);
  };

  const runUpload = async () => {
    if (!file) { notify('Select a .sql file first.', 'err'); return; }
    setRunning(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await api.upload('/api/admin/sql/upload', fd);
      setResult({ ok: true, ...r });
      notify(r.message || 'SQL executed successfully.');
      onImported();
    } catch (e) {
      const errMsg = (e?.body && e.body.details) || e.message || 'SQL upload failed';
      const errHint = e?.body && e.body.hint;
      setResult({ ok: false, error: errMsg, hint: errHint });
      notify(errMsg, 'err');
    } finally {
      setRunning(false);
    }
  };

  const dlTemplate = () => {
    const tpl = SQL_TEMPLATE_FALLBACK[section] || SQL_TEMPLATE_FALLBACK.diseases;
    const blob = new Blob([tpl], { type: 'application/sql' });
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(blob),
      download: `template_${section || 'sql'}.sql`,
    });
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <Overlay onClose={onClose} wide>
      <h2 style={{margin:'0 0 4px',fontSize:20}}>⬆ Upload SQL — {sectionLabel}</h2>
      <p style={{margin:'0 0 14px',fontSize:13,color:'#64748b'}}>
        Upload a <code>.sql</code> file to add or update records in bulk. The whole file runs in one transaction —
        if any statement fails, nothing is saved.
      </p>

      {section === 'sha_tariffs' && (
        <div style={{ background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:8,
                      padding:12, marginBottom:14, fontSize:12, color:'#1d4ed8' }}>
          <strong>📋 SHA Tariffs SQL Upload</strong><br/>
          Upload the <code>sha_tariffs.sql</code> file provided by Ministry of Health / SHA.
          This will create/populate three tables: <code>benefit_packages</code>, <code>tariff_items</code>, and <code>surgical_procedures</code>.
          These values are then automatically used in claims calculation as the official tariff reference.
        </div>
      )}

      <div style={{
        background:'#fef3c7', border:'1px solid #fde68a', borderRadius:8,
        padding:10, marginBottom:14, fontSize:12, color:'#92400e'
      }}>
        <strong>Safety:</strong> Statements that drop tables, truncate core tables, or modify users/passwords are blocked.
        Stick to <code>INSERT</code>, <code>UPDATE</code>, and <code>DELETE</code> on the medical-knowledge tables
        (diseases, keywords, investigations, treatments, symptoms, questions, synonyms).
      </div>

      <div style={{
        background:'#eff6ff',border:'2px dashed #93c5fd',borderRadius:10,
        padding:24,textAlign:'center',cursor:'pointer',marginBottom:14
      }}
        onClick={()=>ref.current?.click()}
        onDragOver={e=>e.preventDefault()}
        onDrop={e=>{ e.preventDefault(); pick(e.dataTransfer.files[0]); }}>
        <input ref={ref} type="file" accept=".sql,application/sql,text/plain" style={{display:'none'}}
          onChange={e=>pick(e.target.files[0])}/>
        {file
          ? <><div style={{fontSize:28}}>📄</div><div style={{fontWeight:600}}>{file.name}</div>
              <div style={{fontSize:12,color:'#64748b'}}>{(file.size/1024).toFixed(1)} KB</div></>
          : <><div style={{fontSize:36}}>📂</div>
              <div style={{fontWeight:600,marginTop:4}}>Click or drop a .sql file here</div>
              <div style={{fontSize:11,color:'#64748b',marginTop:4}}>Max 10 MB</div></>
        }
      </div>

      {preview && (
        <div style={{
          background:'#0f172a', color:'#e2e8f0', borderRadius:8, padding:12,
          marginBottom:14, maxHeight:240, overflow:'auto'
        }}>
          <div style={{fontSize:11,color:'#94a3b8',marginBottom:6}}>SQL preview (first 2 KB):</div>
          <pre style={{fontFamily:'monospace',fontSize:11,whiteSpace:'pre-wrap',margin:0,color:'#e2e8f0'}}>{preview}</pre>
        </div>
      )}

      {result && (
        <div style={{
          padding:12, borderRadius:8, marginBottom:14, fontSize:13,
          background: result.ok ? '#f0fdf4' : '#fef2f2',
          border:    `1px solid ${result.ok ? '#86efac' : '#fca5a5'}`,
          color:     result.ok ? '#166534' : '#991b1b',
        }}>
          {result.ok ? (
            <><strong>✓ Success.</strong> {result.message || 'Statements executed.'}</>
          ) : (
            <><strong>✗ Failed:</strong> {result.error}{result.hint ? <div style={{marginTop:4,fontSize:12}}>Hint: {result.hint}</div> : null}</>
          )}
        </div>
      )}

      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <button className="btn btn-ghost" style={{fontSize:13}} onClick={dlTemplate}>⬇ Download SQL template</button>
        <div style={{display:'flex',gap:8}}>
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
          <button className="btn btn-primary" onClick={runUpload} disabled={running||!file}>
            {running ? 'Running…' : '▶ Run SQL'}
          </button>
        </div>
      </div>
    </Overlay>
  );
}

/* ──────────────────────────────────────────────────────────
   PASSWORD RESET MODAL (admin-triggered)
────────────────────────────────────────────────────────── */
function ResetPasswordModal({ user, onClose, onDone, notify }) {
  const [customPassword, setCustomPassword] = useState('');
  const [working, setWorking] = useState(false);
  const [result, setResult]   = useState(null);

  const doReset = async () => {
    if (customPassword && customPassword.length < 6) {
      notify('Password must be at least 6 characters.', 'err');
      return;
    }
    setWorking(true);
    try {
      const r = await api.post(`/api/admin/users/${user.id}/reset-password`,
        customPassword ? { password: customPassword } : {});
      setResult(r);
      notify('Password reset successful.');
    } catch (e) {
      notify(e.message, 'err');
    } finally {
      setWorking(false);
    }
  };

  const copyPwd = () => {
    if (!result?.temporary_password) return;
    navigator.clipboard.writeText(result.temporary_password)
      .then(() => notify('Password copied to clipboard.'))
      .catch(() => notify('Could not copy automatically. Select and copy manually.', 'err'));
  };

  return (
    <Overlay onClose={onClose}>
      <h2 style={{margin:'0 0 6px',fontSize:20}}>🔑 Reset password</h2>
      <p style={{margin:'0 0 14px',fontSize:13,color:'#64748b'}}>
        Reset the password for <strong>{user?.full_name}</strong> ({user?.email}).
        Leave the field blank to auto-generate a secure 10-character password.
      </p>

      {!result ? (
        <>
          <div style={{marginBottom:14}}>
            <F label="New password (optional)" v={customPassword}
              onChange={setCustomPassword}
              placeholder="Leave blank to auto-generate"/>
          </div>
          <div style={{
            background:'#fef3c7', border:'1px solid #fde68a', borderRadius:8,
            padding:10, marginBottom:14, fontSize:12, color:'#92400e'
          }}>
            <strong>Important:</strong> The new password will be shown once on this screen.
            Copy it and share it securely with the user. Advise them to change it on next login.
          </div>
          <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
            <button className="btn btn-ghost" onClick={onClose} disabled={working}>Cancel</button>
            <button className="btn btn-primary" onClick={doReset} disabled={working}>
              {working ? 'Resetting…' : 'Reset password'}
            </button>
          </div>
        </>
      ) : (
        <>
          <div style={{
            background:'#f0fdf4', border:'1px solid #86efac', borderRadius:8,
            padding:14, marginBottom:14
          }}>
            <div style={{fontSize:13,color:'#166534',marginBottom:8}}>
              ✓ Password reset for <strong>{result.user.full_name}</strong>.
            </div>
            <div style={{fontSize:12,color:'#374151',marginBottom:6,fontWeight:600}}>Temporary password:</div>
            <div style={{
              fontFamily:'monospace', fontSize:18, fontWeight:600,
              background:'#1e293b', color:'#a7f3d0',
              padding:'10px 14px', borderRadius:6,
              display:'flex', alignItems:'center', justifyContent:'space-between', gap:8,
              userSelect:'all'
            }}>
              <span>{result.temporary_password}</span>
              <button onClick={copyPwd} style={{
                background:'#334155',border:'none',color:'white',padding:'4px 10px',
                borderRadius:4,cursor:'pointer',fontSize:12
              }}>📋 Copy</button>
            </div>
          </div>
          <div style={{
            background:'#fef2f2', border:'1px solid #fca5a5', borderRadius:8,
            padding:10, marginBottom:14, fontSize:12, color:'#991b1b'
          }}>
            <strong>This password will not be shown again.</strong> Share it securely with the user
            and have them change it on first login.
          </div>
          <div style={{display:'flex',justifyContent:'flex-end'}}>
            <button className="btn btn-primary" onClick={onDone}>Done</button>
          </div>
        </>
      )}
    </Overlay>
  );
}

/* ──────────────────────────────────────────────────────────
   SHARED PRIMITIVES
────────────────────────────────────────────────────────── */
function Overlay({ onClose, children, wide }) {
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(15,23,42,.5)',zIndex:1000,
      display:'flex',alignItems:'center',justifyContent:'center',padding:16}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:'white',borderRadius:14,padding:24,
        width:'100%',maxWidth:wide?860:540,maxHeight:'90vh',overflowY:'auto',
        boxShadow:'0 25px 60px rgba(0,0,0,.2)'}}>
        {children}
      </div>
    </div>
  );
}

function TableHeader({ count, label, onAdd, addLabel, onImport }) {
  return (
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
      <span style={{fontSize:13,color:'#64748b'}}>{count} {label}{count!==1?'s':''}</span>
      <div style={{display:'flex',gap:8}}>
        <button className="btn btn-ghost" style={{fontSize:13}} onClick={onImport}>⬆ Upload SQL</button>
        <button className="btn btn-primary" style={{fontSize:13}} onClick={onAdd}>{addLabel}</button>
      </div>
    </div>
  );
}

function RowActions({ onView, onEdit, onDelete }) {
  return (
    <div style={{display:'flex',gap:6}}>
      {onView && <button className="btn btn-ghost" style={{fontSize:12,padding:'3px 10px'}} onClick={onView}>View</button>}
      <button className="btn btn-ghost"  style={{fontSize:12,padding:'3px 10px'}} onClick={onEdit}>Edit</button>
      <button className="btn btn-danger" style={{fontSize:12,padding:'3px 10px'}} onClick={onDelete}>Delete</button>
    </div>
  );
}

function AddRow({ children, wrap }) {
  return (
    <div style={{display:'flex',gap:8,flexWrap:wrap?'wrap':'nowrap',alignItems:'flex-end',
      background:'#f8fafc',borderRadius:8,padding:12}}>
      {children}
    </div>
  );
}

function ImpBar({ value }) {
  return (
    <div style={{display:'flex',alignItems:'center',gap:6}}>
      <div style={{width:60,height:6,background:'#e2e8f0',borderRadius:3,overflow:'hidden'}}>
        <div style={{width:`${(value/10)*100}%`,height:'100%',background:'#1d4ed8',borderRadius:3}}/>
      </div>
      <span style={{fontSize:12,color:'#64748b'}}>{value}/10</span>
    </div>
  );
}

function TabBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      flex:'none',padding:'12px 20px',background:'none',border:'none',
      borderBottom:'3px solid '+(active?'#1d4ed8':'transparent'),
      color:active?'#1d4ed8':'#64748b',fontWeight:600,fontSize:14,cursor:'pointer',
    }}>{children}</button>
  );
}

/* form primitives */
const lbl   = { display:'block', fontSize:12, fontWeight:600, color:'#374151', marginBottom:4 };
const inpSt = { padding:'7px 10px', border:'1px solid #e2e8f0', borderRadius:7, fontSize:13, outline:'none' };
const selSt = { ...inpSt, width:'100%' };

function F({ label, v, onChange, placeholder, style }) {
  return (
    <div style={style}>
      {label && <label style={lbl}>{label}</label>}
      <input value={v} onChange={e=>onChange(e.target.value)} placeholder={placeholder||''}
        style={{...inpSt,width:'100%',boxSizing:'border-box'}}/>
    </div>
  );
}

function TA({ label, v, onChange, rows=3, placeholder }) {
  return (
    <div>
      {label && <label style={lbl}>{label}</label>}
      <textarea value={v} onChange={e=>onChange(e.target.value)} rows={rows} placeholder={placeholder||''}
        style={{...inpSt,width:'100%',resize:'vertical',boxSizing:'border-box',fontFamily:'inherit'}}/>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   FACILITY TAB — Hospital Details & SHA Registration
════════════════════════════════════════════════════════════ */
function FacilityTab({ facility, loading, onSave }) {
  const [form, setForm] = useState({
    facility_name:      '',
    sha_number:         '',
    sha_facility_code:  '',
    facility_level:     '4',
    address:            '',
    phone:              '',
    email:              '',
    county:             '',
    sub_county:         '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (facility && Object.keys(facility).length > 0) {
      setForm({
        facility_name:     facility.facility_name     || '',
        sha_number:        facility.sha_number        || '',
        sha_facility_code: facility.sha_facility_code || '',
        facility_level:    facility.facility_level    || '4',
        address:           facility.address           || '',
        phone:             facility.phone             || '',
        email:             facility.email             || '',
        county:            facility.county            || '',
        sub_county:        facility.sub_county        || '',
      });
    }
  }, [facility]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    if (!form.facility_name.trim()) return alert('Facility name is required');
    setSaving(true);
    setSaved(false);
    try {
      await onSave(form);
      setSaved(true);
      setTimeout(() => setSaved(false), 4000);
    } catch(e) {
      alert(e.message || 'Save failed');
    } finally { setSaving(false); }
  };

  if (loading) return <div className="empty"><span className="spinner"/> Loading facility details…</div>;

  const S = {
    grid2: { display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 },
    grid1: { marginBottom:16 },
    label: { display:'block', fontWeight:600, fontSize:13, color:'#374151', marginBottom:4 },
    input: { width:'100%', padding:'8px 12px', border:'1px solid #d1d5db', borderRadius:6,
             fontSize:14, boxSizing:'border-box', fontFamily:'inherit' },
    select:{ width:'100%', padding:'8px 12px', border:'1px solid #d1d5db', borderRadius:6,
             fontSize:14, boxSizing:'border-box', background:'#fff' },
    card:  { background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:10, padding:20, marginBottom:20 },
    h3:    { margin:'0 0 14px', fontSize:15, fontWeight:700, color:'#0b3d91' },
    badge: { display:'inline-block', padding:'2px 10px', borderRadius:20, fontSize:12,
             background:'#dbeafe', color:'#1d4ed8', marginLeft:8, fontWeight:600 },
  };

  return (
    <div>
      {saved && (
        <div style={{ background:'#d1fae5', border:'1px solid #6ee7b7', borderRadius:8,
                      padding:'10px 16px', marginBottom:16, color:'#065f46', fontWeight:600, fontSize:14,
                      display:'flex', alignItems:'center', gap:8 }}>
          ✅ Hospital details saved successfully! These will now appear on all PDF reports and SHA claim forms.
        </div>
      )}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div>
          <h2 style={{ margin:0, fontSize:18, fontWeight:700 }}>🏥 Hospital / Facility Details</h2>
          <p style={{ margin:'4px 0 0', color:'#64748b', fontSize:13 }}>
            These details appear on all PDF reports and SHA claim forms.
          </p>
        </div>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : '💾 Save Details'}
        </button>
      </div>

      {/* Basic Info */}
      <div style={S.card}>
        <div style={S.h3}>📋 Basic Information</div>
        <div style={S.grid1}>
          <label style={S.label}>Facility Name <span style={{color:'red'}}>*</span></label>
          <input style={S.input} value={form.facility_name}
            onChange={e => set('facility_name', e.target.value)}
            placeholder="e.g. Nairobi Community Hospital" />
        </div>
        <div style={S.grid2}>
          <div>
            <label style={S.label}>Phone</label>
            <input style={S.input} value={form.phone}
              onChange={e => set('phone', e.target.value)}
              placeholder="+254 700 000000" />
          </div>
          <div>
            <label style={S.label}>Email</label>
            <input style={S.input} type="email" value={form.email}
              onChange={e => set('email', e.target.value)}
              placeholder="admin@hospital.co.ke" />
          </div>
        </div>
        <div style={S.grid1}>
          <label style={S.label}>Physical Address</label>
          <textarea style={{ ...S.input, resize:'vertical', minHeight:60 }} value={form.address}
            onChange={e => set('address', e.target.value)}
            placeholder="Street address, building, P.O. Box…" />
        </div>
        <div style={S.grid2}>
          <div>
            <label style={S.label}>County</label>
            <input style={S.input} value={form.county}
              onChange={e => set('county', e.target.value)}
              placeholder="e.g. Nairobi" />
          </div>
          <div>
            <label style={S.label}>Sub-County</label>
            <input style={S.input} value={form.sub_county}
              onChange={e => set('sub_county', e.target.value)}
              placeholder="e.g. Westlands" />
          </div>
        </div>
      </div>

      {/* SHA / NHIF Details */}
      <div style={S.card}>
        <div style={S.h3}>🏛 SHA / NHIF Registration Details</div>
        <p style={{ margin:'0 0 14px', fontSize:13, color:'#64748b' }}>
          Used on claim forms and PDF reports. Ensure these match your SHA portal registration exactly.
        </p>
        <div style={S.grid2}>
          <div>
            <label style={S.label}>SHA Facility Number</label>
            <input style={S.input} value={form.sha_number}
              onChange={e => set('sha_number', e.target.value)}
              placeholder="e.g. SHA/FAC/2024/001234" />
            <div style={{ fontSize:11, color:'#64748b', marginTop:3 }}>
              Your SHA facility registration number
            </div>
          </div>
          <div>
            <label style={S.label}>SHA Facility Code (Billing)</label>
            <input style={S.input} value={form.sha_facility_code}
              onChange={e => set('sha_facility_code', e.target.value)}
              placeholder="e.g. NBI-0042" />
            <div style={{ fontSize:11, color:'#64748b', marginTop:3 }}>
              Short code used on claim line items
            </div>
          </div>
        </div>
        <div style={{ maxWidth:220 }}>
          <label style={S.label}>Facility Level</label>
          <select style={S.select} value={form.facility_level}
            onChange={e => set('facility_level', e.target.value)}>
            <option value="2">Level 2 — Dispensary</option>
            <option value="3">Level 3 — Health Centre</option>
            <option value="4">Level 4 — Sub-district Hospital</option>
            <option value="5">Level 5 — County Referral Hospital</option>
            <option value="6">Level 6 — National Referral Hospital</option>
          </select>
          <div style={{ fontSize:11, color:'#64748b', marginTop:3 }}>
            Determines consultation tariff (CON-04/05)
          </div>
        </div>
      </div>

      {/* Preview */}
      {form.facility_name && (
        <div style={{ ...S.card, background:'#f0f4ff', borderColor:'#bfdbfe' }}>
          <div style={{ ...S.h3, color:'#1d4ed8' }}>👁 PDF Header Preview</div>
          <div style={{ background:'#0b3d91', borderRadius:8, padding:'14px 20px', color:'#fff' }}>
            <div style={{ fontWeight:700, fontSize:17 }}>{form.facility_name}</div>
            {form.address  && <div style={{ fontSize:12, color:'#cfe1ff', marginTop:3 }}>{form.address}</div>}
            {form.phone    && <div style={{ fontSize:12, color:'#cfe1ff' }}>Tel: {form.phone}</div>}
            <div style={{ fontSize:11, color:'#93c5fd', marginTop:6, textAlign:'right' }}>
              {form.sha_number    && <span>SHA No: {form.sha_number}  </span>}
              {form.sha_facility_code && <span>| Code: {form.sha_facility_code}</span>}
            </div>
          </div>
        </div>
      )}

      {/* Bottom Save Button */}
      <div style={{ display:'flex', justifyContent:'flex-end', marginTop:8 }}>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}
          style={{ padding:'10px 28px', fontSize:15 }}>
          {saving ? 'Saving…' : '💾 Save Hospital Details'}
        </button>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   SHA TARIFFS TAB — Manage per-keyword tariff overrides
════════════════════════════════════════════════════════════ */
function TariffsTab({ tariffs, loading, onAdd, onEdit, onDelete,
                      onUploadShaSQL, onShaScheduleRefresh,
                      shaPackages, shaItems, shaSurgical, shaSpecialties, shaScheduleLoaded }) {
  const CATS = ['all','lab','imaging','drug','procedure','consultation'];
  const [catFilter,   setCatFilter]   = useState('all');
  const [search,      setSearch]      = useState('');
  const [editRow,     setEditRow]     = useState(null);
  const [form,        setForm]        = useState({ keyword:'', sha_code:'', description:'', amount_kes:'', category:'lab' });
  const [saving,      setSaving]      = useState(false);
  const [scheduleTab, setScheduleTab] = useState('packages'); // 'packages' | 'items' | 'surgical'
  const [surgSpec,    setSurgSpec]    = useState('all');
  const [schedSearch, setSchedSearch] = useState('');

  const filtered = tariffs.filter(t => {
    if (catFilter !== 'all' && t.category !== catFilter) return false;
    if (search && !t.keyword.includes(search.toLowerCase()) &&
        !(t.description||'').toLowerCase().includes(search.toLowerCase()) &&
        !t.sha_code.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const openAdd = () => {
    setForm({ keyword:'', sha_code:'', description:'', amount_kes:'', category:'lab' });
    setEditRow('new');
  };
  const openEdit = (t) => {
    setForm({ keyword:t.keyword, sha_code:t.sha_code, description:t.description||'', amount_kes:String(t.amount_kes), category:t.category||'lab' });
    setEditRow(t.id);
  };
  const closeForm = () => { setEditRow(null); setForm({ keyword:'', sha_code:'', description:'', amount_kes:'', category:'lab' }); };

  const handleSave = async () => {
    if (!form.keyword.trim()) return alert('Keyword is required');
    if (!form.sha_code.trim()) return alert('SHA code is required');
    if (!form.amount_kes || isNaN(Number(form.amount_kes))) return alert('Valid amount is required');
    setSaving(true);
    try {
      if (editRow === 'new') await onAdd(form);
      else await onEdit(editRow, form);
      closeForm();
    } finally { setSaving(false); }
  };

  const S = {
    inp:  { padding:'7px 11px', border:'1px solid #d1d5db', borderRadius:6, fontSize:13,
            fontFamily:'inherit', width:'100%', boxSizing:'border-box' },
    sel:  { padding:'7px 11px', border:'1px solid #d1d5db', borderRadius:6, fontSize:13,
            background:'#fff', width:'100%', boxSizing:'border-box' },
    card: { background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:10, padding:18, marginBottom:18 },
    catBadge: (cat) => ({
      display:'inline-block', padding:'2px 9px', borderRadius:20, fontSize:11, fontWeight:600,
      background: cat==='lab'?'#dbeafe': cat==='imaging'?'#d1fae5': cat==='drug'?'#fce7f3':
                  cat==='procedure'?'#fef3c7': cat==='consultation'?'#ede9fe':'#f1f5f9',
      color: cat==='lab'?'#1d4ed8': cat==='imaging'?'#065f46': cat==='drug'?'#9d174d':
             cat==='procedure'?'#78350f': cat==='consultation'?'#5b21b6':'#64748b',
    }),
  };

  if (loading) return <div className="empty"><span className="spinner"/> Loading tariffs…</div>;

  // Helpers for SHA schedule display
  const fmtKES = n => `KES ${(+n||0).toLocaleString('en-KE', { minimumFractionDigits:2 })}`;
  const filteredSurgical = (shaSurgical || []).filter(p => {
    if (surgSpec !== 'all' && p.specialty !== surgSpec) return false;
    if (schedSearch && !p.procedure_name.toLowerCase().includes(schedSearch.toLowerCase())) return false;
    return true;
  });
  const filteredItems = (shaItems || []).filter(i =>
    !schedSearch || i.service_name.toLowerCase().includes(schedSearch.toLowerCase())
  );

  return (
    <div>
      {/* ── SHA Tariff SQL Upload Banner ── */}
      <div style={{ background:'linear-gradient(135deg,#0b3d91,#1e40af)', borderRadius:10, padding:'16px 20px',
                    marginBottom:20, color:'#fff', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:12 }}>
        <div>
          <div style={{ fontWeight:700, fontSize:15, marginBottom:4 }}>📋 SHA Tariff Schedule (Social Health Insurance Act No. 16 of 2023)</div>
          <div style={{ fontSize:12, color:'#bfdbfe' }}>
            Upload the <code style={{ background:'rgba(255,255,255,0.15)', padding:'1px 6px', borderRadius:3 }}>sha_tariffs.sql</code> file
            to populate the official tariff schedule. Uploaded tariffs are automatically used in claims calculation.
          </div>
          {shaPackages.length > 0 && (
            <div style={{ fontSize:11, color:'#93c5fd', marginTop:6 }}>
              ✅ Schedule loaded — {shaPackages.length} packages · {shaItems.length} service tariffs · {shaSurgical.length} surgical procedures
            </div>
          )}
          {shaScheduleLoaded && shaPackages.length === 0 && (
            <div style={{ fontSize:11, color:'#fde68a', marginTop:6 }}>
              ⚠️ No schedule data yet — upload sha_tariffs.sql to get started.
            </div>
          )}
        </div>
        <button
          style={{ background:'#fff', color:'#0b3d91', border:'none', borderRadius:7,
                   padding:'9px 18px', fontWeight:700, fontSize:13, cursor:'pointer',
                   display:'flex', alignItems:'center', gap:6, whiteSpace:'nowrap' }}
          onClick={onUploadShaSQL}
        >
          ⬆️ Upload sha_tariffs.sql
        </button>
      </div>

      {/* ── SHA Official Schedule Browser ── */}
      {shaScheduleLoaded && (shaPackages.length > 0 || shaSurgical.length > 0) && (
        <div style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:10, padding:16, marginBottom:20 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
            <div style={{ fontWeight:700, fontSize:14, color:'#0b3d91' }}>📊 Uploaded SHA Schedule</div>
            <div style={{ display:'flex', gap:6 }}>
              {['packages','items','surgical'].map(t => (
                <button key={t}
                  style={{ padding:'5px 12px', borderRadius:6, border:'1px solid #e2e8f0', fontSize:12,
                           background: scheduleTab===t ? '#0b3d91' : '#fff',
                           color: scheduleTab===t ? '#fff' : '#374151', cursor:'pointer', fontWeight:600 }}
                  onClick={() => setScheduleTab(t)}>
                  {t==='packages' ? '📦 Packages' : t==='items' ? '📋 Service Tariffs' : '🔪 Surgical'}
                </button>
              ))}
              <button onClick={onShaScheduleRefresh}
                style={{ padding:'5px 10px', borderRadius:6, border:'1px solid #e2e8f0', fontSize:12,
                         background:'#fff', color:'#64748b', cursor:'pointer' }}>
                🔄
              </button>
            </div>
          </div>

          {/* search for items/surgical */}
          {(scheduleTab === 'items' || scheduleTab === 'surgical') && (
            <div style={{ display:'flex', gap:8, marginBottom:10 }}>
              <input
                style={{ flex:1, padding:'6px 10px', border:'1px solid #d1d5db', borderRadius:6, fontSize:13 }}
                placeholder="Search service name…"
                value={schedSearch} onChange={e => setSchedSearch(e.target.value)} />
              {scheduleTab === 'surgical' && (
                <select
                  style={{ padding:'6px 10px', border:'1px solid #d1d5db', borderRadius:6, fontSize:13, background:'#fff' }}
                  value={surgSpec} onChange={e => setSurgSpec(e.target.value)}>
                  <option value="all">All specialties</option>
                  {shaSpecialties.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              )}
            </div>
          )}

          {/* Packages tab */}
          {scheduleTab === 'packages' && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(260px,1fr))', gap:8 }}>
              {shaPackages.map(pkg => (
                <div key={pkg.id} style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:7, padding:'10px 14px' }}>
                  <div style={{ fontSize:10, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:2 }}>
                    {pkg.fund}
                  </div>
                  <div style={{ fontWeight:600, fontSize:13, color:'#1e293b' }}>{pkg.package}</div>
                  <div style={{ fontSize:11, color:'#94a3b8', marginTop:3 }}>{pkg.item_count} service item{pkg.item_count !== 1 ? 's' : ''}</div>
                </div>
              ))}
            </div>
          )}

          {/* Service tariff items tab */}
          {scheduleTab === 'items' && (
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                <thead>
                  <tr style={{ background:'#f1f5f9' }}>
                    {['Package','Service','Access Point','Amount','Unit','PPM'].map(h => (
                      <th key={h} style={{ padding:'7px 10px', textAlign:'left', fontWeight:700, fontSize:11,
                                          color:'#374151', textTransform:'uppercase', letterSpacing:'0.4px',
                                          borderBottom:'2px solid #e2e8f0', whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.slice(0,100).map((item, i) => (
                    <tr key={item.id} style={{ background: i%2===0 ? '#fff' : '#f8fafc' }}>
                      <td style={{ padding:'6px 10px', borderBottom:'1px solid #f1f5f9', fontSize:11, color:'#64748b', maxWidth:140 }}>
                        {item.package_name}
                      </td>
                      <td style={{ padding:'6px 10px', borderBottom:'1px solid #f1f5f9', maxWidth:240, fontWeight:500 }}>
                        {item.service_name}
                      </td>
                      <td style={{ padding:'6px 10px', borderBottom:'1px solid #f1f5f9', fontSize:11, color:'#64748b', maxWidth:160 }}>
                        {item.access_point || '—'}
                      </td>
                      <td style={{ padding:'6px 10px', borderBottom:'1px solid #f1f5f9', fontWeight:700, color:'#0b3d91', whiteSpace:'nowrap' }}>
                        {item.tariff_amount ? fmtKES(item.tariff_amount) : '—'}
                      </td>
                      <td style={{ padding:'6px 10px', borderBottom:'1px solid #f1f5f9', fontSize:11, color:'#64748b', whiteSpace:'nowrap' }}>
                        {item.tariff_unit || '—'}
                      </td>
                      <td style={{ padding:'6px 10px', borderBottom:'1px solid #f1f5f9', fontSize:11, color:'#64748b' }}>
                        {item.ppm || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredItems.length > 100 && (
                <div style={{ textAlign:'center', padding:10, fontSize:12, color:'#94a3b8' }}>
                  Showing 100 of {filteredItems.length} items. Use search to filter.
                </div>
              )}
            </div>
          )}

          {/* Surgical procedures tab */}
          {scheduleTab === 'surgical' && (
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                <thead>
                  <tr style={{ background:'#f1f5f9' }}>
                    {['Specialty','Procedure','Tariff (KES)'].map(h => (
                      <th key={h} style={{ padding:'7px 10px', textAlign:'left', fontWeight:700, fontSize:11,
                                          color:'#374151', textTransform:'uppercase', letterSpacing:'0.4px',
                                          borderBottom:'2px solid #e2e8f0' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredSurgical.slice(0,200).map((p, i) => (
                    <tr key={p.id} style={{ background: i%2===0 ? '#fff' : '#f8fafc' }}>
                      <td style={{ padding:'6px 10px', borderBottom:'1px solid #f1f5f9', fontSize:11, color:'#64748b' }}>
                        <span style={{ background:'#ede9fe', color:'#5b21b6', padding:'2px 8px',
                                       borderRadius:20, fontSize:10, fontWeight:600 }}>{p.specialty}</span>
                      </td>
                      <td style={{ padding:'6px 10px', borderBottom:'1px solid #f1f5f9', fontWeight:500 }}>
                        {p.procedure_name}
                      </td>
                      <td style={{ padding:'6px 10px', borderBottom:'1px solid #f1f5f9', fontWeight:700, color:'#0b3d91', whiteSpace:'nowrap' }}>
                        {fmtKES(p.tariff_kes)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredSurgical.length > 200 && (
                <div style={{ textAlign:'center', padding:10, fontSize:12, color:'#94a3b8' }}>
                  Showing 200 of {filteredSurgical.length}. Use search or specialty filter to narrow.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Override Tariffs section header ── */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16, flexWrap:'wrap', gap:10 }}>
        <div>
          <h2 style={{ margin:0, fontSize:18, fontWeight:700 }}>💰 Custom Tariff Overrides</h2>
          <p style={{ margin:'4px 0 0', color:'#64748b', fontSize:13 }}>
            Override default tariffs for investigations, drugs, and procedures. Changes apply to new claims immediately.
          </p>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>＋ Add Tariff Override</button>
      </div>

      {/* Add / Edit form */}
      {editRow !== null && (
        <div style={{ ...S.card, borderColor:'#bfdbfe', background:'#eff6ff' }}>
          <div style={{ fontWeight:700, fontSize:14, color:'#1d4ed8', marginBottom:12 }}>
            {editRow === 'new' ? '＋ New Tariff Override' : '✏ Edit Tariff'}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:12 }}>
            <div>
              <label style={{ display:'block', fontSize:12, fontWeight:600, color:'#374151', marginBottom:3 }}>
                Keyword <span style={{color:'red'}}>*</span>
              </label>
              <input style={S.inp} value={form.keyword}
                onChange={e => setForm(f=>({...f, keyword:e.target.value}))}
                placeholder="e.g. u&e, renal function, fbc"
                disabled={editRow !== 'new'} />
              <div style={{ fontSize:11, color:'#64748b', marginTop:2 }}>Lowercase match against test/drug name</div>
            </div>
            <div>
              <label style={{ display:'block', fontSize:12, fontWeight:600, color:'#374151', marginBottom:3 }}>
                SHA Code <span style={{color:'red'}}>*</span>
              </label>
              <input style={S.inp} value={form.sha_code}
                onChange={e => setForm(f=>({...f, sha_code:e.target.value.toUpperCase()}))}
                placeholder="e.g. LAB-010" />
            </div>
            <div>
              <label style={{ display:'block', fontSize:12, fontWeight:600, color:'#374151', marginBottom:3 }}>
                Amount (KES) <span style={{color:'red'}}>*</span>
              </label>
              <input style={S.inp} type="number" min="0" step="0.01" value={form.amount_kes}
                onChange={e => setForm(f=>({...f, amount_kes:e.target.value}))}
                placeholder="e.g. 500" />
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:12, marginBottom:14 }}>
            <div>
              <label style={{ display:'block', fontSize:12, fontWeight:600, color:'#374151', marginBottom:3 }}>Description</label>
              <input style={S.inp} value={form.description}
                onChange={e => setForm(f=>({...f, description:e.target.value}))}
                placeholder="e.g. Urea & Electrolytes Panel" />
            </div>
            <div>
              <label style={{ display:'block', fontSize:12, fontWeight:600, color:'#374151', marginBottom:3 }}>Category</label>
              <select style={S.sel} value={form.category}
                onChange={e => setForm(f=>({...f, category:e.target.value}))}>
                <option value="lab">Lab</option>
                <option value="imaging">Imaging</option>
                <option value="drug">Drug</option>
                <option value="procedure">Procedure</option>
                <option value="consultation">Consultation</option>
              </select>
            </div>
          </div>
          <div style={{ display:'flex', gap:10 }}>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : '💾 Save'}
            </button>
            <button className="btn btn-ghost" onClick={closeForm}>Cancel</button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:14, flexWrap:'wrap' }}>
        <input style={{ ...S.inp, width:220 }} placeholder="🔍 Search keyword, code, description…"
          value={search} onChange={e => setSearch(e.target.value)} />
        <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
          {CATS.map(c => (
            <button key={c} onClick={() => setCatFilter(c)}
              style={{ padding:'4px 12px', borderRadius:20, border:'1px solid',
                       background: catFilter===c ? '#0b3d91' : '#fff',
                       color: catFilter===c ? '#fff' : '#374151',
                       borderColor: catFilter===c ? '#0b3d91' : '#d1d5db',
                       fontSize:12, cursor:'pointer', fontWeight:500 }}>
              {c.charAt(0).toUpperCase()+c.slice(1)}
            </button>
          ))}
        </div>
        <span style={{ fontSize:13, color:'#64748b', marginLeft:'auto' }}>
          {filtered.length} tariff{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      {filtered.length === 0
        ? <div className="empty">No tariffs found.</div>
        : (
          <div style={{ overflowX:'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Keyword</th>
                  <th>SHA Code</th>
                  <th>Description</th>
                  <th>Category</th>
                  <th style={{ textAlign:'right' }}>Amount (KES)</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => (
                  <tr key={t.id}>
                    <td><code style={{ background:'#f1f5f9', padding:'2px 6px', borderRadius:4, fontSize:12 }}>{t.keyword}</code></td>
                    <td><code style={{ color:'#0b3d91', fontWeight:600 }}>{t.sha_code}</code></td>
                    <td style={{ color:'#374151', fontSize:13 }}>{t.description || '—'}</td>
                    <td><span style={S.catBadge(t.category)}>{t.category}</span></td>
                    <td style={{ textAlign:'right', fontWeight:600, fontVariantNumeric:'tabular-nums' }}>
                      {Number(t.amount_kes).toLocaleString('en-KE', { minimumFractionDigits:2 })}
                    </td>
                    <td>
                      <span style={{ fontSize:12, color: t.is_active ? '#16a34a' : '#9ca3af' }}>
                        {t.is_active ? '✓ Active' : '— Off'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display:'flex', gap:6 }}>
                        <button className="btn btn-ghost" style={{ fontSize:12, padding:'3px 10px' }}
                          onClick={() => openEdit(t)}>Edit</button>
                        <button className="btn btn-ghost" style={{ fontSize:12, padding:'3px 10px', color:'#dc2626' }}
                          onClick={() => onDelete(t.id)}>Del</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }

      <div style={{ marginTop:16, padding:12, background:'#fefce8', border:'1px solid #fde68a', borderRadius:8, fontSize:13, color:'#78350f' }}>
        <strong>ℹ Note:</strong> These overrides supplement the built-in tariff table. If a keyword exists in both,
        the override here takes precedence. Keywords are matched case-insensitively against investigation and drug names at claim generation time.
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   EPIDEMIOLOGY DASHBOARD TAB
════════════════════════════════════════════════════════════ */
/* ──────────────────────────────────────────────────────────
   ERROR BOUNDARY — prevents one broken panel crashing the page
────────────────────────────────────────────────────────── */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          background: '#fef2f2', border: '1.5px solid #fca5a5',
          borderRadius: 12, padding: '24px 20px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>⚠️</div>
          <div style={{ fontWeight: 700, color: '#991b1b', marginBottom: 6 }}>
            {this.props.label || 'This panel'} encountered an error
          </div>
          <div style={{ fontSize: 12, color: '#b91c1c', marginBottom: 14, fontFamily: 'monospace' }}>
            {this.state.error?.message}
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              padding: '6px 18px', borderRadius: 8, border: 'none',
              background: '#dc2626', color: '#fff', fontWeight: 600,
              cursor: 'pointer', fontSize: 13,
            }}>
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function EpidemiologyTab({ overview, diagnoses, trends, categories, alerts, doctors, loading, days, onChangeDays }) {
  const [dxSearch, setDxSearch] = useState('');
  const [docSearch, setDocSearch] = useState('');

  const periodOpts = [
    { label: '7 days', val: 7 },
    { label: '30 days', val: 30 },
    { label: '90 days', val: 90 },
    { label: '180 days', val: 180 },
  ];

  /* ── Simple inline bar chart ── */
  const BarChart = ({ data, valueKey, labelKey, color = '#1e6bff' }) => {
    const max = Math.max(...data.map(d => Number(d[valueKey]) || 0), 1);
    return (
      <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
        {data.slice(0, 10).map((d, i) => (
          <div key={i} style={{ display:'grid', gridTemplateColumns:'160px 1fr 48px', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:12, color:'#374151', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}
              title={d[labelKey]}>{d[labelKey]}</span>
            <div style={{ height:18, background:'#f1f5f9', borderRadius:4, overflow:'hidden' }}>
              <div style={{
                height:'100%', width:`${(d[valueKey]/max)*100}%`,
                background: color, borderRadius:4,
                transition:'width .4s ease'
              }}/>
            </div>
            <span style={{ fontSize:12, fontWeight:600, color:'#0f172a', textAlign:'right' }}>{d[valueKey]}</span>
          </div>
        ))}
      </div>
    );
  };

  /* ── Trend sparkline (SVG) with tooltips ── */
  const TrendLine = ({ data, valueKey, color = '#1e6bff' }) => {
    const [tooltip, setTooltip] = useState(null); // { x, y, value, date }
    if (!data.length) return null;
    const vals = data.map(d => Number(d[valueKey]) || 0);
    const max  = Math.max(...vals, 1);
    const W = 320, H = 60, pad = 4;
    const points = vals.map((v, i) => {
      const x = pad + (i / (vals.length - 1 || 1)) * (W - 2 * pad);
      const y = H - pad - (v / max) * (H - 2 * pad);
      return { x, y, v, date: data[i]?.bucket_date || '' };
    });
    const pts = points.map(p => `${p.x},${p.y}`).join(' ');
    return (
      <div style={{ position: 'relative' }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width:'100%', height:60, display:'block' }}
          onMouseLeave={() => setTooltip(null)}>
          <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <polyline points={`${pad},${H-pad} ${pts} ${W-pad},${H-pad}`}
            fill={color} fillOpacity="0.1" stroke="none"/>
          {/* invisible hit-area strips for each data point */}
          {points.map((p, i) => {
            const stripW = (W - 2 * pad) / (points.length || 1);
            return (
              <rect
                key={i}
                x={p.x - stripW / 2}
                y={0}
                width={stripW}
                height={H}
                fill="transparent"
                onMouseEnter={e => {
                  const rect = e.currentTarget.closest('svg').getBoundingClientRect();
                  setTooltip({ svgX: p.x, svgY: p.y, value: p.v, date: p.date });
                }}
              />
            );
          })}
          {/* dot on hovered point */}
          {tooltip && (
            <circle cx={tooltip.svgX} cy={tooltip.svgY} r={4}
              fill={color} stroke="#fff" strokeWidth={1.5}/>
          )}
        </svg>
        {/* floating tooltip box */}
        {tooltip && (
          <div style={{
            position: 'absolute',
            left: `${(tooltip.svgX / W) * 100}%`,
            top: tooltip.svgY < H / 2 ? 44 : -2,
            transform: 'translateX(-50%)',
            background: '#0f172a',
            color: '#fff',
            borderRadius: 6,
            padding: '4px 10px',
            fontSize: 11,
            fontWeight: 600,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            zIndex: 10,
            boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
          }}>
            {tooltip.date && <span style={{ opacity: 0.7, marginRight: 6 }}>{tooltip.date}</span>}
            {tooltip.value.toLocaleString()}
          </div>
        )}
      </div>
    );
  };

  const alertCount = (alerts?.spikes?.length || 0) +
    (alerts?.emergency_48h > 5 ? 1 : 0) +
    (alerts?.high_load_doctors?.length || 0);

  const filteredDx  = diagnoses.filter(d => !dxSearch  || d.diagnosis_name?.toLowerCase().includes(dxSearch.toLowerCase()));
  const filteredDoc = doctors.filter(d  => !docSearch  || d.full_name?.toLowerCase().includes(docSearch.toLowerCase()));

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>

      {/* ── Header ── */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10 }}>
        <div>
          <h2 style={{ margin:0, fontSize:18, fontWeight:700, color:'#0f172a' }}>📊 Epidemiology Dashboard</h2>
          <p style={{ margin:'2px 0 0', fontSize:13, color:'#64748b' }}>Disease surveillance across all clinicians and patients</p>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:13, color:'#64748b' }}>Period:</span>
          {periodOpts.map(p => (
            <button key={p.val}
              onClick={() => onChangeDays(p.val)}
              style={{
                padding:'5px 12px', borderRadius:20, fontSize:12, fontWeight:600, cursor:'pointer',
                border: days===p.val ? '1.5px solid #1e6bff' : '1.5px solid #e2e8f0',
                background: days===p.val ? '#eff6ff' : '#fff',
                color: days===p.val ? '#1e6bff' : '#64748b',
              }}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {loading && <div className="empty"><span className="spinner"/> Loading epidemiology data…</div>}

      {/* ── Alerts ── */}
      {alerts && alertCount > 0 && (
        <div style={{ background:'#fef2f2', border:'1.5px solid #fca5a5', borderRadius:12, padding:'14px 18px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
            <span style={{ fontSize:20 }}>🚨</span>
            <strong style={{ color:'#991b1b', fontSize:15 }}>
              {alertCount} Alert{alertCount>1?'s':''} Detected
            </strong>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {alerts.emergency_48h > 5 && (
              <div style={epiS.alertItem}>
                <span style={epiS.alertBadge('#dc2626')}>🚑 Emergency</span>
                <span style={{ fontSize:13 }}>
                  <strong>{alerts.emergency_48h}</strong> emergency encounters in the last 48 hours — above normal threshold.
                </span>
              </div>
            )}
            {alerts.spikes?.map((s, i) => (
              <div key={i} style={epiS.alertItem}>
                <span style={epiS.alertBadge('#d97706')}>📈 Spike</span>
                <span style={{ fontSize:13 }}>
                  <strong>{s.name}</strong>: {s.recent_count} cases this week
                  {s.prev_count > 0
                    ? ` (↑${s.pct_change}% vs last week)`
                    : ` — first occurrence in tracked period`}
                </span>
              </div>
            ))}
            {alerts.high_load_doctors?.map((d, i) => (
              <div key={i} style={epiS.alertItem}>
                <span style={epiS.alertBadge('#7c3aed')}>👨‍⚕️ Load</span>
                <span style={{ fontSize:13 }}>
                  <strong>{d.full_name}</strong> handling {d.enc_count} encounters this week ({d.load_ratio}× avg load).
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Overview stat cards ── */}
      {overview && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))', gap:12 }}>
          {[
            { ic:'👥', lbl:'Total Patients',        val: overview.total_patients,      bg:'#eff6ff', accent:'#1e6bff' },
            { ic:'🏥', lbl:'Encounters (period)',    val: overview.encounters_with_dx,   bg:'#f0fdf4', accent:'#16a34a' },
            { ic:'📅', lbl:'Last 30 days',           val: overview.encounters_30d,       bg:'#fefce8', accent:'#ca8a04' },
            { ic:'📆', lbl:'Last 7 days',            val: overview.encounters_7d,        bg:'#faf5ff', accent:'#7c3aed' },
            { ic:'🔬', lbl:'Active Patients (30d)',  val: overview.active_patients_30d,  bg:'#fff7ed', accent:'#ea580c' },
            { ic:'🚑', lbl:'Emergencies (30d)',      val: overview.emergency_30d,        bg:'#fef2f2', accent:'#dc2626' },
          ].map((c,i) => (
            <div key={i} style={{ background:c.bg, border:`1.5px solid ${c.accent}33`, borderRadius:12, padding:'14px 16px' }}>
              <div style={{ fontSize:22 }}>{c.ic}</div>
              <div style={{ fontSize:11, color:'#64748b', marginTop:2 }}>{c.lbl}</div>
              <div style={{ fontSize:24, fontWeight:800, color:c.accent }}>{Number(c.val||0).toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Main content grid ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>

        {/* Most Common Diagnoses bar chart */}
        <div style={epiS.card}>
          <div style={epiS.cardHead}>
            <span>🔬 Most Common Diagnoses</span>
            <span style={{ fontSize:12, color:'#64748b' }}>top 10 by cases</span>
          </div>
          {diagnoses.length
            ? <BarChart data={diagnoses} valueKey="case_count" labelKey="diagnosis_name" color="#1e6bff"/>
            : <div className="empty">No diagnosis data for this period.</div>}
        </div>

        {/* Disease category breakdown */}
        <div style={epiS.card}>
          <div style={epiS.cardHead}>
            <span>🗂 Disease Categories</span>
            <span style={{ fontSize:12, color:'#64748b' }}>by frequency</span>
          </div>
          {categories.length
            ? <BarChart data={categories} valueKey="count" labelKey="category" color="#7c3aed"/>
            : <div className="empty">No category data for this period.</div>}
        </div>

        {/* Trend chart */}
        <div style={{ ...epiS.card, gridColumn:'1/-1' }}>
          <div style={epiS.cardHead}>
            <span>📈 Encounter Trends</span>
            <span style={{ fontSize:12, color:'#64748b' }}>encounters over time</span>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
            <div>
              <div style={{ fontSize:12, color:'#64748b', marginBottom:4 }}>Total Encounters</div>
              <TrendLine data={trends} valueKey="encounters" color="#1e6bff"/>
            </div>
            <div>
              <div style={{ fontSize:12, color:'#64748b', marginBottom:4 }}>Emergencies</div>
              <TrendLine data={trends} valueKey="emergencies" color="#dc2626"/>
            </div>
          </div>
          {trends.length > 0 && (
            <div style={{ marginTop:8, display:'flex', gap:24, fontSize:12, color:'#64748b' }}>
              <span>From: {trends[0]?.bucket_date}</span>
              <span>To: {trends[trends.length-1]?.bucket_date}</span>
              <span>Unique patients: {trends.reduce((a,t)=>a+Number(t.unique_patients||0),0).toLocaleString()}</span>
            </div>
          )}
        </div>

      </div>

      {/* ── Continuous Alert Banner for most common diseases ── */}
      {diagnoses.length > 0 && (
        <div style={{ background:'#fff7ed', border:'2px solid #f97316', borderRadius:12, padding:'14px 18px' }}>
          <div style={{ fontWeight:800, color:'#9a3412', fontSize:15, marginBottom:10 }}>
            🔔 Active Disease Surveillance Alerts — All Diagnoses (Count ≥ 1)
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:6, maxHeight:280, overflowY:'auto' }}>
            {diagnoses.map((d, i) => (
              <div key={i} style={{
                display:'flex', alignItems:'center', gap:10, padding:'6px 10px',
                borderRadius:8, background:
                  d.alert_severity === 'critical' ? '#fef2f2' :
                  d.alert_severity === 'high'     ? '#fff7ed' :
                  d.alert_severity === 'medium'   ? '#fffbeb' : '#f8fafc',
                border:`1px solid ${d.alert_severity==='critical'?'#fca5a5':d.alert_severity==='high'?'#fdba74':d.alert_severity==='medium'?'#fcd34d':'#e2e8f0'}`
              }}>
                <span style={{ fontSize:16, minWidth:24 }}>
                  {d.alert_severity==='critical'?'🚨':d.alert_severity==='high'?'⚠️':d.alert_severity==='medium'?'👁️':'📌'}
                </span>
                <span style={{ fontWeight:700, color:'#0f172a', minWidth:180 }}>#{d.rank} {d.diagnosis_name}</span>
                <span style={{ fontSize:12, color:'#374151' }}>{d.case_count} case{d.case_count!==1?'s':''}</span>
                <span style={{ fontSize:11, color:'#64748b', flex:1 }}>{d.alert_level}</span>
                {d.peak_month && <span style={{ fontSize:11, color:'#7c3aed', fontWeight:600 }}>Peak: {d.peak_month}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Detailed diagnoses table ── */}
      <div style={epiS.card}>
        <div style={{ ...epiS.cardHead, marginBottom:12 }}>
          <span>📋 All Diagnoses — Ranked, with Age Groups & Peak Month</span>
          <input
            placeholder="Search diagnosis…"
            value={dxSearch}
            onChange={e=>setDxSearch(e.target.value)}
            style={{ padding:'5px 10px', borderRadius:8, border:'1px solid #e2e8f0', fontSize:13, width:200 }}
          />
        </div>
        <div style={{ marginBottom:10, fontSize:12, color:'#64748b' }}>
          Showing ALL diagnoses (including single occurrences) from ALL clinicians and patients.
        </div>
        {filteredDx.length === 0
          ? <div className="empty">No diagnoses found.</div>
          : (
            <div style={{ overflowX:'auto' }}>
              <table className="table" style={{ fontSize:12 }}>
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Diagnosis</th>
                    <th>ICD-10</th>
                    <th style={{ textAlign:'right' }}>Cases</th>
                    <th style={{ textAlign:'right' }}>Patients</th>
                    <th>Alert</th>
                    <th>Peak Month</th>
                    <th style={{ textAlign:'right' }}>Emerg.</th>
                    <th style={{ textAlign:'right' }}>Avg Age</th>
                    <th title="0–4 / 5–14 / 15–24 / 25–44 / 45–64 / 65+">Age Groups</th>
                    <th style={{ textAlign:'right' }}>♂</th>
                    <th style={{ textAlign:'right' }}>♀</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDx.map((d, i) => (
                    <tr key={i} style={{ background: d.alert_severity==='critical'?'#fff5f5':d.alert_severity==='high'?'#fffbf5':undefined }}>
                      <td style={{ color:'#94a3b8', fontWeight:700, fontSize:13 }}>#{d.rank||i+1}</td>
                      <td style={{ fontWeight:700, color:'#0f172a' }}>{d.diagnosis_name}</td>
                      <td><code style={{ fontSize:10, background:'#f1f5f9', padding:'2px 4px', borderRadius:4 }}>{d.icd10||'—'}</code></td>
                      <td style={{ textAlign:'right', fontWeight:800, color:'#1e6bff', fontSize:14 }}>{d.case_count}</td>
                      <td style={{ textAlign:'right' }}>{d.patient_count}</td>
                      <td>
                        <span style={{
                          fontSize:10, fontWeight:700, padding:'2px 6px', borderRadius:8,
                          background: d.alert_severity==='critical'?'#fee2e2':d.alert_severity==='high'?'#fde8d8':d.alert_severity==='medium'?'#fef9c3':'#f1f5f9',
                          color: d.alert_severity==='critical'?'#b91c1c':d.alert_severity==='high'?'#9a3412':d.alert_severity==='medium'?'#713f12':'#475569',
                        }}>
                          {d.alert_severity==='critical'?'🚨 HIGH ALERT':d.alert_severity==='high'?'⚠️ WARNING':d.alert_severity==='medium'?'👁 WATCH':'📌 NOTE'}
                        </span>
                      </td>
                      <td style={{ fontSize:11, color:'#7c3aed', fontWeight:600 }}>{d.peak_month||'—'}</td>
                      <td style={{ textAlign:'right', color: d.emergency_count>0?'#dc2626':'#9ca3af', fontWeight: d.emergency_count>0?700:400 }}>
                        {d.emergency_count > 0 ? `🚑 ${d.emergency_count}` : '—'}
                      </td>
                      <td style={{ textAlign:'right' }}>{d.avg_age ?? '—'}</td>
                      <td style={{ fontSize:10, color:'#475569', whiteSpace:'nowrap' }}>
                        {[
                          d.age_0_4   > 0 ? `<5: ${d.age_0_4}`    : null,
                          d.age_5_14  > 0 ? `5-14: ${d.age_5_14}` : null,
                          d.age_15_24 > 0 ? `15-24: ${d.age_15_24}`:null,
                          d.age_25_44 > 0 ? `25-44: ${d.age_25_44}`:null,
                          d.age_45_64 > 0 ? `45-64: ${d.age_45_64}`:null,
                          d.age_65plus > 0? `65+: ${d.age_65plus}` : null,
                        ].filter(Boolean).join(' | ') || '—'}
                      </td>
                      <td style={{ textAlign:'right' }}>{d.male_count}</td>
                      <td style={{ textAlign:'right' }}>{d.female_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
        <div style={{ marginTop:12, fontSize:12, color:'#94a3b8' }}>
          All diagnoses from all clinicians and patients — including single occurrences. Age groups: under 5, 5–14, 15–24, 25–44, 45–64, 65+.
        </div>
      </div>

      {/* ── Per-doctor breakdown ── */}
      <div style={epiS.card}>
        <div style={{ ...epiS.cardHead, marginBottom:12 }}>
          <span>👨‍⚕️ Activity by Clinician</span>
          <input
            placeholder="Search clinician…"
            value={docSearch}
            onChange={e=>setDocSearch(e.target.value)}
            style={{ padding:'5px 10px', borderRadius:8, border:'1px solid #e2e8f0', fontSize:13, width:200 }}
          />
        </div>
        {filteredDoc.length === 0
          ? <div className="empty">No clinician data found.</div>
          : (
            <div style={{ overflowX:'auto' }}>
              <table className="table" style={{ fontSize:13 }}>
                <thead>
                  <tr>
                    <th>Clinician</th>
                    <th>Specialty</th>
                    <th style={{ textAlign:'right' }}>Encounters</th>
                    <th style={{ textAlign:'right' }}>With Dx</th>
                    <th style={{ textAlign:'right' }}>Emergencies</th>
                    <th style={{ textAlign:'right' }}>Patients</th>
                    <th>Dx Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDoc.map((d, i) => {
                    const dxRate = d.encounters > 0 ? Math.round((d.encounters_dx/d.encounters)*100) : 0;
                    return (
                      <tr key={i}>
                        <td style={{ fontWeight:600 }}>{d.full_name}</td>
                        <td style={{ color:'#64748b', fontSize:12 }}>{d.specialty||'—'}</td>
                        <td style={{ textAlign:'right', fontWeight:700 }}>{d.encounters}</td>
                        <td style={{ textAlign:'right' }}>{d.encounters_dx}</td>
                        <td style={{ textAlign:'right', color: d.emergencies>0?'#dc2626':'#9ca3af', fontWeight: d.emergencies>0?700:400 }}>
                          {d.emergencies > 0 ? `🚑 ${d.emergencies}` : '—'}
                        </td>
                        <td style={{ textAlign:'right' }}>{d.unique_patients}</td>
                        <td>
                          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                            <div style={{ flex:1, height:8, background:'#f1f5f9', borderRadius:4, overflow:'hidden' }}>
                              <div style={{ height:'100%', width:`${dxRate}%`, background:'#16a34a', borderRadius:4 }}/>
                            </div>
                            <span style={{ fontSize:11, color:'#16a34a', fontWeight:600, minWidth:32 }}>{dxRate}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        }
      </div>

    </div>
  );
}

const epiS = {
  card: {
    background:'#fff', border:'1px solid #e2e8f0', borderRadius:12, padding:'16px 18px',
  },
  cardHead: {
    display:'flex', justifyContent:'space-between', alignItems:'center',
    marginBottom:14, fontWeight:700, fontSize:14, color:'#0f172a',
  },
  alertItem: {
    display:'flex', alignItems:'flex-start', gap:10, padding:'8px 12px',
    background:'#fff', borderRadius:8, border:'1px solid #fecaca',
  },
  alertBadge: (color) => ({
    background: color, color:'#fff', fontSize:11, fontWeight:700, padding:'2px 8px',
    borderRadius:20, whiteSpace:'nowrap', flexShrink:0,
  }),
};

/* ── Admin login screen styles ── */
const adminLoginS = {
  wrap: {
    minHeight: '100vh', display: 'grid', placeItems: 'center',
    background: 'linear-gradient(135deg, #0b3d91 0%, #1e6bff 100%)',
    padding: '24px 16px', position: 'relative',
  },
  card: {
    background: '#fff', borderRadius: 20, padding: '40px 36px',
    width: '100%', maxWidth: 400,
    boxShadow: '0 24px 80px rgba(0,0,0,.25)',
  },
  shieldWrap: { textAlign: 'center', marginBottom: 16 },
  shield: { fontSize: 48 },
  title: { fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 24, fontWeight: 800, textAlign: 'center', margin: '0 0 6px' },
  sub: { fontSize: 14, color: '#64748b', textAlign: 'center', margin: '0 0 24px' },
  err: { background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', padding: '10px 12px', borderRadius: 10, fontSize: 13, marginBottom: 14 },
  divider: { display: 'flex', alignItems: 'center', gap: 10, margin: '16px 0' },
  divLine: { flex: 1, height: 1, background: '#e2e8f0' },
  divTxt: { fontSize: 12, color: '#94a3b8', whiteSpace: 'nowrap' },
  langSwitcher: { position: 'absolute', top: 16, right: 20, zIndex: 200 },
  langBtn: {
    display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px',
    background: 'rgba(255,255,255,.15)', border: '1px solid rgba(255,255,255,.3)',
    borderRadius: 20, cursor: 'pointer', color: '#fff',
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
    padding: '9px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: '#0f172a',
  },
  langItemActive: { background: '#eff6ff', color: '#1e6bff', fontWeight: 600 },
  backdrop: { position: 'fixed', inset: 0, zIndex: 199 },
};
