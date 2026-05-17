import React from 'react';

/**
 * NovaMed — Global Error Boundary
 *
 * Catches render errors in any child tree.
 * Shows a recovery UI instead of a blank screen.
 *
 * Usage:
 *   <ErrorBoundary label="Patient list">
 *     <PatientList />
 *   </ErrorBoundary>
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Log to console in dev; in production plug in your error tracker here
    console.error('[ErrorBoundary]', this.props.label || 'unknown', error, errorInfo);

    // If you add Sentry later: Sentry.captureException(error, { extra: errorInfo });
    this.setState({ errorInfo });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const { label = 'This page', minimal = false } = this.props;

    if (minimal) {
      return (
        <div style={{
          background: '#fef2f2', border: '1.5px solid #fca5a5',
          borderRadius: 12, padding: '20px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 28, marginBottom: 6 }}>⚠️</div>
          <div style={{ fontWeight: 700, color: '#991b1b', marginBottom: 4 }}>
            {label} encountered an error
          </div>
          <div style={{ fontSize: 12, color: '#b91c1c', marginBottom: 12, fontFamily: 'monospace' }}>
            {this.state.error?.message}
          </div>
          <button onClick={this.handleRetry} style={retryBtnStyle}>Retry</button>
        </div>
      );
    }

    return (
      <div style={fullPageStyle}>
        <div style={cardStyle}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>⚠️</div>
          <h2 style={{ margin: '0 0 8px', color: '#991b1b', fontSize: 20 }}>
            Something went wrong
          </h2>
          <p style={{ color: '#64748b', marginBottom: 8, fontSize: 14 }}>
            {label} ran into an unexpected error.
          </p>
          <div style={errorBoxStyle}>
            {this.state.error?.message || 'Unknown error'}
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={this.handleRetry} style={retryBtnStyle}>
              Try again
            </button>
            <button onClick={() => window.location.href = '/dashboard'} style={homeBtnStyle}>
              Go to dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }
}

const fullPageStyle = {
  display: 'grid', placeItems: 'center',
  minHeight: '60vh', padding: '24px',
};

const cardStyle = {
  background: '#fff', border: '1.5px solid #fca5a5',
  borderRadius: 16, padding: '36px 32px',
  maxWidth: 440, width: '100%', textAlign: 'center',
  boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
};

const errorBoxStyle = {
  background: '#fef2f2', border: '1px solid #fca5a5',
  borderRadius: 8, padding: '10px 14px',
  fontSize: 12, fontFamily: 'monospace',
  color: '#b91c1c', marginBottom: 20,
  wordBreak: 'break-word', textAlign: 'left',
};

const retryBtnStyle = {
  padding: '8px 20px', borderRadius: 8, border: 'none',
  background: '#dc2626', color: '#fff',
  fontWeight: 600, cursor: 'pointer', fontSize: 14,
};

const homeBtnStyle = {
  padding: '8px 20px', borderRadius: 8,
  border: '1.5px solid #e2e8f0', background: '#fff',
  color: '#374151', fontWeight: 600, cursor: 'pointer', fontSize: 14,
};
