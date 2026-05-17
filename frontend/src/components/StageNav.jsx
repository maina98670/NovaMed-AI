/**
 * Standard back / forward controls used at the bottom of every clinical stage.
 *
 * Props:
 *   onBack       - function (or null to hide)
 *   onForward    - function (or null to hide)
 *   forwardLabel - text on the forward button
 *   backLabel    - text on the back button
 *   busy         - disables the buttons
 *   forwardDisabled - extra condition for forward
 *   primary      - 'forward' | 'back' (which is highlighted)
 *   extra        - any extra ReactNode to render in the bar
 */
export default function StageNav({
  onBack,
  onForward,
  forwardLabel = 'Continue →',
  backLabel = '← Back',
  busy = false,
  forwardDisabled = false,
  primary = 'forward',
  extra = null,
}) {
  return (
    <div className="stage-nav">
      <div className="stage-nav-left">
        {onBack && (
          <button
            className={'btn ' + (primary === 'back' ? 'btn-primary' : 'btn-ghost')}
            onClick={onBack}
            disabled={busy}
            type="button"
          >
            {backLabel}
          </button>
        )}
      </div>
      <div className="stage-nav-mid">{extra}</div>
      <div className="stage-nav-right">
        {onForward && (
          <button
            className={'btn ' + (primary === 'forward' ? 'btn-primary' : 'btn-ghost')}
            onClick={onForward}
            disabled={busy || forwardDisabled}
            type="button"
          >
            {busy ? <span className="spinner" /> : forwardLabel}
          </button>
        )}
      </div>
    </div>
  );
}
