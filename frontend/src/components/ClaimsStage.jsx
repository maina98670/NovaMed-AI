/**
 * ClaimsStage.jsx
 * ================
 * Shown after encounter close. Doctor reviews the auto-generated claim,
 * edits any line item, confirms SHA member number, then marks as submitted.
 *
 * Add to EncounterPage.jsx:
 *   import ClaimsStage from '../components/ClaimsStage';
 *   // Inside the 'closed' status block:
 *   <ClaimsStage encounterId={encounter.id} />
 */

import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';

/* ─── tiny helpers ─── */
const fmt = (n) => `KES ${Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;
const PACKAGES = {
  PCB:  { label: 'Primary Care (PCB)',      color: '#1D9E75', bg: '#E1F5EE' },
  CIB:  { label: 'Common Illness (CIB)',    color: '#185FA5', bg: '#E6F1FB' },
  CICB: { label: 'Chronic Illness (CICB)', color: '#854F0B', bg: '#FAEEDA' },
  ECMB: { label: 'Emergency/Maternal',     color: '#A32D2D', bg: '#FCEBEB' },
  MSB:  { label: 'Major Surgery (MSB)',     color: '#533AB7', bg: '#EEEDFE' },
};
const STATUS_COLORS = {
  draft:     { color: '#5F5E5A', bg: '#F1EFE8' },
  submitted: { color: '#185FA5', bg: '#E6F1FB' },
  paid:      { color: '#0F6E56', bg: '#E1F5EE' },
  rejected:  { color: '#A32D2D', bg: '#FCEBEB' },
};
const SCHEME_META = {
  SHA:     { label: 'SHA',             color: '#0F6E56', bg: '#E1F5EE', icon: '🏛',  payerLabel: 'SHA Payable' },
  NHIF:    { label: 'NHIF (legacy)',   color: '#185FA5', bg: '#E6F1FB', icon: '🏦',  payerLabel: 'NHIF Payable' },
  PRIVATE: { label: 'Private Insurer', color: '#533AB7', bg: '#EEEDFE', icon: '🛡️', payerLabel: 'Insurer Payable' },
  CASH:    { label: 'Cash / Self-pay', color: '#854F0B', bg: '#FAEEDA', icon: '💵',  payerLabel: 'Amount Due' },
};

export default function ClaimsStage({ encounterId }) {
  const [claim, setClaim]       = useState(null);
  const [loading, setLoading]   = useState(false);
  const [building, setBuilding] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState(null);
  const [toast, setToast]       = useState(null);
  const [editItem, setEditItem] = useState(null); // index of line item being edited
  const [subRef, setSubRef]     = useState('');
  const [showSubmitModal, setShowSubmitModal] = useState(false);

  // Derive scheme from claim (or default)
  const schemeKey  = claim?.scheme_type || 'SHA';
  const schemeMeta = SCHEME_META[schemeKey] || SCHEME_META.SHA;

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  /* Fetch existing claim or show "Build" button */
  const loadClaim = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get(`/api/claims/encounter/${encounterId}`);
      if (data.ok) setClaim(data.claim);
    } catch (e) {
      if (e.status !== 404) setError('Failed to load claim');
    } finally { setLoading(false); }
  }, [encounterId]);

  useEffect(() => { loadClaim(); }, [loadClaim]);

  /* Build claim from encounter */
  const buildClaim = async () => {
    setBuilding(true); setError(null);
    try {
      const data = await api.post(`/api/claims/build/${encounterId}`, {});
      if (data.ok) { setClaim(data.claim); showToast('Claim pre-filled successfully'); }
    } catch (e) { setError('Failed to build claim. Check facility config.'); }
    finally { setBuilding(false); }
  };

  /* Patch field on the claim */
  const patchClaim = async (updates) => {
    setSaving(true);
    try {
      const data = await api.patch(`/api/claims/${claim.id}`, updates);
      if (data.ok) { setClaim(data.claim); showToast('Saved'); }
    } catch (_) { showToast('Save failed', 'error'); }
    finally { setSaving(false); }
  };

  /* Recalculate totals from line items */
  const recalcTotals = (items) => {
    const sum = (type) => items.filter(i => i.type === type).reduce((a, i) => a + (i.total || 0), 0);
    return {
      consultation_fee:  sum('consultation'),
      drugs_total:       sum('drug'),
      labs_total:        sum('lab'),
      imaging_total:     sum('imaging'),
      procedures_total:  sum('procedure'),
      other_charges:     sum('other'),
      line_items:        items,
    };
  };

  /* Print SHA Tariff Summary */
  const printShaTariff = (claimData, items) => {
    const fmt = n => `KES ${(+n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;
    const grandTotal = items.reduce((a, i) => a + (i.total || 0), 0);
    const date = new Date(claimData.encounter_date || claimData.created_at || Date.now())
      .toLocaleDateString('en-KE', { day:'2-digit', month:'long', year:'numeric' });

    const rows = items.map(item => `
      <tr>
        <td>${item.type?.toUpperCase() || ''}</td>
        <td>${item.description || ''}</td>
        <td><code>${item.sha_code || '—'}</code></td>
        <td style="text-align:center">${item.quantity || 1}</td>
        <td style="text-align:right">${(item.unit_cost || 0).toLocaleString()}</td>
        <td style="text-align:right;font-weight:600">${(item.total || 0).toLocaleString()}</td>
      </tr>`).join('');

    const html = `<!DOCTYPE html>
<html><head><title>SHA Tariff — ${claimData.patient_name || ''}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 13px; color: #111; margin: 0; padding: 20px; }
  .header { background: #0b3d91; color: #fff; padding: 16px 20px; border-radius: 6px; margin-bottom: 16px; }
  .header h1 { margin: 0; font-size: 18px; }
  .header p  { margin: 4px 0 0; font-size: 11px; color: #bfdbfe; }
  .meta { display: flex; gap: 32px; margin-bottom: 16px; }
  .meta div { font-size: 12px; }
  .meta b { display: block; color: #374151; font-size: 11px; text-transform: uppercase; letter-spacing: .5px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  th { background: #f1f5f9; color: #374151; font-size: 11px; text-transform: uppercase;
       padding: 7px 10px; text-align: left; border-bottom: 2px solid #e2e8f0; }
  td { padding: 7px 10px; border-bottom: 1px solid #f1f5f9; font-size: 12px; vertical-align: top; }
  tr:last-child td { border-bottom: none; }
  code { background: #eff6ff; color: #1d4ed8; padding: 2px 6px; border-radius: 3px; font-size: 11px; }
  .totals { margin-left: auto; width: 320px; }
  .totals td { padding: 5px 10px; }
  .sha-box { background: #0b3d91; color: #fff; border-radius: 6px; padding: 12px 18px;
              display: flex; justify-content: space-between; align-items: center; margin-top: 10px; }
  .sha-box .label { font-size: 11px; color: #93c5fd; text-transform: uppercase; }
  .sha-box .amount { font-size: 22px; font-weight: 800; }
  .footer { margin-top: 24px; font-size: 10px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 10px; }
  @media print { body { padding: 10px; } .no-print { display: none; } }
</style></head>
<body>
  <div class="header">
    <h1>${claimData.facility_name || 'NovaMed Health Facility'}</h1>
    <p>SHA / NHIF TARIFF CLAIM SUMMARY &nbsp;·&nbsp; Encounter #${claimData.encounter_id || claimData.id || '—'}</p>
    ${claimData.sha_facility_code ? `<p>Facility Code: ${claimData.sha_facility_code}</p>` : ''}
  </div>
  <div class="meta">
    <div><b>Patient</b>${claimData.patient_name || '—'}</div>
    <div><b>SHA Member No.</b>${claimData.sha_member_no || '—'}</div>
    <div><b>Date</b>${date}</div>
    <div><b>Doctor</b>${claimData.doctor_name || '—'}</div>
    <div><b>Benefit Package</b>${claimData.benefit_package || '—'}</div>
    <div><b>ICD-10</b>${claimData.primary_icd10 || '—'}</div>
  </div>
  <table>
    <thead><tr>
      <th>Type</th><th>Description</th><th>SHA Code</th>
      <th style="text-align:center">Qty</th>
      <th style="text-align:right">Unit (KES)</th>
      <th style="text-align:right">Total (KES)</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <table class="totals">
    <tr><td>Consultation</td><td style="text-align:right">${fmt(claimData.consultation_fee)}</td></tr>
    <tr><td>Drugs</td><td style="text-align:right">${fmt(claimData.drugs_total)}</td></tr>
    <tr><td>Labs</td><td style="text-align:right">${fmt(claimData.labs_total)}</td></tr>
    <tr><td>Imaging</td><td style="text-align:right">${fmt(claimData.imaging_total)}</td></tr>
    <tr><td>Procedures</td><td style="text-align:right">${fmt(claimData.procedures_total)}</td></tr>
    <tr style="font-weight:700;border-top:2px solid #e2e8f0">
      <td>Grand Total</td><td style="text-align:right">${fmt(grandTotal)}</td></tr>
  </table>
  <div class="sha-box">
    <div><div class="label">SHA Payable</div><div class="amount">${fmt(claimData.sha_payable)}</div></div>
    <div style="font-size:28px">🏛</div>
  </div>
  <div class="footer">
    Generated by NovaMed AI &nbsp;·&nbsp; Social Health Insurance Act No. 16 of 2023 Tariff Schedule &nbsp;·&nbsp; ${new Date().toLocaleString('en-KE')}
    ${claimData.submission_ref ? `<br>SHA Portal Ref: ${claimData.submission_ref}` : ''}
  </div>
  <div class="no-print" style="margin-top:20px;text-align:center">
    <button onclick="window.print()" style="padding:10px 28px;background:#0b3d91;color:#fff;border:none;border-radius:6px;font-size:14px;cursor:pointer">
      🖨️ Print / Save PDF
    </button>
    &nbsp;
    <button onclick="window.close()" style="padding:10px 20px;background:#f1f5f9;border:none;border-radius:6px;font-size:14px;cursor:pointer">
      Close
    </button>
  </div>
</body></html>`;

    const w = window.open('', '_blank', 'width=900,height=700');
    if (w) { w.document.write(html); w.document.close(); w.focus(); }
  };

  const updateLineItem = (idx, field, value) => {
    const items = [...(claim.line_items || [])];
    items[idx] = { ...items[idx], [field]: field === 'quantity' || field === 'unit_cost' ? parseFloat(value) || 0 : value };
    if (field === 'quantity' || field === 'unit_cost') {
      items[idx].total = +(items[idx].quantity * items[idx].unit_cost).toFixed(2);
    }
    const totals = recalcTotals(items);
    const grand = Object.values(totals).filter(v => typeof v === 'number').reduce((a, b) => a + b, 0);
    patchClaim({ ...totals, sha_payable: grand, patient_copay: 0 });
    setClaim(c => ({ ...c, ...totals, grand_total: grand }));
  };

  const removeLineItem = (idx) => {
    const items = (claim.line_items || []).filter((_, i) => i !== idx);
    const totals = recalcTotals(items);
    const grand = Object.values(totals).filter(v => typeof v === 'number').reduce((a, b) => a + b, 0);
    patchClaim({ ...totals, sha_payable: grand, patient_copay: 0 });
    setClaim(c => ({ ...c, ...totals, grand_total: grand }));
  };

  const addLineItem = () => {
    const newItem = { type: 'other', description: 'New item', quantity: 1, unit_cost: 0, total: 0 };
    const items = [...(claim.line_items || []), newItem];
    patchClaim({ line_items: items });
    setClaim(c => ({ ...c, line_items: items }));
  };

  /* Submit */
  const submitClaim = async () => {
    if (!subRef.trim()) return showToast('Enter the SHA portal reference number', 'error');
    try {
      const data = await api.post(`/api/claims/${claim.id}/submit`, { submission_ref: subRef });
      if (data.ok) { setClaim(data.claim); setShowSubmitModal(false); showToast('Claim marked as submitted'); }
    } catch (_) { showToast('Submission failed', 'error'); }
  };

  /* ── Render states ── */
  if (loading) return <div style={s.loading}>Loading claim…</div>;

  if (!claim) return (
    <div style={s.empty}>
      <div style={s.emptyIcon}>🏥</div>
      <div style={s.emptyTitle}>No claim generated yet</div>
      <div style={s.emptyDesc}>Build a pre-filled claim from this encounter's diagnoses, medications, and investigations. The claim type adapts to the patient's payment method.</div>
      {error && <div style={s.errorBanner}>{error}</div>}
      <button style={s.buildBtn} onClick={buildClaim} disabled={building}>
        {building ? 'Building claim…' : 'Generate Claim →'}
      </button>
    </div>
  );

  const pkg = PACKAGES[claim.benefit_package] || PACKAGES.PCB;
  const statusStyle = STATUS_COLORS[claim.status] || STATUS_COLORS.draft;
  const lineItems = claim.line_items || [];
  const grandTotal = lineItems.reduce((a, i) => a + (i.total || 0), 0);

  return (
    <div style={s.root}>
      {/* Toast */}
      {toast && (
        <div style={{ ...s.toast, background: toast.type === 'error' ? '#FCEBEB' : '#E1F5EE',
          color: toast.type === 'error' ? '#A32D2D' : '#0F6E56' }}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={s.header}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h2 style={s.headerTitle}>
              {schemeMeta.icon}&nbsp;
              {schemeKey === 'SHA'  ? 'SHA Claim' :
               schemeKey === 'NHIF' ? 'NHIF Claim' :
               schemeKey === 'PRIVATE' ? 'Insurance Claim' :
               'Cash Invoice'}
            </h2>
            <span style={{ ...s.badge, background: schemeMeta.bg, color: schemeMeta.color }}>
              {schemeMeta.label}
            </span>
          </div>
          <div style={s.headerSub}>{claim.facility_name || 'Facility'} · Encounter #{encounterId}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ ...s.badge, background: statusStyle.bg, color: statusStyle.color }}>
            {claim.status.charAt(0).toUpperCase() + claim.status.slice(1)}
          </span>
          <button
            style={{ ...s.submitBtn, background:'#0f766e', borderColor:'#0f766e' }}
            onClick={() => printShaTariff(claim, lineItems)}
            title="Print Claim Summary"
          >
            🖨️ Print Summary
          </button>
          {claim.status === 'draft' && (
            <button style={s.submitBtn} onClick={() => setShowSubmitModal(true)}>
              {schemeKey === 'CASH' ? 'Mark as Paid →' : 'Submit Claim →'}
            </button>
          )}
        </div>
      </div>

      {/* Two-column: patient info + claim summary */}
      <div style={s.grid2}>
        {/* Patient & provider */}
        <div style={s.card}>
          <div style={s.cardLabel}>Patient & Payment</div>
          <InfoRow label="Patient name" value={claim.patient_name} />

          {/* SHA fields */}
          {schemeKey === 'SHA' && (
            <InfoRow label="SHA Member No"
              value={
                claim.status === 'draft'
                  ? <input style={s.inlineInput}
                      defaultValue={claim.sha_member_no || ''}
                      placeholder="e.g. SHA-1234567"
                      onBlur={e => patchClaim({ sha_member_no: e.target.value })} />
                  : (claim.sha_member_no || '—')
              }
            />
          )}

          {/* NHIF fields */}
          {schemeKey === 'NHIF' && (
            <InfoRow label="NHIF No"
              value={
                claim.status === 'draft'
                  ? <input style={s.inlineInput}
                      defaultValue={claim.nhif_no || ''}
                      placeholder="e.g. 0012345678"
                      onBlur={e => patchClaim({ nhif_no: e.target.value })} />
                  : (claim.nhif_no || '—')
              }
            />
          )}

          {/* Private insurance fields */}
          {schemeKey === 'PRIVATE' && (<>
            <InfoRow label="Insurance Provider"
              value={
                claim.status === 'draft'
                  ? <select style={{ ...s.inlineInput, minWidth: 160 }}
                      defaultValue={claim.insurance_provider || ''}
                      onBlur={e => patchClaim({ insurance_provider: e.target.value })}>
                      <option value="">— Select —</option>
                      {['AAR','JUBILEE','CIC','BRITAM','APA','MADISON','RESOLUTION','HERITAGE','GA','SANLAM','PACIS','OTHER']
                        .map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  : (claim.insurance_provider || '—')
              }
            />
            <InfoRow label="Policy / Member No"
              value={
                claim.status === 'draft'
                  ? <input style={s.inlineInput}
                      defaultValue={claim.insurance_policy_no || ''}
                      placeholder="e.g. JUB-00123456"
                      onBlur={e => patchClaim({ insurance_policy_no: e.target.value })} />
                  : (claim.insurance_policy_no || '—')
              }
            />
            <InfoRow label="Member Name"
              value={
                claim.status === 'draft'
                  ? <input style={s.inlineInput}
                      defaultValue={claim.insurance_member_name || ''}
                      placeholder="Name on policy"
                      onBlur={e => patchClaim({ insurance_member_name: e.target.value })} />
                  : (claim.insurance_member_name || claim.patient_name || '—')
              }
            />
          </>)}

          {/* Cash — no extra fields needed */}
          {schemeKey === 'CASH' && (
            <InfoRow label="Payment method" value="Cash / Self-pay" />
          )}

          <InfoRow label="Payment scheme" value={schemeMeta.label} />
          <InfoRow label="Doctor"  value={claim.doctor_name || '—'} />
          <InfoRow label="Date"    value={new Date(claim.encounter_date || claim.created_at).toLocaleDateString('en-KE')} />
          {claim.sha_facility_code && (
            <InfoRow label="Facility code" value={claim.sha_facility_code} />
          )}
        </div>

        {/* Claim summary */}
        <div style={s.card}>
          <div style={s.cardLabel}>Claim summary</div>
          <div style={{ ...s.pkgBadge, background: pkg.bg, color: pkg.color }}>
            {pkg.label}
          </div>
          <InfoRow label="Primary ICD-10"   value={claim.primary_icd10 || '—'} mono />
          <InfoRow label="Consultation"     value={fmt(claim.consultation_fee)} />
          <InfoRow label="Drugs"            value={fmt(claim.drugs_total)} />
          <InfoRow label="Investigations"   value={fmt((+claim.labs_total || 0) + (+claim.imaging_total || 0))} />
          <InfoRow label="Procedures"       value={fmt(claim.procedures_total)} />
          {(+claim.bed_charges || 0) > 0 && <InfoRow label="Bed charges" value={fmt(claim.bed_charges)} />}
          <div style={s.divider} />
          <InfoRow label="Grand total"      value={fmt(grandTotal)} bold />
          <InfoRow label={schemeMeta.payerLabel} value={fmt(claim.sha_payable)} bold green />
          <InfoRow label="Patient copay"    value={fmt(claim.patient_copay)} />
          {claim.submission_ref && <InfoRow label="Ref no" value={claim.submission_ref} mono />}
        </div>
      </div>

      {/* SHA Tariff Breakdown summary */}
      <div style={s.card}>
        <div style={{ ...s.cardLabel, marginBottom:10 }}>SHA Tariff Breakdown</div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(140px, 1fr))', gap:10, marginBottom:12 }}>
          {[
            { label:'Consultation', value: claim.consultation_fee, color:'#3b82f6' },
            { label:'Drugs',        value: claim.drugs_total,      color:'#8b5cf6' },
            { label:'Labs',         value: claim.labs_total,       color:'#10b981' },
            { label:'Imaging',      value: claim.imaging_total,    color:'#f59e0b' },
            { label:'Procedures',   value: claim.procedures_total, color:'#ef4444' },
            { label:'Bed charges',  value: claim.bed_charges,      color:'#64748b' },
          ].filter(r => (+r.value || 0) > 0).map(r => (
            <div key={r.label} style={{
              background: '#f8fafc', border: `2px solid ${r.color}22`,
              borderRadius: 8, padding: '10px 14px',
            }}>
              <div style={{ fontSize:11, color:'#64748b', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.5px' }}>
                {r.label}
              </div>
              <div style={{ fontSize:17, fontWeight:700, color: r.color, marginTop:4 }}>
                {fmt(r.value)}
              </div>
            </div>
          ))}
        </div>
        {/* Payer payable prominent box */}
        <div style={{ display:'flex', gap:10, alignItems:'stretch' }}>
          <div style={{
            flex:1,
            background: schemeKey === 'CASH' ? '#92400e' : schemeKey === 'PRIVATE' ? '#533AB7' : '#0b3d91',
            borderRadius:8, padding:'12px 16px',
            display:'flex', justifyContent:'space-between', alignItems:'center',
          }}>
            <div>
              <div style={{ color:'#c7d9ff', fontSize:11, fontWeight:600, textTransform:'uppercase' }}>{schemeMeta.payerLabel}</div>
              <div style={{ color:'#fff', fontSize:22, fontWeight:800, marginTop:2 }}>{fmt(claim.sha_payable)}</div>
            </div>
            <div style={{ color:'#c7d9ff', fontSize:28 }}>{schemeMeta.icon}</div>
          </div>
          {(+claim.patient_copay || 0) > 0 && (
            <div style={{
              background:'#fef3c7', border:'1px solid #fde68a', borderRadius:8, padding:'12px 16px',
              display:'flex', flexDirection:'column', justifyContent:'center',
            }}>
              <div style={{ color:'#78350f', fontSize:11, fontWeight:600, textTransform:'uppercase' }}>Patient Co-pay</div>
              <div style={{ color:'#92400e', fontSize:18, fontWeight:700, marginTop:2 }}>{fmt(claim.patient_copay)}</div>
            </div>
          )}
        </div>
      </div>
      <div style={s.card}>
        <div style={{ ...s.cardLabel, marginBottom: 12 }}>Line items</div>
        <div style={s.tableWrap}>
          <table style={s.table}>
            <thead>
              <tr>
                {['Type','Description','SHA Code','Qty','Unit (KES)','Total (KES)',''].map(h => (
                  <th key={h} style={s.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lineItems.map((item, idx) => (
                <tr key={idx} style={{ background: editItem === idx ? 'var(--color-background-secondary)' : 'transparent' }}>
                  <td style={s.td}>
                    <span style={{ ...s.typeBadge, ...typeStyle(item.type) }}>{item.type}</span>
                  </td>
                  <td style={{ ...s.td, maxWidth: 220 }}>
                    {editItem === idx
                      ? <input style={s.inlineInput} defaultValue={item.description}
                          onBlur={e => { updateLineItem(idx, 'description', e.target.value); setEditItem(null); }} />
                      : <span style={{ fontSize: 13 }}>{item.description}</span>
                    }
                  </td>
                  <td style={s.td}>
                    <code style={{ fontSize:11, color:'#0b3d91', background:'#eff6ff', padding:'2px 6px', borderRadius:4 }}>
                      {item.sha_code || '—'}
                    </code>
                  </td>
                  <td style={s.td}>
                    {editItem === idx
                      ? <input style={{ ...s.inlineInput, width: 60, textAlign: 'right' }}
                          type="number" defaultValue={item.quantity}
                          onBlur={e => { updateLineItem(idx, 'quantity', e.target.value); setEditItem(null); }} />
                      : item.quantity
                    }
                  </td>
                  <td style={s.td}>
                    {editItem === idx
                      ? <input style={{ ...s.inlineInput, width: 80, textAlign: 'right' }}
                          type="number" defaultValue={item.unit_cost}
                          onBlur={e => { updateLineItem(idx, 'unit_cost', e.target.value); setEditItem(null); }} />
                      : item.unit_cost?.toLocaleString()
                    }
                  </td>
                  <td style={{ ...s.td, fontWeight: 500 }}>{item.total?.toLocaleString()}</td>
                  <td style={s.td}>
                    {claim.status === 'draft' && (
                      <div style={{ display:'flex', gap:4 }}>
                        <button style={s.iconBtn} onClick={() => setEditItem(editItem === idx ? null : idx)}>✏️</button>
                        <button style={s.iconBtn} onClick={() => removeLineItem(idx)}>🗑</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {claim.status === 'draft' && (
          <button style={s.addItemBtn} onClick={addLineItem}>+ Add line item</button>
        )}
      </div>

      {/* Notes */}
      {claim.status === 'draft' && (
        <div style={s.card}>
          <div style={s.cardLabel}>Notes</div>
          <textarea style={s.textarea} placeholder="Any additional billing notes…"
            defaultValue={claim.notes || ''}
            onBlur={e => patchClaim({ notes: e.target.value })} />
        </div>
      )}

      {/* Submit modal */}
      {showSubmitModal && (
        <div style={s.modalOverlay}>
          <div style={s.modal}>
            <h3 style={{ fontSize: 16, fontWeight: 500, marginBottom: 12 }}>
              {schemeKey === 'CASH'    ? 'Mark invoice as paid' :
               schemeKey === 'PRIVATE' ? 'Submit claim to insurer' :
               schemeKey === 'NHIF'    ? 'Submit claim to NHIF portal' :
               'Submit claim to SHA portal'}
            </h3>
            <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 16 }}>
              {schemeKey === 'CASH'
                ? 'Record the receipt / payment reference to mark this invoice as settled.'
                : schemeKey === 'PRIVATE'
                ? 'After submitting to the insurer\'s portal or agent, paste the claim reference here.'
                : `After uploading this claim on the ${schemeKey === 'NHIF' ? 'NHIF portal' : 'SHA portal (sha.go.ke)'}, paste the reference number here to track it in NovaMed.`}
            </p>
            <div style={s.cardLabel}>
              {schemeKey === 'CASH' ? 'Receipt / payment reference' :
               schemeKey === 'PRIVATE' ? 'Insurer claim reference' :
               schemeKey === 'NHIF' ? 'NHIF portal reference' :
               'SHA portal reference number'}
            </div>
            <input style={{ ...s.inlineInput, width: '100%', marginBottom: 16 }}
              placeholder={
                schemeKey === 'CASH'    ? 'e.g. RCPT-2026-001' :
                schemeKey === 'PRIVATE' ? 'e.g. AAR-CLM-0012345' :
                schemeKey === 'NHIF'    ? 'e.g. NHIF/2026/04/00123' :
                'e.g. SHA/2026/04/00123456'
              }
              value={subRef} onChange={e => setSubRef(e.target.value)} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button style={s.cancelBtn} onClick={() => setShowSubmitModal(false)}>Cancel</button>
              <button style={s.submitBtn} onClick={submitClaim}>
                {schemeKey === 'CASH' ? 'Confirm payment' : 'Confirm submission'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Sub-components ── */
function InfoRow({ label, value, bold, green, mono }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', padding:'5px 0',
      borderBottom:'0.5px solid var(--color-border-tertiary)', alignItems:'center' }}>
      <span style={{ fontSize:12, color:'var(--color-text-secondary)' }}>{label}</span>
      <span style={{ fontSize:13, fontWeight: bold ? 500 : 400, fontFamily: mono ? 'var(--font-mono)' : undefined,
        color: green ? 'var(--color-text-success)' : 'var(--color-text-primary)' }}>
        {value}
      </span>
    </div>
  );
}

function typeStyle(type) {
  const map = {
    consultation: { background:'#E6F1FB', color:'#185FA5' },
    drug:         { background:'#EAF3DE', color:'#3B6D11' },
    lab:          { background:'#FAEEDA', color:'#854F0B' },
    imaging:      { background:'#EEEDFE', color:'#534AB7' },
    procedure:    { background:'#FAECE7', color:'#993C1D' },
    other:        { background:'#F1EFE8', color:'#5F5E5A' },
  };
  return map[type] || map.other;
}

/* ── Styles ── */
const s = {
  root:        { padding: '0 0 40px' },
  loading:     { padding: 32, color: 'var(--color-text-secondary)', fontSize: 14 },
  toast:       { position:'fixed', top:20, right:20, padding:'10px 18px', borderRadius:8,
                 fontSize:13, fontWeight:500, zIndex:9999, boxShadow:'0 2px 8px rgba(0,0,0,.12)' },
  header:      { display:'flex', justifyContent:'space-between', alignItems:'flex-start',
                 marginBottom:20 },
  headerTitle: { fontSize:18, fontWeight:500, margin:0 },
  headerSub:   { fontSize:13, color:'var(--color-text-secondary)', marginTop:3 },
  badge:       { fontSize:12, padding:'3px 10px', borderRadius:12, fontWeight:500 },
  submitBtn:   { padding:'8px 16px', borderRadius:8, background:'var(--color-background-info)',
                 color:'var(--color-text-info)', border:'0.5px solid var(--color-border-info)',
                 fontSize:13, fontWeight:500, cursor:'pointer' },
  cancelBtn:   { padding:'8px 16px', borderRadius:8, background:'transparent',
                 color:'var(--color-text-secondary)', border:'0.5px solid var(--color-border-secondary)',
                 fontSize:13, cursor:'pointer' },
  grid2:       { display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 },
  card:        { background:'var(--color-background-primary)',
                 border:'0.5px solid var(--color-border-tertiary)',
                 borderRadius:'var(--border-radius-lg)', padding:'14px 16px', marginBottom:12 },
  cardLabel:   { fontSize:11, fontWeight:500, textTransform:'uppercase', letterSpacing:'.06em',
                 color:'var(--color-text-tertiary)', marginBottom:8 },
  pkgBadge:    { display:'inline-block', fontSize:12, fontWeight:500, padding:'3px 10px',
                 borderRadius:12, marginBottom:10 },
  divider:     { height:1, background:'var(--color-border-tertiary)', margin:'8px 0' },
  tableWrap:   { overflowX:'auto' },
  table:       { width:'100%', borderCollapse:'collapse', fontSize:13 },
  th:          { textAlign:'left', padding:'6px 8px', fontSize:11, fontWeight:500,
                 color:'var(--color-text-tertiary)', borderBottom:'0.5px solid var(--color-border-tertiary)',
                 textTransform:'uppercase', letterSpacing:'.04em' },
  td:          { padding:'8px', borderBottom:'0.5px solid var(--color-border-tertiary)',
                 verticalAlign:'middle' },
  typeBadge:   { fontSize:11, padding:'2px 7px', borderRadius:10, fontWeight:500 },
  iconBtn:     { background:'none', border:'none', cursor:'pointer', padding:'2px 4px', fontSize:13 },
  addItemBtn:  { marginTop:10, background:'none', border:'0.5px dashed var(--color-border-secondary)',
                 borderRadius:8, padding:'7px 14px', fontSize:13, cursor:'pointer',
                 color:'var(--color-text-secondary)', width:'100%' },
  inlineInput: { border:'0.5px solid var(--color-border-secondary)', borderRadius:6,
                 padding:'4px 8px', fontSize:13, background:'var(--color-background-secondary)',
                 color:'var(--color-text-primary)', outline:'none' },
  textarea:    { width:'100%', border:'0.5px solid var(--color-border-secondary)', borderRadius:8,
                 padding:'8px 10px', fontSize:13, background:'var(--color-background-secondary)',
                 color:'var(--color-text-primary)', resize:'vertical', minHeight:80, outline:'none',
                 boxSizing:'border-box' },
  empty:       { textAlign:'center', padding:'48px 24px' },
  emptyIcon:   { fontSize:36, marginBottom:12 },
  emptyTitle:  { fontSize:16, fontWeight:500, marginBottom:8 },
  emptyDesc:   { fontSize:13, color:'var(--color-text-secondary)', maxWidth:360,
                 margin:'0 auto 20px' },
  errorBanner: { background:'var(--color-background-danger)', color:'var(--color-text-danger)',
                 borderRadius:8, padding:'10px 16px', fontSize:13, marginBottom:16 },
  buildBtn:    { padding:'10px 24px', borderRadius:8, background:'var(--color-background-info)',
                 color:'var(--color-text-info)', border:'0.5px solid var(--color-border-info)',
                 fontSize:14, fontWeight:500, cursor:'pointer' },
  modalOverlay:{ position:'fixed', inset:0, background:'rgba(0,0,0,.4)',
                 display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 },
  modal:       { background:'var(--color-background-primary)', borderRadius:'var(--border-radius-lg)',
                 border:'0.5px solid var(--color-border-secondary)', padding:24,
                 width:440, maxWidth:'90vw' },
};
