/**
 * NovaMed AI — pdfService.js
 * Generates clinical summary PDF including SHA tariff breakdown.
 * Uses pdfkit — no headless browser required.
 */
const PDFDocument = require('pdfkit');

function fmtAge(dob) {
  if (!dob) return '—';
  return Math.floor((Date.now() - new Date(dob)) / 31557600000) + ' yrs';
}
function fmtKes(n) {
  return 'KES ' + Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function buildEncounterPdf(res, { patient, encounter, uploads, doctorName, facility }) {
  const PAGE_W = 595.28; // A4 width in points
  const MARGIN  = 60;
  const CONTENT_W = PAGE_W - MARGIN * 2;

  const doc = new PDFDocument({ size: 'A4', margin: MARGIN });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition',
    `inline; filename="NovaMed-${patient.patient_id}-${encounter.id}.pdf"`);
  doc.pipe(res);

  const facilityName  = facility?.facility_name    || 'NovaMed Health Facility';
  const shaNumber     = facility?.sha_number       || '';
  const shaFacCode    = facility?.sha_facility_code || '';
  const facilityAddr  = facility?.address          || '';
  const facilityPhone = facility?.phone            || '';

  // ── CENTRED Header band ──
  doc.rect(0, 0, PAGE_W, 110).fill('#0b3d91');

  // Facility name — centred
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(20)
     .text(facilityName, MARGIN, 18, { width: CONTENT_W, align: 'center' });

  // Subtitle line — centred
  doc.font('Helvetica').fontSize(10).fillColor('#cfe1ff');
  const subParts = ['Clinical Encounter Summary'];
  if (facilityAddr)  subParts.push(facilityAddr);
  if (facilityPhone) subParts.push(`Tel: ${facilityPhone}`);
  doc.text(subParts.join('  |  '), MARGIN, 42, { width: CONTENT_W, align: 'center' });

  // SHA numbers — centred
  const shaLine = [
    shaNumber   ? `SHA No: ${shaNumber}`           : null,
    shaFacCode  ? `Facility Code: ${shaFacCode}`   : null,
    `Date: ${new Date().toLocaleString('en-KE')}`,
  ].filter(Boolean).join('  |  ');
  doc.fontSize(9).text(shaLine, MARGIN, 58, { width: CONTENT_W, align: 'center' });

  doc.moveDown(4).fillColor('#000');

  // ── CENTRED Patient Info Box ──
  doc.moveDown(0.5);
  const boxY = doc.y;
  doc.rect(MARGIN, boxY, CONTENT_W, 90).fillAndStroke('#f0f4fb', '#c7d2fe');
  doc.fillColor('#000');

  // Two-column patient info inside box
  const col1X = MARGIN + 12, col2X = MARGIN + CONTENT_W / 2 + 6;
  const colW  = CONTENT_W / 2 - 18;
  let ry = boxY + 8;
  const kvInline = (label, val, x, y) => {
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#1e3a8a').text(label + ':', x, y, { width: colW, continued: true });
    doc.font('Helvetica').fillColor('#000').text('  ' + (val || '—'), { width: colW });
  };
  kvInline('Patient ID', patient.patient_id, col1X, ry);
  kvInline('Encounter ID', `#${encounter.id}`, col2X, ry); ry += 14;
  kvInline('Name', patient.full_name, col1X, ry);
  kvInline('Date', new Date(encounter.created_at).toLocaleString('en-KE'), col2X, ry); ry += 14;
  kvInline('Sex / Age', `${patient.sex || '—'} / ${fmtAge(patient.date_of_birth)}`, col1X, ry);
  kvInline('Clinician', doctorName || '—', col2X, ry); ry += 14;
  kvInline('Allergies', patient.allergies || 'None recorded', col1X, ry);
  kvInline('Chronic Conditions', patient.chronic_conditions || 'None', col2X, ry); ry += 14;
  kvInline('Chief Complaint', encounter.chief_complaint || '—', col1X, ry, colW * 2);

  doc.y = boxY + 96;

  // ── History summary ──
  section(doc, 'History Summary', '#0b3d91', MARGIN, CONTENT_W);
  paragraph(doc, encounter.history_summary || '(No history summary recorded.)', MARGIN, CONTENT_W);

  // ── Examination ──
  section(doc, 'Examination Findings', '#0b3d91', MARGIN, CONTENT_W);
  const exam = encounter.examination || {};
  if (exam.vitals) {
    const v = exam.vitals;
    const vitalStr =
      `BP: ${v.systolic||'—'}/${v.diastolic||'—'} mmHg${v.bp_class ? ` (${v.bp_class})` : ''}   ` +
      `HR: ${v.heartRate||'—'} bpm   RR: ${v.respRate||'—'}/min   ` +
      `Temp: ${v.temperature||'—'} °C   SpO₂: ${v.spo2||'—'}%   ` +
      `GCS: ${v.gcs||'—'}   BMI: ${v.bmi||'—'} kg/m²${v.bmi_class ? ` (${v.bmi_class})` : ''}`;
    paragraph(doc, `Vitals: ${vitalStr}`, MARGIN, CONTENT_W);
  }
  if (exam.general) paragraph(doc, `General: ${exam.general}`, MARGIN, CONTENT_W);
  if (exam.systems) paragraph(doc, `Systems: ${exam.systems}`, MARGIN, CONTENT_W);

  // ── Warnings ──
  if (encounter.warnings?.length) {
    section(doc, 'Warnings & Abnormal Signs', '#b00020', MARGIN, CONTENT_W);
    encounter.warnings.forEach(w => {
      doc.fillColor('#b00020').font('Helvetica-Bold').fontSize(10)
         .text(`• [${(w.level||'').toUpperCase()}] ${w.sign}:`, MARGIN, doc.y, { continued: true, width: CONTENT_W })
         .font('Helvetica').fillColor('#000').text(`  ${w.detail || ''}`, { width: CONTENT_W });
    });
  }

  // ── Diagnoses ──
  section(doc, 'Diagnoses', '#0b3d91', MARGIN, CONTENT_W);
  const dx = encounter.diagnoses || {};
  if (dx.chosen?.length) {
    doc.font('Helvetica-Bold').fontSize(10).text('Working Diagnoses:', MARGIN, doc.y, { width: CONTENT_W });
    doc.font('Helvetica');
    dx.chosen.forEach(d => doc.text(`  • ${d}`, MARGIN, doc.y, { width: CONTENT_W }));
  }
  if (dx.provisional?.name) {
    doc.moveDown(0.3);
    doc.font('Helvetica-Bold').fontSize(10).text('Provisional Diagnosis:', MARGIN, doc.y, { width: CONTENT_W });
    doc.font('Helvetica').text(`  ${dx.provisional.name} — ${dx.provisional.likelihood || ''} likelihood (${dx.provisional.percentage || ''}%)`, MARGIN, doc.y, { width: CONTENT_W });
    if (dx.provisional.justification) paragraph(doc, `  Justification: ${dx.provisional.justification}`, MARGIN, CONTENT_W, 9);
    if (dx.provisional.causative_agent && dx.provisional.causative_agent !== '—') {
      paragraph(doc, `  Causative Agent: ${dx.provisional.causative_agent}`, MARGIN, CONTENT_W, 9);
    }
    if (dx.provisional.pathology && dx.provisional.pathology !== '—') {
      paragraph(doc, `  Pathophysiology: ${dx.provisional.pathology}`, MARGIN, CONTENT_W, 9);
    }
  }
  if (dx.differentials_full?.length) {
    doc.moveDown(0.3).font('Helvetica-Bold').fontSize(10).text('Differential Diagnoses:', MARGIN, doc.y, { width: CONTENT_W });
    doc.font('Helvetica');
    dx.differentials_full.forEach((d, i) => {
      doc.text(`  ${i+2}. ${d.name} — ${d.likelihood || ''} (${d.percentage||0}%): ${d.explanation || ''}`, MARGIN, doc.y, { width: CONTENT_W });
    });
  }

  // ── Investigations ──
  section(doc, 'Investigations', '#0b3d91', MARGIN, CONTENT_W);
  const inv = encounter.investigations || {};
  ['labs','imaging','bedside','specialist'].forEach(group => {
    if (inv[group]?.length) {
      doc.font('Helvetica-Bold').fontSize(10).text(group.toUpperCase() + ':', MARGIN, doc.y, { width: CONTENT_W });
      doc.font('Helvetica');
      inv[group].forEach(i => {
        doc.text(`  • ${i.test}`, MARGIN, doc.y, { width: CONTENT_W, continued: true });
        if (i.reason) doc.text(` — WHY: ${i.reason}`, { width: CONTENT_W });
        else doc.text('', { width: CONTENT_W });
        if (i.expected) doc.text(`    Expected: ${i.expected}`, MARGIN, doc.y, { width: CONTENT_W, fontSize: 9 });
      });
    }
  });
  const results = encounter.results || {};
  if (Array.isArray(results.entries) && results.entries.length) {
    doc.moveDown(0.3).font('Helvetica-Bold').fontSize(10).text('Result Interpretations:', MARGIN, doc.y, { width: CONTENT_W });
    doc.font('Helvetica');
    results.entries.forEach(r => {
      doc.text(`  • [${r.kind || 'result'}] ${r.label || ''}`, MARGIN, doc.y, { width: CONTENT_W });
      if (r.interpretation) paragraph(doc, `     ${r.interpretation}`, MARGIN, CONTENT_W, 9);
      if (r.abnormalFindings?.length) {
        r.abnormalFindings.forEach(f => doc.fillColor('#b00020').text(`     ⚠ ${f}`, MARGIN, doc.y, { width: CONTENT_W, fontSize: 9 }).fillColor('#000'));
      }
    });
  }

  // ── Treatment Plan — centred table ──
  section(doc, 'Treatment Plan', '#0b3d91', MARGIN, CONTENT_W);
  const tx = encounter.treatment_plan || {};
  if (tx.medications?.length) {
    // Table header
    const T = { drug: MARGIN, dose: MARGIN+110, route: MARGIN+160, moa: MARGIN+205, ind: MARGIN+310, ci: MARGIN+385, se: MARGIN+460 };
    const hdrY = doc.y;
    doc.rect(MARGIN, hdrY, CONTENT_W, 14).fill('#0b3d91');
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7.5);
    doc.text('Drug',          T.drug,  hdrY+3, { width: 106 });
    doc.text('Dose/Route',    T.dose,  hdrY+3, { width: 80 });
    doc.text('Mechanism',     T.moa,   hdrY+3, { width: 100 });
    doc.text('Indication',    T.ind,   hdrY+3, { width: 70 });
    doc.text('Contraind.',    T.ci,    hdrY+3, { width: 70 });
    doc.text('Side Effects',  T.se,    hdrY+3, { width: 75 });
    doc.moveDown(1.5).fillColor('#000').font('Helvetica').fontSize(8);

    tx.medications.forEach((m, idx) => {
      if (doc.y > 720) { doc.addPage(); doc.y = 60; }
      const rowY = doc.y;
      if (idx % 2 === 0) { doc.rect(MARGIN, rowY - 2, CONTENT_W, 12).fill('#f0f4fb'); doc.fillColor('#000'); }
      if (m.allergy_safe === false) {
        doc.rect(MARGIN, rowY - 2, CONTENT_W, 12).fill('#fef2f2'); doc.fillColor('#000');
      }
      const name = (m.allergy_safe === false ? '⛔ ' : '') + (m.name || '—');
      doc.text(name,                      T.drug,  rowY, { width: 105 });
      doc.text(`${m.dose||'—'} ${m.route||''}`,  T.dose,  rowY, { width: 78 });
      doc.text(m.mechanism_of_action || m.notes?.split('·')[0] || '—', T.moa, rowY, { width: 100 });
      doc.text(m.notes?.split('·')[1] || '—', T.ind,  rowY, { width: 68 });
      doc.text(m.notes?.split('·')[2] || '—', T.ci,   rowY, { width: 68 });
      doc.text(m.notes?.split('·')[3] || '—', T.se,   rowY, { width: 74 });
      doc.moveDown(0.85);
    });
    doc.moveDown(0.3);
  }
  if (tx.immediate?.length) {
    doc.font('Helvetica-Bold').text('Immediate Measures:', MARGIN, doc.y, { width: CONTENT_W }); doc.font('Helvetica');
    tx.immediate.forEach(t => doc.text(`  • ${t}`, MARGIN, doc.y, { width: CONTENT_W }));
  }
  if (tx.non_pharm?.length) {
    doc.font('Helvetica-Bold').text('Non-Pharmacological:', MARGIN, doc.y, { width: CONTENT_W }); doc.font('Helvetica');
    tx.non_pharm.forEach(t => doc.text(`  • ${t}`, MARGIN, doc.y, { width: CONTENT_W }));
  }
  if (tx.monitoring?.length) {
    doc.font('Helvetica-Bold').text('Monitoring:', MARGIN, doc.y, { width: CONTENT_W }); doc.font('Helvetica');
    tx.monitoring.forEach(t => doc.text(`  • ${t}`, MARGIN, doc.y, { width: CONTENT_W }));
  }
  if (tx.follow_up) kv(doc, 'Follow-up', tx.follow_up, MARGIN, CONTENT_W);
  if (tx.patient_advice) {
    doc.moveDown(0.3);
    doc.font('Helvetica-Bold').text('Patient Advice:', MARGIN, doc.y, { width: CONTENT_W });
    doc.font('Helvetica'); paragraph(doc, tx.patient_advice, MARGIN, CONTENT_W);
  }
  if (tx.red_flags?.length) {
    doc.moveDown(0.3);
    doc.font('Helvetica-Bold').fillColor('#b00020').text('Return IMMEDIATELY if:', MARGIN, doc.y, { width: CONTENT_W });
    doc.fillColor('#000').font('Helvetica');
    tx.red_flags.forEach(t => doc.text(`  • ${t}`, MARGIN, doc.y, { width: CONTENT_W }));
  }

  // ── Attached files ──
  if (uploads?.length) {
    section(doc, 'Attached Files', '#0b3d91', MARGIN, CONTENT_W);
    uploads.forEach(u =>
      doc.text(`  • [${u.kind}] ${u.original_name || u.stored_path}${u.abnormal ? '   ⚠ Abnormal findings reported' : ''}`, MARGIN, doc.y, { width: CONTENT_W }));
  }

  // ── Centred sign-off footer ──
  doc.moveDown(1);
  doc.moveTo(MARGIN, doc.y).lineTo(MARGIN + CONTENT_W, doc.y).strokeColor('#0b3d91').lineWidth(0.8).stroke();
  doc.moveDown(0.5);
  doc.font('Helvetica').fontSize(9).fillColor('#374151')
     .text(`Clinician: ${doctorName || '—'}   |   Date: ${new Date().toLocaleString('en-KE')}   |   NovaMed AI Clinical Decision Support`,
       MARGIN, doc.y, { width: CONTENT_W, align: 'center' });
  doc.moveDown(0.3);
  doc.font('Helvetica').fontSize(8).fillColor('#94a3b8')
     .text('This document is a clinical decision support output. Clinician judgment is paramount. Always verify AI-generated content against current guidelines.',
       MARGIN, doc.y, { width: CONTENT_W, align: 'center' });
  doc.fillColor('#000');

  // ════════════════════════════════════════════════════════════
  // SHA TARIFF PAGE
  // ════════════════════════════════════════════════════════════
  if (encounter.claim) {
    const claim = encounter.claim;
    const lineItems = (() => {
      try { return typeof claim.line_items === 'string' ? JSON.parse(claim.line_items) : (claim.line_items || []); }
      catch (_) { return []; }
    })();
    const secIcd = (() => {
      try { return typeof claim.secondary_icd10 === 'string' ? JSON.parse(claim.secondary_icd10) : (claim.secondary_icd10 || []); }
      catch (_) { return []; }
    })();

    doc.addPage();

    // SHA page header band
    doc.rect(0, 0, doc.page.width, 65).fill('#0b3d91');
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(16).text('SHA / NHIF Claim Tariff Summary', 50, 16);
    doc.font('Helvetica').fontSize(9).fillColor('#cfe1ff')
       .text(
         `${facilityName}` +
         `${shaFacCode ? '  |  Code: ' + shaFacCode : ''}` +
         `${shaNumber  ? '  |  SHA No: ' + shaNumber  : ''}`,
         50, 42
       );
    doc.moveDown(4).fillColor('#000');

    // Claim meta
    section(doc, 'Claim Details');
    kv(doc, 'Claim status',    (claim.status || 'draft').toUpperCase());
    kv(doc, 'Scheme',          claim.scheme_type || 'SHA');
    kv(doc, 'Benefit package', claim.benefit_package || '—');
    kv(doc, 'Primary ICD-10', claim.primary_icd10 || '—');
    if (secIcd.length) kv(doc, 'Secondary ICD-10', secIcd.join(', '));
    kv(doc, 'SHA Member No',  claim.sha_member_no || '—');
    if (claim.submission_ref) kv(doc, 'SHA Portal Ref', claim.submission_ref);

    // Line items table
    if (lineItems.length) {
      doc.moveDown(0.8);
      section(doc, 'Line Items — SHA Tariff Schedule');

      // Column x positions
      const C = { desc: 50, code: 235, qty: 330, unit: 395, total: 465 };
      const W = { desc: 180, code: 90,  qty: 60,  unit: 65,  total: 80  };

      // Header row
      const tblHeaderY = doc.y;
      doc.rect(50, tblHeaderY, 495, 17).fill('#0b3d91');
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8.5);
      doc.text('Description',  C.desc,  tblHeaderY + 4, { width: W.desc });
      doc.text('SHA Code',     C.code,  tblHeaderY + 4, { width: W.code });
      doc.text('Qty',          C.qty,   tblHeaderY + 4, { width: W.qty,  align: 'right' });
      doc.text('Unit KES',     C.unit,  tblHeaderY + 4, { width: W.unit, align: 'right' });
      doc.text('Total KES',    C.total, tblHeaderY + 4, { width: W.total, align: 'right' });
      doc.moveDown(1.3).fillColor('#000').font('Helvetica').fontSize(8.5);

      lineItems.forEach((item, idx) => {
        // Page break guard
        if (doc.y > 720) { doc.addPage(); doc.y = 50; }
        if (idx % 2 === 0) {
          doc.rect(50, doc.y - 2, 495, 13).fill('#f0f4fb');
          doc.fillColor('#000');
        }
        const ry = doc.y;
        doc.text(item.description || '—', C.desc,  ry, { width: W.desc  });
        doc.text(item.sha_code    || '—', C.code,  ry, { width: W.code  });
        doc.text(String(item.quantity  || 1),       C.qty,   ry, { width: W.qty,   align: 'right' });
        doc.text(Number(item.unit_cost || 0).toFixed(2), C.unit, ry, { width: W.unit, align: 'right' });
        doc.text(Number(item.total     || 0).toFixed(2), C.total,ry, { width: W.total, align: 'right' });
        doc.moveDown(0.85);
      });

      // Totals block (right-aligned)
      doc.moveDown(0.5);
      const LINE = (label, val, bold) => {
        if (bold) doc.font('Helvetica-Bold'); else doc.font('Helvetica');
        doc.fontSize(9).fillColor('#000')
           .text(label, 350, doc.y, { width: 110, align: 'right', continued: true })
           .text(Number(val||0).toFixed(2), { width: 80, align: 'right' });
      };
      doc.moveTo(350, doc.y).lineTo(545, doc.y).strokeColor('#0b3d91').lineWidth(0.8).stroke();
      doc.moveDown(0.3);
      if (claim.consultation_fee > 0) LINE('Consultation:', claim.consultation_fee);
      if (claim.drugs_total      > 0) LINE('Drugs:',        claim.drugs_total);
      if (claim.labs_total       > 0) LINE('Labs:',         claim.labs_total);
      if (claim.imaging_total    > 0) LINE('Imaging:',      claim.imaging_total);
      if (claim.procedures_total > 0) LINE('Procedures:',   claim.procedures_total);
      if (claim.bed_charges      > 0) LINE('Bed charges:',  claim.bed_charges);
      if (claim.other_charges    > 0) LINE('Other:',        claim.other_charges);
      doc.moveTo(350, doc.y + 2).lineTo(545, doc.y + 2).strokeColor('#0b3d91').lineWidth(0.8).stroke();
      doc.moveDown(0.3);
      const grandTotal = (claim.sha_payable||0) + (claim.patient_copay||0);
      LINE('Grand Total (KES):', grandTotal, true);

      // SHA payable highlight box
      doc.moveDown(0.8);
      const bY = doc.y;
      doc.rect(350, bY, 195, 40).fill('#0b3d91');
      doc.fillColor('#ffffff').font('Helvetica').fontSize(8)
         .text('SHA PAYABLE', 358, bY + 5, { width: 179, align: 'center' });
      doc.font('Helvetica-Bold').fontSize(15)
         .text(fmtKes(claim.sha_payable), 358, bY + 17, { width: 179, align: 'center' });
      doc.moveDown(3.5).fillColor('#000').font('Helvetica').fontSize(9);

      if ((claim.patient_copay || 0) > 0) {
        doc.text(`Patient co-pay: ${fmtKes(claim.patient_copay)}`, 350, doc.y, { width: 195, align: 'right' });
        doc.moveDown(0.5);
      }
    }

    if (claim.notes) {
      doc.moveDown(0.6);
      section(doc, 'Claim Notes');
      paragraph(doc, claim.notes);
    }
  }

  // ── Footer ──
  doc.moveDown(2);
  doc.fontSize(8).fillColor('#888')
     .text(
       'Generated by NovaMed AI — decision support only. ' +
       'Final clinical decisions remain the responsibility of the attending clinician.',
       { align: 'center' }
     );

  doc.end();
}

function section(doc, title, color = '#0b3d91', x = 60, contentW = 475) {
  doc.moveDown(0.6);
  doc.font('Helvetica-Bold').fontSize(12).fillColor(color).text(title, x, doc.y, { width: contentW });
  doc.moveTo(x, doc.y).lineTo(x + contentW, doc.y).strokeColor(color).lineWidth(0.7).stroke();
  doc.fillColor('#000').font('Helvetica').fontSize(10).moveDown(0.3);
}
function kv(doc, k, v, x = 60, contentW = 475) {
  doc.font('Helvetica-Bold').fontSize(10).text(k + ':', x, doc.y, { width: contentW, continued: true });
  doc.font('Helvetica').text('  ' + (v == null ? '—' : String(v)), { width: contentW });
}
function paragraph(doc, text, x = 60, contentW = 475, size = 10) {
  doc.font('Helvetica').fontSize(size).fillColor('#222').text(text, x, doc.y, { align: 'justify', width: contentW });
  doc.fillColor('#000');
}

module.exports = { buildEncounterPdf };
