// WelcomeScreen — first surface for an organic (uninvited) user.
// Decision: no tutorial, no carousel. The UI is the tutorial — empty states do the work.
// Just one welcome screen with the tagline, two auth buttons, and a tiny "what you'll do" line.

const AuthButton = ({ provider = 'google', onClick }) => {
  const isGoogle = provider === 'google';
  return (
    <button onClick={onClick} className="bs-btn lg" style={{
      width: '100%', height: 52,
      background: isGoogle ? 'var(--surface)' : '#000',
      color: isGoogle ? 'var(--fg)' : '#fff',
      borderColor: isGoogle ? 'var(--line)' : 'transparent',
      fontSize: 15, fontWeight: 500,
      justifyContent: 'center',
    }}>
      {isGoogle ? (
        <>
          <window.GCalGlyph size={18} />
          <span>Continue with Google</span>
        </>
      ) : (
        <>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.05 12.5c0-2.86 2.34-4.2 2.44-4.27-1.33-1.95-3.4-2.22-4.13-2.25-1.76-.18-3.43 1.04-4.32 1.04-.9 0-2.27-1.01-3.74-.98-1.92.03-3.7 1.12-4.69 2.84-2 3.47-.51 8.6 1.44 11.42.95 1.38 2.08 2.92 3.56 2.87 1.43-.06 1.97-.92 3.7-.92 1.71 0 2.21.92 3.72.89 1.54-.03 2.51-1.4 3.45-2.79 1.09-1.6 1.53-3.15 1.55-3.23-.03-.01-2.98-1.14-3.01-4.52zM14.49 4.13c.78-.95 1.31-2.26 1.17-3.57-1.13.05-2.5.75-3.3 1.69-.72.84-1.36 2.18-1.19 3.46 1.26.1 2.55-.64 3.32-1.58z"/>
          </svg>
          <span>Continue with Apple</span>
        </>
      )}
    </button>
  );
};

const WelcomeScreen = ({ onAuth, sessionExpired = false }) => (
  <div className="bs-app" style={{ minHeight: '100%',
    background: 'linear-gradient(180deg, var(--accent-soft) 0%, var(--bg) 50%)' }}>
    <main style={{
      maxWidth: 440, margin: '0 auto', padding: '64px 24px',
      display: 'flex', flexDirection: 'column', minHeight: '100%',
    }}>
      {/* Top — wordmark, generous breathing room */}
      <div style={{ marginBottom: 'auto', paddingTop: 24 }}>
        <Wordmark size="lg" />
      </div>

      {/* Session-expired banner — only if applicable */}
      {sessionExpired && (
        <div style={{
          padding: '12px 14px', borderRadius: 'var(--r-2)',
          background: 'var(--surface)', border: '1px solid var(--line)',
          fontSize: 13, color: 'var(--fg-muted)', marginBottom: 20,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <window.PopClock size={20} />
          <span><strong style={{ color: 'var(--fg)' }}>Welcome back.</strong> Sign in to pick up where you left off.</span>
        </div>
      )}

      {/* Hero — tagline + supporting line */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '40px 0' }}>
        <p className="bs-eyebrow" style={{ margin: '0 0 12px', color: 'var(--accent-fg)' }}>
          {sessionExpired ? 'Sign back in' : 'Welcome 🥂'}
        </p>
        <h1 style={{
          fontFamily: 'var(--font-display)', fontSize: 44, fontWeight: 500,
          letterSpacing: '-0.025em', margin: '0 0 16px', lineHeight: 1.1,
          textWrap: 'balance',
        }}>
          Your friends are hungry. <br/>Probably.
        </h1>
        <p style={{ fontSize: 16, color: 'var(--fg-muted)', margin: 0, lineHeight: 1.55, textWrap: 'pretty' }}>
          Plan brunch with the gang in 30 seconds. Pick a spot, pick a time, send it.
          We'll handle the rest.
        </p>
      </div>

      {/* Auth buttons */}
      <div className="bs-col" style={{ gap: 10, marginTop: 'auto' }}>
        <AuthButton provider="apple"  onClick={() => onAuth('apple')} />
        <AuthButton provider="google" onClick={() => onAuth('google')} />
        <p style={{ marginTop: 14, fontSize: 12, color: 'var(--fg-subtle)', textAlign: 'center', lineHeight: 1.5 }}>
          By continuing, you're cool with the <a href="#" style={{ color: 'var(--fg-muted)' }}>terms</a> and{' '}
          <a href="#" style={{ color: 'var(--fg-muted)' }}>privacy</a>. We never post for you. Promise.
        </p>
      </div>
    </main>
  </div>
);

window.WelcomeScreen = WelcomeScreen;
window.AuthButton = AuthButton;
