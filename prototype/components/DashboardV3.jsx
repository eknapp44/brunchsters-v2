// v3 Dashboard — same structure as Dashboard, with Pop-icon audit (surgical
// vs broad based on tweak), and a "+ Plan another brunch" card at the end of
// the upcoming list.
//
// We don't replace the original; this is a new component used in v3 artboards.

const BrunchListCardV3 = ({ brunch, onClick, past, popMode = 'surgical' }) => {
  const broad = popMode === 'broad';
  return (
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
        <div className="bs-row" style={{ gap: 10, marginTop: 8, alignItems: 'center' }}>
          {/* Voting pill: in surgical mode, no icon. In broad, get the sparkle pop. */}
          {brunch.status === 'voting' && (
            <span className="bs-pill accent dot" style={broad ? { paddingLeft: 8, display: 'inline-flex', alignItems: 'center', gap: 6 } : undefined}>
              {broad && <window.PopSparkle size={16} />}
              <span>Open for votes</span>
            </span>
          )}
          {/* Confirmed: ALWAYS pop-check (surgical baseline) */}
          {brunch.status === 'confirmed' && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '2px 10px 2px 4px',
              borderRadius: 'var(--r-pill)',
              background: 'var(--mint)', color: 'var(--mint-fg)',
              fontSize: 12, fontWeight: 500, height: 22,
            }}>
              <window.PopCheck size={18} />
              <span>Confirmed</span>
            </span>
          )}
          {brunch.status === 'planning' && <span className="bs-pill dot">In the works</span>}
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
};

const PlanAnotherCard = ({ onCreate }) => (
  <button onClick={onCreate} style={{
    display: 'flex', alignItems: 'center', gap: 16,
    padding: '18px 18px 18px 14px',
    border: '1.5px dashed var(--line)',
    borderRadius: 'var(--r-3)',
    background: 'transparent', cursor: 'pointer',
    width: '100%', textAlign: 'left',
    transition: 'all 0.15s var(--ease)',
  }}
  onMouseEnter={(e) => {
    e.currentTarget.style.borderColor = 'var(--accent-strong)';
    e.currentTarget.style.background = 'var(--accent-soft)';
  }}
  onMouseLeave={(e) => {
    e.currentTarget.style.borderColor = 'var(--line)';
    e.currentTarget.style.background = 'transparent';
  }}>
    <div style={{
      width: 56, height: 56, borderRadius: 'var(--r-2)',
      background: 'var(--surface-2)', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
    }}>
      <window.PopPlus size={32} />
    </div>
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--fg)', marginBottom: 4 }}>
        Plan another brunch
      </div>
      <div style={{ fontSize: 13, color: 'var(--fg-muted)' }}>
        30 seconds. We'll handle the rest.
      </div>
    </div>
    <IconArrowRight size={18} style={{ color: 'var(--fg-subtle)' }} />
  </button>
);

const DashboardV3 = ({ onCreate, onOpenBrunch, theme, onThemeToggle, popMode = 'surgical' }) => {
  const upcoming = window.SAMPLE_BRUNCHES_UPCOMING;
  const past = window.SAMPLE_BRUNCHES_PAST;
  const next = upcoming[0];
  const { ref: respRef, isMobile } = window.useResponsive(720);
  const broad = popMode === 'broad';

  return (
    <div className="bs-app" ref={respRef}>
      <TopBar active="home" onCreate={onCreate} theme={theme} onThemeToggle={onThemeToggle} />
      <main className="bs-page" style={isMobile ? { padding: '24px 16px 64px' } : undefined}>
        {/* Greeting */}
        <div style={{ marginBottom: isMobile ? 28 : 36 }}>
          <p className="bs-eyebrow" style={{ margin: '0 0 8px' }}>Sunday, April 26</p>
          <h1 className="bs-h1" style={isMobile ? { fontSize: 30 } : undefined}>Morning, Yusef <span style={{ display: 'inline-block', transform: 'translateY(-2px)' }}>👋</span></h1>
          <p style={{ color: 'var(--fg-muted)', fontSize: 16, margin: 0, maxWidth: 540, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
            <span>You have <strong style={{ color: 'var(--fg)' }}>1 brunch</strong> coming up</span>
            <span>and</span>
            {/* "1 vote waiting" — Pop sparkle moment */}
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '2px 10px 2px 4px', borderRadius: 'var(--r-pill)',
              background: 'var(--accent-soft)', color: 'var(--accent-fg)',
              fontSize: 14, fontWeight: 500,
            }}>
              <window.PopSparkle size={18} />
              <span><strong>1 vote</strong> waiting</span>
            </span>
            <span>on you.</span>
          </p>
        </div>

        {/* Hero "next up" card */}
        {next && (
          <div className="bs-card elev" style={{ padding: 0, overflow: 'hidden', marginBottom: 40 }}>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.4fr 1fr' }}>
              <div style={{ padding: isMobile ? 22 : 32 }}>
                <div className="bs-row" style={{ gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                  {/* Confirmed pill — Pop check (surgical baseline) */}
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '2px 10px 2px 4px',
                    borderRadius: 'var(--r-pill)',
                    background: 'var(--mint)', color: 'var(--mint-fg)',
                    fontSize: 12, fontWeight: 500, height: 22,
                  }}>
                    <window.PopCheck size={18} />
                    <span>Confirmed</span>
                  </span>
                  <span className="bs-pill">In 7 days</span>
                </div>
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: isMobile ? 24 : 30, fontWeight: 500, letterSpacing: '-0.02em', margin: '0 0 12px' }}>
                  {next.title}
                </h2>
                <div className="bs-col" style={{ gap: 12, color: 'var(--fg-muted)', fontSize: 15 }}>
                  {/* Hero metadata row — Pop icons (surgical baseline) */}
                  <div className="bs-row" style={{ gap: 10 }}><window.PopCalendar size={22} /><span>Sun, May 3 · 11:00 AM</span></div>
                  <div className="bs-row" style={{ gap: 10 }}><window.PopPin size={22} /><span>Tartine Bakery, Mission</span></div>
                  <div className="bs-row" style={{ gap: 10 }}><window.PopUsers size={22} /><span>4 of 5 confirmed</span></div>
                </div>
                <div className="bs-row" style={{ gap: 10, marginTop: 24, flexWrap: 'wrap' }}>
                  <button className="bs-btn primary" onClick={() => onOpenBrunch(next)}>
                    <span>Open</span><IconArrowRight size={16} />
                  </button>
                  <button className="bs-btn">
                    {broad ? <window.PopShare size={18} /> : <IconShare size={15} />}
                    <span>Share link</span>
                  </button>
                </div>
              </div>
              <div style={{ background: 'var(--accent-soft)', padding: isMobile ? 22 : 28, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <p className="bs-eyebrow" style={{ color: 'var(--accent-fg)', opacity: 0.7 }}>Who's coming</p>
                <div className="bs-col" style={{ gap: 10 }}>
                  {next.attendees.map((a) => (
                    <div key={a.id} className="bs-row" style={{ gap: 10 }}>
                      <div className="bs-avatar sm" aria-hidden="true" style={{ background: 'var(--surface)', color: 'var(--accent-fg)' }}>{a.initials}</div>
                      <span style={{ fontSize: 14, color: 'var(--accent-fg)', flex: 1 }}>{a.name}</span>
                      <window.PopCheck size={16} />
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

        {/* Upcoming list — with "Plan another" tail card */}
        <div style={{ marginBottom: 40 }}>
          <div className="bs-row" style={{ marginBottom: 16, justifyContent: 'space-between' }}>
            <h2 className="bs-h2" style={{ margin: 0 }}>Upcoming</h2>
            <span style={{ color: 'var(--fg-subtle)', fontSize: 13 }}>{upcoming.length} brunches</span>
          </div>
          <div className="bs-col" style={{ gap: 10 }}>
            {upcoming.slice(1).map((b) => (
              <BrunchListCardV3 key={b.id} brunch={b} onClick={() => onOpenBrunch(b)} popMode={popMode} />
            ))}
            <PlanAnotherCard onCreate={onCreate} />
          </div>
        </div>

        {/* Past */}
        <div>
          <h2 className="bs-h2">Past brunches</h2>
          <div className="bs-col" style={{ gap: 10 }}>
            {past.map((b) => (
              <BrunchListCardV3 key={b.id} brunch={b} onClick={() => onOpenBrunch(b, { past: true })} past popMode={popMode} />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
};

window.DashboardV3 = DashboardV3;
window.PlanAnotherCard = PlanAnotherCard;
window.BrunchListCardV3 = BrunchListCardV3;
