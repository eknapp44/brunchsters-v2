// 1. Sign-in / landing screen.
// Hero on left, sign-in card on right. Single primary action; warm and conversational.

const SignIn = () => {
  return (
    <div style={{ minHeight: 760, background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <header className="bs-topbar" style={{ borderBottom: 'none' }}>
        <Wordmark size="md" />
        <a href="#" style={{ color: 'var(--fg-muted)', fontSize: 14, textDecoration: 'none' }}>How it works</a>
      </header>
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 60, padding: '40px 80px 60px', alignItems: 'center' }}>
        {/* Left — pitch */}
        <div>
          <div className="bs-pill accent" style={{ marginBottom: 24 }}>
            <span style={{ marginRight: 4 }}>✨</span>
            New: collaborative time-voting
          </div>
          <h1 style={{
            fontFamily: 'var(--font-display)', fontSize: 64, fontWeight: 500,
            letterSpacing: '-0.03em', lineHeight: 1.02, margin: '0 0 20px',
            color: 'var(--fg)', textWrap: 'balance'
          }}>
            Brunch with friends, <span style={{ color: 'var(--accent-strong)', fontStyle: 'italic' }}>actually</span> planned.
          </h1>
          <p style={{ fontSize: 18, lineHeight: 1.5, color: 'var(--fg-muted)', maxWidth: 480, margin: '0 0 32px' }}>
            The bit between picking a place and putting it on the calendar — finally collaborative.
            No more 47-message group chats. 💕
          </p>
          <div className="bs-row" style={{ gap: 24, color: 'var(--fg-muted)', fontSize: 14 }}>
            <div className="bs-row" style={{ gap: 8 }}><IconCheck size={16} /><span>4-step planner</span></div>
            <div className="bs-row" style={{ gap: 8 }}><IconCheck size={16} /><span>Vote on time & place</span></div>
            <div className="bs-row" style={{ gap: 8 }}><IconCheck size={16} /><span>Email invites</span></div>
          </div>
        </div>

        {/* Right — sign-in card */}
        <div className="bs-card elev" style={{ padding: 36, maxWidth: 420, justifySelf: 'end', width: '100%' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 500, margin: '0 0 6px', letterSpacing: '-0.02em' }}>
            Get started
          </h2>
          <p style={{ margin: 0, color: 'var(--fg-muted)', fontSize: 14 }}>
            Sign in — we'll set up your account in one tap.
          </p>

          <div className="bs-col" style={{ marginTop: 28, gap: 10 }}>
            <button className="bs-btn lg block" style={{ background: 'var(--surface)', borderColor: 'var(--line)' }}>
              <svg width="18" height="18" viewBox="0 0 18 18" style={{ flexShrink: 0 }}>
                <path d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 01-1.79 2.71v2.26h2.9c1.7-1.56 2.69-3.87 2.69-6.61z" fill="#4285F4"/>
                <path d="M9 18c2.43 0 4.46-.81 5.95-2.18l-2.9-2.26c-.8.54-1.83.86-3.05.86-2.34 0-4.32-1.58-5.03-3.71H.96v2.33A9 9 0 009 18z" fill="#34A853"/>
                <path d="M3.97 10.71A5.4 5.4 0 013.68 9c0-.6.1-1.18.29-1.71V4.96H.96A9 9 0 000 9c0 1.45.35 2.83.96 4.04l3.01-2.33z" fill="#FBBC05"/>
                <path d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 009 0 9 9 0 00.96 4.96L3.97 7.3C4.68 5.16 6.66 3.58 9 3.58z" fill="#EA4335"/>
              </svg>
              <span>Continue with Google</span>
            </button>
            <button className="bs-btn lg block" style={{ background: 'var(--fg)', color: 'var(--bg)', borderColor: 'transparent' }}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" style={{ flexShrink: 0 }}>
                <path d="M14.5 9.6c0-2.5 2-3.7 2.1-3.8-1.2-1.7-3-2-3.6-2-1.5-.2-3 .9-3.7.9-.8 0-2-.9-3.3-.9-1.7 0-3.3 1-4.2 2.5-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.4-.8 1.6 0 2 .8 3.4.8 1.4 0 2.3-1.3 3.1-2.5 1-1.5 1.4-2.9 1.4-2.9-.1 0-2.7-1-2.7-4.1zM12 1.7c.7-.8 1.1-2 1-3.2-1 .1-2.2.7-2.9 1.5-.6.7-1.2 1.9-1 3 1.1.1 2.2-.5 2.9-1.3z"/>
              </svg>
              <span>Continue with Apple</span>
            </button>
          </div>

          <hr className="bs-divider" style={{ margin: '24px 0' }} />
          <p style={{ fontSize: 12, color: 'var(--fg-subtle)', textAlign: 'center', margin: 0, lineHeight: 1.5 }}>
            By signing in you agree to our Terms.<br/>
            We'll never email you about anything but brunch.
          </p>
        </div>
      </div>
    </div>
  );
};

window.SignIn = SignIn;
