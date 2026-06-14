// InvitePreview — what someone sees when they tap Sam's link.
// They see the brunch context FIRST, then auth to RSVP.
// Auth on the same screen so the next tap is RSVP, not another wall.

const InvitePreview = ({ onAuth }) => (
  <div className="bs-app" style={{ minHeight: '100%',
    background: 'linear-gradient(180deg, var(--accent-soft) 0%, var(--bg) 30%)' }}>
    <main style={{
      maxWidth: 440, margin: '0 auto', padding: '24px 24px 32px',
      display: 'flex', flexDirection: 'column', minHeight: '100%',
    }}>
      {/* small wordmark — context, not hero */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
        <Wordmark size="md" />
      </div>

      {/* Invite hero */}
      <div className="bs-card elev" style={{
        padding: 28, marginBottom: 16, textAlign: 'center',
        background: 'var(--surface)',
      }}>
        {/* Inviter */}
        <div className="bs-row" style={{ justifyContent: 'center', gap: 10, marginBottom: 18 }}>
          <div className="bs-avatar" aria-hidden="true" style={{
            width: 48, height: 48, fontSize: 16,
            background: 'var(--accent-soft)', color: 'var(--accent-fg)',
          }}>SL</div>
        </div>
        <p style={{ fontSize: 14, color: 'var(--fg-muted)', margin: '0 0 6px' }}>
          <strong style={{ color: 'var(--fg)' }}>Sam Liu</strong> wants you at brunch
        </p>

        <h1 style={{
          fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 500,
          letterSpacing: '-0.02em', margin: '0 0 16px', lineHeight: 1.2,
          textWrap: 'balance',
        }}>
          Birthday brunch for Sam 💕
        </h1>

        <div className="bs-col" style={{ gap: 8, color: 'var(--fg-muted)', fontSize: 14,
                                          padding: '14px 16px', background: 'var(--surface-2)',
                                          borderRadius: 'var(--r-2)', marginBottom: 12 }}>
          <div className="bs-row" style={{ gap: 10, justifyContent: 'center' }}>
            <window.PopCalendar size={20} /><span>Sun, May 10 · 11:30 AM</span>
          </div>
          <div className="bs-row" style={{ gap: 10, justifyContent: 'center' }}>
            <window.PopPin size={20} /><span>3 places to vote on</span>
          </div>
          <div className="bs-row" style={{ gap: 10, justifyContent: 'center' }}>
            <window.PopUsers size={20} /><span>6 invited</span>
          </div>
        </div>

        <p style={{ fontSize: 13.5, color: 'var(--fg-muted)', margin: '0 0 4px',
                    fontStyle: 'italic', lineHeight: 1.5 }}>
          "Sunday vibes, low-key, bring whoever 💕"
        </p>
      </div>

      {/* Auth — short copy, doesn't feel like a wall */}
      <div className="bs-col" style={{ gap: 10, marginTop: 8 }}>
        <p style={{ fontSize: 13, color: 'var(--fg-muted)', textAlign: 'center', margin: '8px 0 4px' }}>
          Sign in to RSVP and vote. Takes a second.
        </p>
        <AuthButton provider="apple"  onClick={() => onAuth('apple')} />
        <AuthButton provider="google" onClick={() => onAuth('google')} />
      </div>

      <p style={{ marginTop: 18, fontSize: 11.5, color: 'var(--fg-subtle)',
                  textAlign: 'center', lineHeight: 1.5 }}>
        First time here? Welcome to <strong style={{ color: 'var(--fg-muted)' }}>Brunchsters</strong> — we help groups stop saying "we should do brunch" and actually do it.
      </p>
    </main>
  </div>
);

window.InvitePreview = InvitePreview;
