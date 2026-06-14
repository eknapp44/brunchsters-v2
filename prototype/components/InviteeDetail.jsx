// 5. Brunch detail — invitee's RSVP + vote view.
// Single-column, focused. Top: who invited you + brunch context.
// Then: RSVP block (the primary action).
// Then: vote on time/place if voting is open.

const InviteeDetail = ({ onBack, theme, onThemeToggle }) => {
  const [rsvp, setRsvp] = React.useState(null); // 'yes' | 'maybe' | 'no'
  const [vote, setVote] = React.useState('l1'); // single-select

  const locOptions = [
    { id: 'l1', name: 'Tartine Bakery', sub: '600 Guerrero St · Mission · 0.4 mi', tag: 'pastries · coffee' },
    { id: 'l2', name: 'Zazie',          sub: '941 Cole St · Cole Valley · 1.8 mi', tag: 'french · brunch classic' },
    { id: 'l3', name: 'Plow',           sub: '1299 18th St · Potrero Hill · 2.1 mi', tag: 'no-frills american' },
  ];

  return (
    <div className="bs-app">
      <TopBar active="home" onCreate={() => {}} theme={theme} onThemeToggle={onThemeToggle} />
      <main className="bs-page" style={{ maxWidth: 720 }}>
        <button className="bs-btn ghost" style={{ marginBottom: 20, paddingLeft: 8 }} onClick={onBack}>
          <IconArrowLeft size={16} /> <span>Back</span>
        </button>

        {/* Inviter chip */}
        <div className="bs-row" style={{ gap: 10, marginBottom: 18 }}>
          <div className="bs-avatar sm" aria-hidden="true" style={{ background: 'var(--accent-soft)', color: 'var(--accent-fg)' }}>SL</div>
          <span style={{ fontSize: 14, color: 'var(--fg-muted)' }}>
            <strong style={{ color: 'var(--fg)' }}>Sam Liu</strong> invited you to brunch
          </span>
        </div>

        <h1 className="bs-h1" style={{ marginBottom: 10 }}>Birthday brunch for Sam</h1>
        <p style={{ color: 'var(--fg-muted)', fontSize: 16, margin: '0 0 24px', maxWidth: 580 }}>
          Sunday vibes, low-key, bring whoever 💕
        </p>

        <div className="bs-row" style={{ gap: 22, marginBottom: 32, color: 'var(--fg-muted)', fontSize: 14, flexWrap: 'wrap' }}>
          <div className="bs-row" style={{ gap: 8 }}><IconCalendar size={16} /><span>Sun, May 10 · 11:30 AM</span></div>
          <div className="bs-row" style={{ gap: 8 }}><IconPin size={16} /><span>3 places to choose from</span></div>
          <div className="bs-row" style={{ gap: 8 }}>
            <IconUsers size={16} />
            <span>6 invited</span>
            <div className="bs-stack" style={{ marginLeft: 6 }}>
              {['MR', 'DK', 'PS', 'JM'].map((i) => (
                <div key={i} className="bs-avatar sm" aria-hidden="true">{i}</div>
              ))}
            </div>
          </div>
        </div>

        {/* RSVP card — primary action */}
        <div className="bs-card elev" style={{ padding: 24, marginBottom: 24 }}>
          <p className="bs-eyebrow" style={{ margin: '0 0 14px' }}>RSVP</p>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 500, letterSpacing: '-0.015em', margin: '0 0 16px' }}>
            Can you make it?
          </h2>
          <div className="bs-row" style={{ gap: 8 }}>
            {[
              { v: 'yes',   label: "I'm in", emoji: '🥂' },
              { v: 'maybe', label: 'Maybe',  emoji: '🤔' },
              { v: 'no',    label: "Can't",  emoji: '😢' },
            ].map((opt) => {
              const selected = rsvp === opt.v;
              return (
                <button
                  key={opt.v}
                  onClick={() => setRsvp(opt.v)}
                  className="bs-btn lg"
                  style={{
                    flex: 1,
                    background: selected ? (opt.v === 'yes' ? 'var(--mint)' : 'var(--accent-soft)') : 'var(--surface)',
                    color: selected ? (opt.v === 'yes' ? 'var(--mint-fg)' : 'var(--accent-fg)') : 'var(--fg)',
                    borderColor: selected ? 'transparent' : 'var(--line)',
                    fontWeight: 500,
                    transform: selected ? 'translateY(-1px)' : 'none',
                    boxShadow: selected ? 'var(--shadow-md)' : 'none',
                  }}>
                  <span style={{ fontSize: 18 }}>{opt.emoji}</span>
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>
          {rsvp === 'yes' && (
            <p style={{ margin: '14px 0 0', fontSize: 13, color: 'var(--mint-fg)', display: 'flex', gap: 6, alignItems: 'center' }}>
              <IconCheck size={14} /> See you there. Sam will get a notification.
            </p>
          )}
        </div>

        {/* Voting — where (single-select) */}
        <div className="bs-card" style={{ padding: 24, marginBottom: 24 }}>
          <div className="bs-row" style={{ marginBottom: 4, gap: 10 }}>
            <IconPin size={18} style={{ color: 'var(--fg-muted)' }} />
            <h3 className="bs-h3" style={{ margin: 0 }}>Vote on where</h3>
            <span className="bs-spacer" />
            <span className="bs-pill accent dot" style={{ height: 22 }}>Closes Thu</span>
          </div>
          <p style={{ color: 'var(--fg-muted)', fontSize: 13, margin: '0 0 16px' }}>Pick your one favorite. You can change it until voting closes.</p>
          <div className="bs-col" style={{ gap: 8 }}>
            {locOptions.map((o) => (
              <button key={o.id} className={`bs-option${vote === o.id ? ' selected' : ''}`} onClick={() => setVote(o.id)}>
                <div className="radio" />
                <div className="body">
                  <div className="title">{o.name}</div>
                  <div className="sub">{o.sub}</div>
                </div>
                <div className="meta">{o.tag}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="bs-row" style={{ gap: 10 }}>
          <button className="bs-btn"><IconShare size={15} /> <span>Add to calendar</span></button>
          <span className="bs-spacer" />
          <button className="bs-btn ghost" style={{ color: 'var(--fg-subtle)' }}>Mute notifications</button>
        </div>
      </main>
    </div>
  );
};

window.InviteeDetail = InviteeDetail;
