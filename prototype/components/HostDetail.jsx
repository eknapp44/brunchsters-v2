// 4. Brunch detail — host's manage view.
// Two columns. Left: the brunch context (when/where/voting state).
// Right: attendees + RSVPs. Action bar pinned at bottom of left col.

const HostDetail = ({ onBack, theme, onThemeToggle }) => {
  const { ref: respRef, isMobile } = window.useResponsive(720);
  const attendees = [
    { id: 'u2', name: 'Maya Reyes',  initials: 'MR', rsvp: 'yes' },
    { id: 'u3', name: 'Devon Kim',   initials: 'DK', rsvp: 'yes' },
    { id: 'u4', name: 'Priya Shah',  initials: 'PS', rsvp: 'yes' },
    { id: 'u5', name: 'Sam Liu',     initials: 'SL', rsvp: 'maybe' },
    { id: 'u6', name: 'Robin Cole',  initials: 'RC', rsvp: 'no' },
    { id: 'u7', name: 'Jess Martinez', initials: 'JM', rsvp: 'invited' },
  ];

  const locOptions = [
    { id: 'l1', name: 'Tartine Bakery', sub: '600 Guerrero St · Mission', votes: 4, leader: true },
    { id: 'l2', name: 'Zazie',          sub: '941 Cole St · Cole Valley', votes: 2 },
    { id: 'l3', name: 'Plow',           sub: '1299 18th St · Potrero Hill', votes: 1 },
  ];
  const totalVotes = locOptions.reduce((s, o) => s + o.votes, 0);

  return (
    <div className="bs-app" ref={respRef}>
      <TopBar active="home" onCreate={() => {}} theme={theme} onThemeToggle={onThemeToggle} />
      <main className="bs-page" style={{ maxWidth: 1100, ...(isMobile ? { padding: '24px 16px 64px' } : {}) }}>
        <button className="bs-btn ghost" style={{ marginBottom: 20, paddingLeft: 8 }} onClick={onBack}>
          <IconArrowLeft size={16} /> <span>Back to home</span>
        </button>

        <div className="bs-row" style={{ gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <span className="bs-pill accent dot">Voting open · closes Thursday</span>
          <span className="bs-pill">You're hosting</span>
        </div>
        <h1 className="bs-h1" style={{ marginBottom: 8, ...(isMobile ? { fontSize: 28 } : {}) }}>Birthday brunch for Sam</h1>
        <p style={{ color: 'var(--fg-muted)', fontSize: 16, margin: '0 0 32px', maxWidth: 640 }}>
          Sunday vibes, low-key, bring whoever 💕
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.4fr 1fr', gap: isMobile ? 16 : 28 }}>
          {/* ── Left column ───────────────────────── */}
          <div className="bs-col" style={{ gap: 20 }}>
            {/* Time card */}
            <div className="bs-card" style={{ padding: 22 }}>
              <div className="bs-row" style={{ marginBottom: 14, gap: 10 }}>
                <IconCalendar size={18} style={{ color: 'var(--fg-muted)' }} />
                <h3 className="bs-h3" style={{ margin: 0 }}>When</h3>
                <span className="bs-spacer" />
                <span className="bs-pill mint dot">Locked in</span>
              </div>
              <p style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 500, letterSpacing: '-0.015em' }}>
                Sunday, May 10 · 11:30 AM
              </p>
              <p style={{ color: 'var(--fg-muted)', fontSize: 13, margin: '4px 0 0' }}>14 days away · America/Los_Angeles</p>
            </div>

            {/* Where — voting */}
            <div className="bs-card" style={{ padding: 22 }}>
              <div className="bs-row" style={{ marginBottom: 16, gap: 10 }}>
                <IconPin size={18} style={{ color: 'var(--fg-muted)' }} />
                <h3 className="bs-h3" style={{ margin: 0 }}>Where</h3>
                <span className="bs-spacer" />
                <span className="bs-pill accent dot">{totalVotes} of 6 voted</span>
              </div>
              <div className="bs-col" style={{ gap: 8 }}>
                {locOptions.map((o) => {
                  const pct = totalVotes ? Math.round((o.votes / totalVotes) * 100) : 0;
                  return (
                    <div key={o.id} style={{
                      position: 'relative',
                      padding: '12px 14px',
                      border: '1px solid var(--line)',
                      borderRadius: 'var(--r-2)',
                      background: 'var(--surface)',
                      overflow: 'hidden',
                    }}>
                      <div style={{
                        position: 'absolute', inset: 0,
                        background: o.leader ? 'var(--accent-soft)' : 'var(--surface-2)',
                        width: pct + '%',
                        opacity: o.leader ? 1 : 0.5,
                        transition: 'width 0.4s var(--ease)',
                      }} />
                      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="bs-row" style={{ gap: 8 }}>
                            <span style={{ fontWeight: 500, fontSize: 14 }}>{o.name}</span>
                            {o.leader && <span className="bs-pill accent" style={{ height: 20, fontSize: 11 }}>leading</span>}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{o.sub}</div>
                        </div>
                        <span style={{ fontSize: 13, color: 'var(--fg-muted)', fontVariantNumeric: 'tabular-nums' }}>{o.votes} {o.votes === 1 ? 'vote' : 'votes'}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <button className="bs-btn ghost sm" style={{ marginTop: 12 }}><IconPlus size={14} /> Add another option</button>
            </div>

            {/* Action bar */}
            <div className="bs-row" style={{ gap: 10 }}>
              <button className="bs-btn primary lg">
                <IconCheck size={16} /> <span>Confirm Tartine & close voting</span>
              </button>
              <button className="bs-btn"><IconShare size={15} /> <span>Share</span></button>
              <span className="bs-spacer" />
              <button className="bs-btn ghost"><IconDots size={18} /></button>
            </div>
          </div>

          {/* ── Right column ──────────────────────── */}
          <div className="bs-col" style={{ gap: 20 }}>
            <div className="bs-card" style={{ padding: 22 }}>
              <div className="bs-row" style={{ marginBottom: 14, gap: 10 }}>
                <IconUsers size={18} style={{ color: 'var(--fg-muted)' }} />
                <h3 className="bs-h3" style={{ margin: 0 }}>Who's coming</h3>
                <span className="bs-spacer" />
                <span style={{ fontSize: 13, color: 'var(--fg-muted)', fontVariantNumeric: 'tabular-nums' }}>3 / 6 yes</span>
              </div>
              <div className="bs-col" style={{ gap: 2 }}>
                {attendees.map((a) => {
                  const meta = a.rsvp === 'yes' ? { pill: 'mint', label: 'Yes' }
                              : a.rsvp === 'maybe' ? { pill: '', label: 'Maybe' }
                              : a.rsvp === 'no' ? { pill: '', label: 'Can\'t make it', dim: true }
                              : { pill: '', label: 'Awaiting RSVP', dim: true };
                  return (
                    <div key={a.id} className="bs-row" style={{ gap: 10, padding: '8px 0', opacity: meta.dim ? 0.65 : 1 }}>
                      <div className="bs-avatar" aria-hidden="true">{a.initials}</div>
                      <span style={{ fontSize: 14, flex: 1 }}>{a.name}</span>
                      <span className={`bs-pill${meta.pill ? ' ' + meta.pill : ''} dot`} style={{ height: 22 }}>
                        {meta.label}
                      </span>
                    </div>
                  );
                })}
              </div>
              <hr className="bs-divider" />
              <button className="bs-btn block"><IconPlus size={14} /> <span>Invite more friends</span></button>
            </div>

            <div className="bs-card flat" style={{ padding: 18, background: 'var(--surface-2)', border: '1px dashed var(--line)' }}>
              <div className="bs-row" style={{ gap: 10, marginBottom: 8 }}>
                <IconSparkle size={16} style={{ color: 'var(--accent-strong)' }} />
                <p className="bs-eyebrow" style={{ margin: 0 }}>Heads up</p>
              </div>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--fg-muted)', lineHeight: 1.5 }}>
                Tartine is leading by 2 votes. You can confirm now, or wait until voting closes Thursday.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

window.HostDetail = HostDetail;
