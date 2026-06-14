// 2. Dashboard — upcoming + past + plan-a-brunch.

const BrunchListCard = ({ brunch, onClick, past }) => (
  <div className={`bs-brunch-card${past ? ' past' : ''}`} onClick={onClick}>
    <div className="date">
      <div className="m">{brunch.date.m}</div>
      <div className="d">{brunch.date.d}</div>
    </div>
    <div className="meta">
      <div className="title">{brunch.title}</div>
      <div className="sub">
        <span>{brunch.timeLabel}</span>
        <span className="sep"></span>
        <span>{brunch.location}</span>
        {brunch.locationSub && (
          <>
            <span className="sep"></span>
            <span style={{ color: 'var(--fg-subtle)' }}>{brunch.locationSub}</span>
          </>
        )}
      </div>
      <div className="bs-row" style={{ gap: 10, marginTop: 8 }}>
        {brunch.status === 'voting' && <span className="bs-pill accent dot">Voting open</span>}
        {brunch.status === 'confirmed' && <span className="bs-pill mint dot">Confirmed</span>}
        {brunch.status === 'planning' && <span className="bs-pill dot">Planning</span>}
        {brunch.role === 'host' && <span className="bs-pill">You're hosting</span>}
        {brunch.attendees && (
          <div className="bs-stack" style={{ marginLeft: 4 }}>
            {brunch.attendees.slice(0, 4).map((a) => (
              <div key={a.id} className="bs-avatar sm" aria-label={a.name} role="img">{a.initials}</div>
            ))}
          </div>
        )}
      </div>
    </div>
    <div style={{ color: 'var(--fg-subtle)' }}>
      <IconArrowRight size={18} />
    </div>
  </div>
);

const Dashboard = ({ onCreate, onOpenBrunch, theme, onThemeToggle }) => {
  const upcoming = window.SAMPLE_BRUNCHES_UPCOMING;
  const past = window.SAMPLE_BRUNCHES_PAST;
  const next = upcoming[0];
  const { ref: respRef, isMobile } = window.useResponsive(720);

  return (
    <div className="bs-app" ref={respRef}>
      <TopBar active="home" onCreate={onCreate} theme={theme} onThemeToggle={onThemeToggle} />
      <main className="bs-page" style={isMobile ? { padding: '24px 16px 64px' } : undefined}>
        {/* Greeting */}
        <div style={{ marginBottom: isMobile ? 28 : 36 }}>
          <p className="bs-eyebrow" style={{ margin: '0 0 8px' }}>Sunday, April 26</p>
          <h1 className="bs-h1" style={isMobile ? { fontSize: 30 } : undefined}>Morning, Yusef <span style={{ display: 'inline-block', transform: 'translateY(-2px)' }}>👋</span></h1>
          <p style={{ color: 'var(--fg-muted)', fontSize: 16, margin: 0, maxWidth: 540 }}>
            You have <strong style={{ color: 'var(--fg)' }}>1 brunch</strong> coming up and <strong style={{ color: 'var(--fg)' }}>1 vote</strong> waiting on you.
          </p>
        </div>

        {/* Hero "next up" card */}
        {next && (
          <div className="bs-card elev" style={{ padding: 0, overflow: 'hidden', marginBottom: 40 }}>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.4fr 1fr' }}>
              <div style={{ padding: isMobile ? 22 : 32 }}>
                <div className="bs-row" style={{ gap: 8, marginBottom: 16 }}>
                  <span className="bs-pill mint dot">Confirmed</span>
                  <span className="bs-pill">In 7 days</span>
                </div>
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: isMobile ? 24 : 30, fontWeight: 500, letterSpacing: '-0.02em', margin: '0 0 12px' }}>
                  {next.title}
                </h2>
                <div className="bs-col" style={{ gap: 10, color: 'var(--fg-muted)', fontSize: 15 }}>
                  <div className="bs-row" style={{ gap: 10 }}><IconCalendar size={16} /><span>Sun, May 3 · 11:00 AM</span></div>
                  <div className="bs-row" style={{ gap: 10 }}><IconPin size={16} /><span>Tartine Bakery, Mission</span></div>
                  <div className="bs-row" style={{ gap: 10 }}><IconUsers size={16} /><span>4 of 5 confirmed</span></div>
                </div>
                <div className="bs-row" style={{ gap: 10, marginTop: 24, flexWrap: 'wrap' }}>
                  <button className="bs-btn primary" onClick={() => onOpenBrunch(next)}>
                    <span>Manage brunch</span><IconArrowRight size={16} />
                  </button>
                  <button className="bs-btn"><IconShare size={15} /><span>Share invite</span></button>
                </div>
              </div>
              <div style={{ background: 'var(--accent-soft)', padding: isMobile ? 22 : 28, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <p className="bs-eyebrow" style={{ color: 'var(--accent-fg)', opacity: 0.7 }}>Who's coming</p>
                <div className="bs-col" style={{ gap: 10 }}>
                  {next.attendees.map((a) => (
                    <div key={a.id} className="bs-row" style={{ gap: 10 }}>
                      <div className="bs-avatar sm" aria-hidden="true" style={{ background: 'var(--surface)', color: 'var(--accent-fg)' }}>{a.initials}</div>
                      <span style={{ fontSize: 14, color: 'var(--accent-fg)', flex: 1 }}>{a.name}</span>
                      <IconCheck size={14} style={{ color: 'var(--accent-fg)', opacity: 0.6 }} />
                    </div>
                  ))}
                  <div className="bs-row" style={{ gap: 10, opacity: 0.55 }}>
                    <div className="bs-avatar sm" aria-hidden="true" style={{ background: 'var(--surface)', color: 'var(--accent-fg)' }}>RC</div>
                    <span style={{ fontSize: 14, color: 'var(--accent-fg)', flex: 1 }}>Robin C.</span>
                    <span style={{ fontSize: 12, color: 'var(--accent-fg)' }}>maybe</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Upcoming list */}
        <div style={{ marginBottom: 40 }}>
          <div className="bs-row" style={{ marginBottom: 16, justifyContent: 'space-between' }}>
            <h2 className="bs-h2" style={{ margin: 0 }}>Upcoming</h2>
            <span style={{ color: 'var(--fg-subtle)', fontSize: 13 }}>{upcoming.length} brunches</span>
          </div>
          <div className="bs-col" style={{ gap: 10 }}>
            {upcoming.slice(1).map((b) => (
              <BrunchListCard key={b.id} brunch={b} onClick={() => onOpenBrunch(b)} />
            ))}
          </div>
        </div>

        {/* Past */}
        <div>
          <h2 className="bs-h2">Past brunches</h2>
          <div className="bs-col" style={{ gap: 10 }}>
            {past.map((b) => (
              <BrunchListCard key={b.id} brunch={b} onClick={() => onOpenBrunch(b, { past: true })} past />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
};

window.Dashboard = Dashboard;
window.BrunchListCard = BrunchListCard;
