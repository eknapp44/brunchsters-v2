// v3 HostDetail — adds CountdownRing on the voting card,
// shows an auto-close prompt when most people have voted, and
// runs through the Pop-icon audit (surgical or broad based on tweak).

const HostDetailV3 = ({ onBack, theme, onThemeToggle, popMode = 'surgical' }) => {
  const { ref: respRef, isMobile } = window.useResponsive(720);

  // ── voting state for the demo ────────────────────────
  // hoursTotal = window length (Tue noon → Thu midnight ≈ 60h)
  // hoursLeft  = remaining; sliding via a tweak would let user explore states
  const hoursTotal = 60;
  const [hoursLeft, setHoursLeft] = React.useState(28); // ~1d 4h left
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const [changeOpen, setChangeOpen] = React.useState(false);
  const [overflowOpen, setOverflowOpen] = React.useState(false);
  const [cancelled, setCancelled] = React.useState(false);

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
  const eligible = 6;
  const allVoted = totalVotes >= eligible;
  const mostVoted = totalVotes >= Math.ceil(eligible * 0.66);

  const urgent = hoursLeft <= 24;
  const broad = popMode === 'broad';

  // Pop-icon helpers — use Pop or stroke based on mode + position
  const HeaderIcon = ({ Stroke, Pop }) => broad ? <Pop size={20} /> : <Stroke size={18} style={{ color: 'var(--fg-muted)' }} />;

  return (
    <div className="bs-app" ref={respRef}>
      <TopBar active="home" onCreate={() => {}} theme={theme} onThemeToggle={onThemeToggle} />
      <main className="bs-page" style={{ maxWidth: 1100, ...(isMobile ? { padding: '24px 16px 64px' } : {}) }}>
        <button className="bs-btn ghost" style={{ marginBottom: 20, paddingLeft: 8 }} onClick={onBack}>
          <IconArrowLeft size={16} /> <span>Back to home</span>
        </button>

        <div className="bs-row" style={{ gap: 10, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Voting status pill — now with countdown ring */}
          <span className="bs-pill accent" style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            paddingLeft: 8, paddingRight: 12,
          }}>
            <window.CountdownRing hoursTotal={hoursTotal} hoursLeft={hoursLeft} size={18} />
            <span>
              {urgent ? 'Last call · closes' : 'Votes coming in · closes'} in {window.formatCountdown(hoursLeft)}
            </span>
          </span>
          <span className="bs-pill">You're hosting</span>
        </div>

        <h1 className="bs-h1" style={{ marginBottom: 8, ...(isMobile ? { fontSize: 28 } : {}) }}>Birthday brunch for Sam</h1>
        <p style={{ color: 'var(--fg-muted)', fontSize: 16, margin: '0 0 32px', maxWidth: 640 }}>
          Sunday vibes, low-key, bring whoever 💕
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.4fr 1fr', gap: isMobile ? 16 : 28 }}>
          {/* ── Left column ───────────────────────── */}
          <div className="bs-col" style={{ gap: 20 }}>
            {/* Time card with inline calendar chip */}
            <div className="bs-card" style={{ padding: 22 }}>
              <div className="bs-row" style={{ marginBottom: 14, gap: 10 }}>
                <HeaderIcon Stroke={IconCalendar} Pop={window.PopCalendar} />
                <h3 className="bs-h3" style={{ margin: 0 }}>When</h3>
                <span className="bs-spacer" />
                <span className="bs-pill mint dot">Locked in</span>
              </div>
              <div className="bs-row" style={{ gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <p style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 500, letterSpacing: '-0.015em' }}>
                    Sunday, May 10 · 11:30 AM
                  </p>
                  <p style={{ color: 'var(--fg-muted)', fontSize: 13, margin: '4px 0 0' }}>14 days away · America/Los_Angeles</p>
                </div>
                <window.CalendarChip
                  title="Birthday brunch for Sam"
                  description="Sunday vibes, low-key, bring whoever"
                  location={!allVoted && hoursLeft > 0 ? '' : 'Tartine Bakery, 600 Guerrero St'}
                  startISO="2026-05-10T11:30:00"
                  endISO="2026-05-10T13:30:00"
                  votingOpen={hoursLeft > 0 && !allVoted}
                />
              </div>
            </div>

            {/* Where — voting */}
            <div className="bs-card" style={{ padding: 22 }}>
              <div className="bs-row" style={{ marginBottom: 16, gap: 10, alignItems: 'center' }}>
                <HeaderIcon Stroke={IconPin} Pop={window.PopPin} />
                <h3 className="bs-h3" style={{ margin: 0 }}>Where</h3>
                <span className="bs-spacer" />
                <span className="bs-pill accent" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, paddingLeft: 8 }}>
                  <window.CountdownRing hoursTotal={hoursTotal} hoursLeft={hoursLeft} size={16} />
                  <span>{totalVotes} of {eligible} in · {window.formatCountdown(hoursLeft)} to go</span>
                </span>
              </div>

              {/* Auto-close prompt — appears once most people have voted */}
              {mostVoted && !allVoted && (
                <div style={{
                  marginBottom: 14, padding: '12px 14px',
                  background: 'var(--accent-soft)', borderRadius: 'var(--r-2)',
                  display: 'flex', alignItems: 'center', gap: 12,
                }}>
                  {broad ? <window.PopSparkle size={22} /> : <IconSparkle size={16} style={{ color: 'var(--accent-fg)' }} />}
                  <div style={{ flex: 1, fontSize: 13, color: 'var(--accent-fg)', lineHeight: 1.4 }}>
                    <strong>{eligible - totalVotes} {eligible - totalVotes === 1 ? 'person hasn\'t' : 'people haven\'t'} voted yet.</strong>
                    {' '}Tartine's up 4–2. Call it now?
                  </div>
                  <button className="bs-btn sm">Call it</button>
                </div>
              )}

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
              <button className="bs-btn ghost sm" style={{ marginTop: 12 }}>
                {broad ? <window.PopPlus size={18} /> : <IconPlus size={14} />} Add another option
              </button>
            </div>

            {/* Action bar — primary stacks on mobile so "Lock in Tartine"
                has room to breathe; on desktop everything sits inline. */}
            <div className={isMobile ? 'bs-col' : 'bs-row'}
                 style={{ gap: 10, position: 'relative' }}>
              <button className="bs-btn primary lg"
                      style={isMobile ? { width: '100%' } : undefined}>
                {broad ? <window.PopCheck size={18} /> : <IconCheck size={16} />} <span>Lock in Tartine</span>
              </button>
              <div className="bs-row" style={{ gap: 10, position: 'relative' }}>
                <button className="bs-btn" style={isMobile ? { flex: 1 } : undefined}>
                  {broad ? <window.PopShare size={18} /> : <IconShare size={15} />} <span>Share</span>
                </button>
                <button className="bs-btn" onClick={() => setChangeOpen(true)}
                        style={isMobile ? { flex: 1 } : undefined}>
                  <span>Tweak details</span>
                </button>
                {!isMobile && <span className="bs-spacer" />}
                <button className="bs-btn ghost" onClick={() => setOverflowOpen(!overflowOpen)} aria-label="More actions">
                  <IconDots size={18} />
                </button>
                {overflowOpen && (
                  <div style={{
                    position: 'absolute', right: 0, top: 'calc(100% + 4px)', zIndex: 20,
                    minWidth: 200, padding: 6,
                    background: 'var(--surface)', border: '1px solid var(--line)',
                    borderRadius: 'var(--r-2)', boxShadow: '0 12px 32px -8px oklch(0.20 0.01 70 / 0.20)',
                  }}>
                    <button onClick={() => { setOverflowOpen(false); setChangeOpen(true); }}
                            className="bs-btn ghost" style={{ width: '100%', justifyContent: 'flex-start' }}>
                      Tweak time, date, location…
                    </button>
                    <button onClick={() => { setOverflowOpen(false); setCancelOpen(true); }}
                            className="bs-btn ghost" style={{
                              width: '100%', justifyContent: 'flex-start',
                              color: 'oklch(0.50 0.180 30)',
                            }}>
                      Call it off
                    </button>
                  </div>
                )}
              </div>
            </div>
            {cancelled && (
              <div style={{
                padding: 14, borderRadius: 'var(--r-2)',
                background: 'oklch(0.96 0.030 30)', border: '1px solid oklch(0.85 0.080 30)',
                color: 'oklch(0.35 0.140 30)', fontSize: 13,
              }}>
                <strong>Brunch called off.</strong> Everyone who said yes, maybe, or hadn't said yet has been notified.
              </div>
            )}
            <window.CancelBrunchModal open={cancelOpen} onClose={() => setCancelOpen(false)}
              onConfirm={() => { setCancelOpen(false); setCancelled(true); }} />
            <window.ChangeBrunchModal open={changeOpen} onClose={() => setChangeOpen(false)}
              onSave={() => setChangeOpen(false)} />
          </div>

          {/* ── Right column ──────────────────────── */}
          <div className="bs-col" style={{ gap: 20 }}>
            <div className="bs-card" style={{ padding: 22 }}>
              <div className="bs-row" style={{ marginBottom: 14, gap: 10 }}>
                <HeaderIcon Stroke={IconUsers} Pop={window.PopUsers} />
                <h3 className="bs-h3" style={{ margin: 0 }}>Who's coming</h3>
                <span className="bs-spacer" />
                <span style={{ fontSize: 13, color: 'var(--fg-muted)', fontVariantNumeric: 'tabular-nums' }}>3 / 6 yes</span>
              </div>
              <div className="bs-col" style={{ gap: 2 }}>
                {attendees.map((a) => {
                  const meta = a.rsvp === 'yes' ? { pill: 'mint', label: 'Yes', usePop: true }
                              : a.rsvp === 'maybe' ? { pill: '', label: 'Maybe' }
                              : a.rsvp === 'no' ? { pill: '', label: 'Can\'t make it', dim: true }
                              : { pill: '', label: 'Hasn\'t said yet', dim: true };
                  return (
                    <div key={a.id} className="bs-row" style={{ gap: 10, padding: '8px 0', opacity: meta.dim ? 0.65 : 1 }}>
                      <div className="bs-avatar" aria-hidden="true">{a.initials}</div>
                      <span style={{ fontSize: 14, flex: 1 }}>{a.name}</span>
                      {a.rsvp === 'yes' ? (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                          padding: '2px 10px 2px 4px',
                          borderRadius: 'var(--r-pill)',
                          background: 'var(--mint)', color: 'var(--mint-fg)',
                          fontSize: 12, fontWeight: 500, height: 22,
                        }}>
                          <window.PopCheck size={18} />
                          <span>Yes</span>
                        </span>
                      ) : (
                        <span className={`bs-pill${meta.pill ? ' ' + meta.pill : ''} dot`} style={{ height: 22 }}>
                          {meta.label}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              <hr className="bs-divider" />
              <button className="bs-btn block">
                {broad ? <window.PopPlus size={18} /> : <IconPlus size={14} />} <span>Invite more friends</span>
              </button>
            </div>

            <div className="bs-card flat" style={{ padding: 18, background: 'var(--surface-2)', border: '1px dashed var(--line)' }}>
              <div className="bs-row" style={{ gap: 10, marginBottom: 8 }}>
                <window.PopSparkle size={20} />
                <p className="bs-eyebrow" style={{ margin: 0 }}>Heads up</p>
              </div>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--fg-muted)', lineHeight: 1.5 }}>
                Tartine's up by 2. {urgent
                  ? <>Voting closes in <strong>{window.formatCountdown(hoursLeft)}</strong> — lock it in now, or let votes ride.</>
                  : <>Lock it in now, or let votes ride till close.</>}
              </p>
            </div>
          </div>
        </div>

        {/* Demo control: scrub deadline to see ring + amber state + auto-close prompt
            (shown only on the artboard, hidden in mobile detail view) */}
        {!isMobile && (
          <div style={{ marginTop: 32, padding: 14, background: 'var(--surface-2)', borderRadius: 'var(--r-2)',
                        border: '1px dashed var(--line)', display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-subtle)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Demo
            </span>
            <span style={{ fontSize: 13, color: 'var(--fg-muted)' }}>Time left in voting:</span>
            <input type="range" min="1" max={hoursTotal} step="1" value={hoursLeft}
                   onChange={(e) => setHoursLeft(Number(e.target.value))}
                   style={{ flex: 1, accentColor: 'var(--accent-strong)' }} />
            <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--fg)', minWidth: 50, textAlign: 'right' }}>
              {window.formatCountdown(hoursLeft)}
            </span>
          </div>
        )}
      </main>
    </div>
  );
};

window.HostDetailV3 = HostDetailV3;
