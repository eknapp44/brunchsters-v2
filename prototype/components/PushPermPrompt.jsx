// PushPermPrompt — deferred ask, fires after the user's first meaningful action.
// Triggers: after RSVP'ing yes, OR after creating + sending a brunch.
// One single screen — don't waste the iOS permission moment on a cold ask.

const PushPermPrompt = ({ kind = 'first-rsvp', onAllow, onLater }) => {
  const copy = {
    'first-rsvp': {
      title: "Don't miss the table-setting 🛎️",
      sub: "We'll ping you when Sam locks the spot and again the morning of. That's it.",
    },
    'first-send': {
      title: "We'll keep an eye on the gang 🛎️",
      sub: "You'll know the second someone RSVPs or votes. No spam, just the moments that matter.",
    },
  }[kind];

  return (
    <div className="bs-app" style={{ minHeight: '100%' }}>
      <main style={{
        maxWidth: 440, margin: '0 auto', padding: '48px 24px',
        display: 'flex', flexDirection: 'column', minHeight: '100%',
      }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          {/* Animated bell illustration — Pop sparkle in a circle */}
          <div style={{
            width: 96, height: 96, margin: '0 auto 24px',
            borderRadius: '50%', background: 'var(--accent-soft)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <window.PopSparkle size={48} />
          </div>

          <h1 style={{
            fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 500,
            letterSpacing: '-0.02em', margin: '0 0 12px', textAlign: 'center',
            textWrap: 'balance', lineHeight: 1.2,
          }}>
            {copy.title}
          </h1>
          <p style={{
            fontSize: 15, color: 'var(--fg-muted)', textAlign: 'center',
            margin: '0 0 32px', maxWidth: 360, marginLeft: 'auto', marginRight: 'auto',
            lineHeight: 1.55,
          }}>
            {copy.sub}
          </p>

          {/* what we'll ping you about — sets expectations BEFORE iOS sheet */}
          <div className="bs-card flat" style={{
            padding: 16, marginBottom: 24,
            background: 'var(--surface-2)', border: '1px solid var(--line-soft)',
            maxWidth: 380, marginLeft: 'auto', marginRight: 'auto',
          }}>
            <p className="bs-eyebrow" style={{ margin: '0 0 10px' }}>What you'll hear from us</p>
            <div className="bs-col" style={{ gap: 8, fontSize: 13, color: 'var(--fg-muted)' }}>
              <div className="bs-row" style={{ gap: 10 }}>
                <window.PopCheck size={18} />
                <span>When someone RSVPs to your brunch</span>
              </div>
              <div className="bs-row" style={{ gap: 10 }}>
                <window.PopCalendar size={18} />
                <span>Morning-of reminders</span>
              </div>
              <div className="bs-row" style={{ gap: 10 }}>
                <window.PopClock size={18} />
                <span>"Voting closes in 2 hours" nudges</span>
              </div>
            </div>
          </div>
        </div>

        <div className="bs-col" style={{ gap: 10 }}>
          <button className="bs-btn primary lg" onClick={onAllow} style={{ width: '100%', justifyContent: 'center' }}>
            <window.PopSparkle size={18} /> <span>Turn on notifications</span>
          </button>
          <button className="bs-btn ghost" onClick={onLater}
                  style={{ width: '100%', justifyContent: 'center', color: 'var(--fg-subtle)' }}>
            Not now
          </button>
        </div>
      </main>
    </div>
  );
};

window.PushPermPrompt = PushPermPrompt;
