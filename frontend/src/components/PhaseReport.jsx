import { useState } from 'react';
import { api } from '../services/api';
import { Markdown } from '../utils/Markdown';

/**
 * Generates and shows a detailed AI medical report for a given phase.
 * Used at the bottom of every clinical stage.
 */
export default function PhaseReport({ encounterId, phase, label, toast }) {
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState('');
  const [open, setOpen] = useState(false);

  const generate = async () => {
    setBusy(true);
    try {
      const r = await api.post(`/api/encounters/${encounterId}/report/${phase}`, {});
      if (r.report) {
        setReport(r.report);
        setOpen(true);
      } else {
        toast?.('No report returned', 'err');
      }
    } catch (e) {
      toast?.(e.message || 'Failed to generate report', 'err');
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(report);
      toast?.('Report copied to clipboard', 'ok');
    } catch {
      toast?.('Copy failed', 'err');
    }
  };

  return (
    <div className="phase-report">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button className="btn btn-ghost btn-sm" onClick={generate} disabled={busy}>
          {busy ? <span className="spinner" /> : `📝 Generate ${label || phase} report`}
        </button>
        {report && (
          <>
            <button className="btn btn-sm btn-ghost" onClick={() => setOpen(o => !o)}>
              {open ? 'Hide report' : 'Show report'}
            </button>
            <button className="btn btn-sm btn-ghost" onClick={copy}>Copy</button>
          </>
        )}
      </div>

      {open && report && (
        <div className="report-card" style={{ marginTop: 12 }}>
          <div className="report-header">
            <strong>AI {label || phase} report</strong>
            <span className="pill pill-violet" style={{ marginLeft: 8 }}>auto-generated</span>
          </div>
          <div className="report-body">
            <Markdown text={report} />
          </div>
        </div>
      )}
    </div>
  );
}
