// MarketingLanding — the public face at brunchsters.app.
// Cold visitor lands here, not at the sign-in Welcome screen.
//
// Structure (decided):
//   1. Hero: tagline + breakfast scene + Sign up / See how
//   2. How it works (3 steps): pick spot → invite → brunch on
//   3. Tiny footer (sign-in for returning users, terms/privacy)
//
// Voice: from the Brand Voice doc. Friend-with-FOMO, generous emoji.

const HowItWorksCard = ({ icon, num, title, body }) => (
  <div style={{
    padding: 24, borderRadius: 'var(--r-3)',
    background: 'var(--surface)', border: '1px solid var(--line-soft)',
    flex: 1, minWidth: 240,
    display: 'flex', flexDirection: 'column', gap: 12,
  }}>
    <div className="bs-row" style={{ gap: 10 }}>
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600,
        letterSpacing: '0.08em', color: 'var(--fg-subtle)',
      }}>
        0{num}
      </span>
      <span className="bs-spacer" />
      {icon}
    </div>
    <h3 style={{
      fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 500,
      letterSpacing: '-0.015em', margin: 0, textWrap: 'balance',
    }}>{title}</h3>
    <p style={{ fontSize: 14, color: 'var(--fg-muted)', margin: 0, lineHeight: 1.55 }}>
      {body}
    </p>
  </div>
);

const MarketingLanding = ({ onSignUp, onSignIn }) => (
  <div className="bs-app">
    {/* Top bar — minimal: wordmark left, sign-in right */}
    <header style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '20px 32px', borderBottom: '1px solid var(--line-soft)',
      background: 'oklch(from var(--bg) l c h / 0.85)',
      backdropFilter: 'blur(12px)',
      position: 'sticky', top: 0, zIndex: 10,
    }}>
      <Wordmark size="md" />
      <button className="bs-btn" onClick={onSignIn}>Sign in</button>
    </header>

    {/* Hero */}
    <section style={{
      padding: '72px 32px 96px',
      background: 'linear-gradient(180deg, var(--accent-soft) 0%, var(--bg) 80%)',
    }}>
      <div style={{ maxWidth: 1080, margin: '0 auto',
                     display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
                     gap: 48, alignItems: 'center' }}>
        <div>
          <p className="bs-eyebrow" style={{ color: 'var(--accent-fg)', marginBottom: 16 }}>
            For groups who keep saying "we should brunch"
          </p>
          <h1 style={{
            fontFamily: 'var(--font-display)', fontSize: 64, fontWeight: 500,
            letterSpacing: '-0.025em', lineHeight: 1.05,
            margin: '0 0 20px', textWrap: 'balance',
          }}>
            Your friends are hungry. <br/>Probably. 🥂
          </h1>
          <p style={{ fontSize: 18, color: 'var(--fg-muted)', margin: '0 0 32px',
                       lineHeight: 1.55, maxWidth: 480, textWrap: 'pretty' }}>
            Plan brunch with the gang in 30 seconds. Pick a spot, pick a time, send it.
            We'll handle the rest — invites, RSVPs, and the inevitable "what about Tartine?" debate.
          </p>
          <div className="bs-row" style={{ gap: 12, flexWrap: 'wrap' }}>
            <button className="bs-btn primary lg" onClick={onSignUp}>
              <window.PopPlus size={18} /> <span>Round up the crew</span>
            </button>
            <a href="#how" className="bs-btn lg" style={{ background: 'transparent' }}>
              <span>See how →</span>
            </a>
          </div>
          <p style={{ fontSize: 12, color: 'var(--fg-subtle)', marginTop: 16 }}>
            Free, no app to download. Sign in with Apple or Google.
          </p>
        </div>

        {/* Hero art — reuse BreakfastScene */}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <window.BreakfastScene width={520} height={340} />
        </div>
      </div>
    </section>

    {/* How it works */}
    <section id="how" style={{ padding: '72px 32px', background: 'var(--bg)' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto' }}>
        <p className="bs-eyebrow" style={{ marginBottom: 12 }}>How it works</p>
        <h2 style={{
          fontFamily: 'var(--font-display)', fontSize: 40, fontWeight: 500,
          letterSpacing: '-0.022em', margin: '0 0 14px', textWrap: 'balance',
        }}>
          Three taps. Brunch on. 💕
        </h2>
        <p style={{ fontSize: 16, color: 'var(--fg-muted)', margin: '0 0 40px', maxWidth: 580 }}>
          The whole point is to stop talking about brunch and actually do it.
          Here's how the gang gets to a table together.
        </p>

        <div className="bs-row" style={{ gap: 18, flexWrap: 'wrap', alignItems: 'stretch' }}>
          <HowItWorksCard
            num={1}
            icon={<window.PopPin size={32} />}
            title="Pick a spot. Or a few."
            body="Lock in your go-to place, or toss in a couple and we'll let the gang vote. Group consensus, minus the 47-message thread."
          />
          <HowItWorksCard
            num={2}
            icon={<window.PopUsers size={32} />}
            title="Round up the crew."
            body="Send invites by link or email. Friends RSVP without downloading anything. Plus-ones, dietary notes, the works."
          />
          <HowItWorksCard
            num={3}
            icon={<window.PopCheck size={32} />}
            title="Show up. Eat eggs."
            body="We handle reminders, voting deadlines, and the inevitable schedule change. You handle ordering the second cappuccino."
          />
        </div>

        <div style={{ marginTop: 48, textAlign: 'center' }}>
          <button className="bs-btn primary lg" onClick={onSignUp}>
            <window.PopSparkle size={18} /> <span>Try it now</span>
          </button>
          <p style={{ fontSize: 12, color: 'var(--fg-subtle)', marginTop: 12 }}>
            30 seconds. Promise.
          </p>
        </div>
      </div>
    </section>

    {/* Footer */}
    <footer style={{
      padding: '40px 32px', borderTop: '1px solid var(--line-soft)',
      background: 'var(--surface-2)',
    }}>
      <div style={{ maxWidth: 1080, margin: '0 auto',
                     display: 'flex', justifyContent: 'space-between',
                     alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
        <Wordmark size="md" />
        <div className="bs-row" style={{ gap: 20, color: 'var(--fg-muted)', fontSize: 13 }}>
          <a href="#" style={{ color: 'inherit', textDecoration: 'none' }}>FAQ</a>
          <a href="mailto:hi@brunchsters.app" style={{ color: 'inherit', textDecoration: 'none' }}>Contact</a>
          <a href="#" style={{ color: 'inherit', textDecoration: 'none' }}>Privacy</a>
          <a href="#" style={{ color: 'inherit', textDecoration: 'none' }}>Terms</a>
          <span style={{ color: 'var(--fg-subtle)' }}>· © 2026 Brunchsters</span>
        </div>
      </div>
    </footer>
  </div>
);

window.MarketingLanding = MarketingLanding;
