// Toast + inline error system.
//
// Three patterns:
//   1. <Toast />       — transient, slides up from bottom. Used for network errors,
//                        save confirmations, undo affordances. Dismisses on tap or 5s.
//   2. <InlineError /> — for inline failures (e.g. "couldn't save this RSVP").
//                        Sits where the action was; doesn't move.
//   3. <ErrorState />  — full-page catastrophic state. Used when a brunch fails to
//                        load entirely, or session is rotten.
//
// Voice: from brand doc — plain talk, take the blame, easy retry. Never blame the user.

const Toast = ({ open, kind = 'error', message, action, onAction, onDismiss, autoHideMs = 5000 }) => {
  React.useEffect(() => {
    if (!open || !autoHideMs) return;
    const t = setTimeout(() => onDismiss && onDismiss(), autoHideMs);
    return () => clearTimeout(t);
  }, [open, autoHideMs, onDismiss]);

  if (!open) return null;

  const tones = {
    error:   { bg: 'oklch(0.22 0.060 30)',  fg: '#fff', icon: <window.PopSparkle size={20} /> },
    success: { bg: 'var(--mint)',           fg: 'var(--mint-fg)', icon: <window.PopCheck size={20} /> },
    info:    { bg: 'var(--surface)',         fg: 'var(--fg)', icon: <window.PopSparkle size={20} /> },
  };
  const tone = tones[kind] || tones.error;

  return (
    <div role="status" aria-live="polite" style={{
      position: 'fixed', left: '50%', bottom: 24, transform: 'translateX(-50%)',
      zIndex: 200, minWidth: 280, maxWidth: 480,
      padding: '12px 14px 12px 16px',
      background: tone.bg, color: tone.fg,
      borderRadius: 'var(--r-3)',
      boxShadow: '0 12px 32px -8px oklch(0.20 0.01 70 / 0.30)',
      display: 'flex', alignItems: 'center', gap: 12,
      animation: 'toast-rise 0.32s var(--ease-spring)',
    }}>
      <span style={{ flexShrink: 0 }}>{tone.icon}</span>
      <span style={{ flex: 1, fontSize: 14, lineHeight: 1.45 }}>{message}</span>
      {action && (
        <button onClick={onAction} style={{
          background: 'transparent', border: 0,
          color: tone.fg, fontSize: 13, fontWeight: 600,
          padding: '4px 8px', borderRadius: 'var(--r-1)',
          textDecoration: 'underline', textUnderlineOffset: 3,
          cursor: 'pointer',
        }}>{action}</button>
      )}
      <button onClick={onDismiss} aria-label="Dismiss" style={{
        background: 'transparent', border: 0, color: tone.fg,
        opacity: 0.7, padding: 4, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <window.IconClose size={16} />
      </button>
      <style>{`
        @keyframes toast-rise {
          from { opacity: 0; transform: translate(-50%, 14px); }
          to   { opacity: 1; transform: translate(-50%, 0); }
        }
      `}</style>
    </div>
  );
};

const InlineError = ({ message, onRetry }) => (
  <div role="alert" style={{
    padding: '12px 14px', borderRadius: 'var(--r-2)',
    background: 'oklch(0.97 0.030 30)',
    border: '1px solid oklch(0.85 0.080 30)',
    color: 'oklch(0.30 0.140 30)',
    fontSize: 13.5, lineHeight: 1.5,
    display: 'flex', alignItems: 'center', gap: 12,
  }}>
    <window.PopSparkle size={20} />
    <span style={{ flex: 1 }}>{message}</span>
    {onRetry && (
      <button onClick={onRetry} className="bs-btn sm" style={{
        background: 'transparent', color: 'oklch(0.30 0.140 30)',
        borderColor: 'oklch(0.70 0.140 30)',
      }}>Try again</button>
    )}
  </div>
);

const ErrorState = ({ kind = 'load-fail', onRetry, onHome }) => {
  const copy = {
    'load-fail': {
      icon: <window.PopSparkle size={56} />,
      title: "Couldn't load that one.",
      body: "Could be a flaky connection, could be us. Try again in a sec.",
      retryLabel: "Try again",
    },
    '404': {
      icon: <window.PopEgg size={56} />,
      title: "Nothing here.",
      body: "This brunch doesn't exist — maybe it was called off, or the link's stale.",
      retryLabel: null,
    },
    'gone': {
      icon: <window.PopClock size={56} />,
      title: "This brunch is over.",
      body: "It happened, or it got called off. Either way, it's not on the table anymore.",
      retryLabel: null,
    },
  }[kind];

  return (
    <div className="bs-app">
      <main style={{
        maxWidth: 480, margin: '0 auto', padding: '80px 24px',
        textAlign: 'center',
      }}>
        <div style={{
          width: 100, height: 100, margin: '0 auto 24px',
          borderRadius: '50%', background: 'var(--surface-2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {copy.icon}
        </div>
        <h1 style={{
          fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 500,
          letterSpacing: '-0.02em', margin: '0 0 12px', textWrap: 'balance',
        }}>{copy.title}</h1>
        <p style={{ fontSize: 15, color: 'var(--fg-muted)', margin: '0 0 32px',
                     lineHeight: 1.55, textWrap: 'pretty' }}>
          {copy.body}
        </p>
        <div className="bs-row" style={{ justifyContent: 'center', gap: 10 }}>
          {copy.retryLabel && onRetry && (
            <button className="bs-btn primary lg" onClick={onRetry}>
              <window.PopSparkle size={18} /> <span>{copy.retryLabel}</span>
            </button>
          )}
          <button className="bs-btn lg" onClick={onHome}>Back to home</button>
        </div>
      </main>
    </div>
  );
};

window.Toast = Toast;
window.InlineError = InlineError;
window.ErrorState = ErrorState;
