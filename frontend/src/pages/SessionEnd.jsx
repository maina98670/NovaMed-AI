import { Link, useNavigate, useParams } from 'react-router-dom';

/**
 * End-of-session page shown after an encounter is closed.
 * Displays the official medical disclaimer and offers two paths forward.
 */
export default function SessionEnd() {
  const { id } = useParams();
  const nav = useNavigate();

  return (
    <div className="end-page">
      <div className="end-card card">
        <div className="end-icon">✓</div>
        <h1 className="end-title">Thank you for using NovaMed AI</h1>
        <p className="end-sub">Encounter session #{id} has been closed and saved successfully.</p>

        <div className="disclaimer-box">
          <h3>Medical Disclaimer</h3>
          <p>
            <strong>NovaMed AI</strong> is a clinical support system designed to
            assist healthcare professionals.
          </p>
          <p>
            It does <strong>not</strong> replace professional medical judgment,
            diagnosis, or treatment.
          </p>
          <p>
            All decisions must be reviewed and confirmed by a qualified
            healthcare provider.
          </p>
          <p>
            The developers are not responsible for any outcomes resulting from
            the use of this system.
          </p>
        </div>

        <div className="end-actions">
          <Link to="/dashboard" className="btn btn-primary">
            🏠 Return to Home
          </Link>
          <button className="btn btn-ghost" onClick={() => nav('/patients/new')}>
            ➕ Start New Session
          </button>
          {id && (
            <Link to={`/encounters/${id}`} className="btn btn-ghost">
              📄 View summary
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
