// MobileShell — true mobile design (not just responsive collapse).
//
// - Bottom tab bar with prominent center "Plan" FAB (taller, butter-colored)
// - Stacked vertical dashboard cards: next-up extra-tall + detailed; rest compact
// - Bottom-sheet wizard for Quick Brunch (drag handle, swipe down to dismiss)
// - Full-screen wizard for the voting wizard (more committed flow)
//
// Designed against a 420×900 phone artboard.

const MobileTabBar = ({ active = 'home', onNav = () => {}, onPlan = () => {} }) => (
  <nav className="ms-tabbar">
    <button className={`ms-tab ${active === 'home' ? 'active' : ''}`} onClick={() => onNav('home')} aria-label="Home">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-7H10v7H5a1 1 0 01-1-1z"/>
      </svg>
      <span>Home</span>
    </button>
    <button className={`ms-tab ${active === 'brunches' ? 'active' : ''}`} onClick={() => onNav('brunches')} aria-label="Brunches">
      <window.IconCalendar size={22} />
      <span>Brunches</span>
    </button>

    {/* Center FAB — taller, butter-colored */}
    <button className="ms-fab" onClick={onPlan} aria-label="Plan a brunch">
      <window.IconPlus size={26} />
    </button>

    <button className={`ms-tab ${active === 'inbox' ? 'active' : ''}`} onClick={() => onNav('inbox')} aria-label="Inbox">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 12l-4-7H6l-4 7v6a2 2 0 002 2h16a2 2 0 002-2zM2 12h6l2 3h4l2-3h6"/>
      </svg>
      <span className="ms-tab-label-with-dot">
        Inbox
        <span className="ms-dot" />
      </span>
    </button>
    <button className={`ms-tab ${active === 'me' ? 'active' : ''}`} onClick={() => onNav('me')} aria-label="Profile">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="9" r="3.6"/>
        <path d="M5 20c.6-3.5 3.5-5.5 7-5.5s6.4 2 7 5.5"/>
      </svg>
      <span>Me</span>
    </button>
  </nav>
);

// ─── Mobile dashboard (stacked vertical, hero extra-tall) ────────────
const MobileDashboard = ({ onOpenBrunch }) => {
  const upcoming = window.SAMPLE_BRUNCHES_UPCOMING;
  const past = window.SAMPLE_BRUNCHES_PAST;
  const next = upcoming[0];
  const others = upcoming.slice(1);

  return (
    <div className="ms-content">
      {/* Greeting */}
      <header className="ms-greet">
        <p className="bs-eyebrow">Sunday, April 26</p>
        <h1 style={{
          fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 500,
          letterSpacing: '-0.02em', margin: '6px 0 8px',
        }}>
          Morning, Yusef <span style={{ display: 'inline-block', transform: 'translateY(-1px)' }}>👋</span>
        </h1>
        <p style={{ fontSize: 14, color: 'var(--fg-muted)', margin: 0, lineHeight: 1.5 }}>
          1 brunch coming up · 1 vote waiting on you
        </p>
      </header>

      {/* Hero — extra-tall, detailed */}
      {next && (
        <div className="ms-hero" onClick={() => onOpenBrunch(next)}>
          {/* top metadata strip */}
          <div className="ms-hero-strip">
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

          <h2 className="ms-hero-title">{next.title}</h2>

          <div className="ms-hero-meta">
            <div className="ms-meta-row"><window.PopCalendar size={22} /><span>Sun, May 3 · 11:00 AM</span></div>
            <div className="ms-meta-row"><window.PopPin size={22} /><span>Tartine Bakery, Mission</span></div>
            <div className="ms-meta-row"><window.PopUsers size={22} /><span>4 of 5 confirmed</span></div>
          </div>

          {/* attendee mini-strip */}
          <div className="ms-attendees">
            <div className="bs-stack">
              {next.attendees.slice(0, 4).map((a) => (
                <div key={a.id} className="bs-avatar sm" aria-label={a.name} role="img">{a.initials}</div>
              ))}
            </div>
            <span style={{ fontSize: 13, color: 'var(--fg-muted)' }}>
              {next.attendees.map(a => a.name.split(' ')[0]).slice(0, 3).join(', ')} & 1 more
            </span>
          </div>

          <div className="ms-hero-actions">
            <button className="bs-btn primary" style={{ flex: 1 }} onClick={(e) => { e.stopPropagation(); onOpenBrunch(next); }}>
              <span>Manage</span> <IconArrowRight size={16} />
            </button>
            <button className="bs-btn" onClick={(e) => e.stopPropagation()} aria-label="Share">
              <window.PopShare size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Stacked compact upcoming */}
      {others.length > 0 && (
        <section className="ms-section">
          <h3 className="ms-section-title">Also coming up</h3>
          <div className="bs-col" style={{ gap: 10 }}>
            {others.map((b) => (
              <button key={b.id} className="ms-list-card" onClick={() => onOpenBrunch(b)}>
                <div className="date">
                  <div className="m">{b.date.m}</div>
                  <div className="d">{b.date.d}</div>
                </div>
                <div className="meta">
                  <div className="title">{b.title}</div>
                  <div className="sub">
                    <span>{b.timeLabel}</span>
                    <span> · </span>
                    <span>{b.location}</span>
                  </div>
                  <div className="bs-row" style={{ gap: 6, marginTop: 6, alignItems: 'center' }}>
                    {b.status === 'voting' && (
                      <span className="bs-pill accent dot" style={{ height: 20, fontSize: 11 }}>Voting open</span>
                    )}
                    {b.status === 'planning' && <span className="bs-pill dot" style={{ height: 20, fontSize: 11 }}>Planning</span>}
                    {b.role === 'host' && <span className="bs-pill" style={{ height: 20, fontSize: 11 }}>You're hosting</span>}
                  </div>
                </div>
                <IconArrowRight size={16} style={{ color: 'var(--fg-subtle)' }} />
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Past */}
      <section className="ms-section">
        <h3 className="ms-section-title">Past</h3>
        <div className="bs-col" style={{ gap: 10 }}>
          {past.slice(0, 2).map((b) => (
            <button key={b.id} className="ms-list-card past" onClick={() => onOpenBrunch(b, { past: true })}>
              <div className="date">
                <div className="m">{b.date.m}</div>
                <div className="d">{b.date.d}</div>
              </div>
              <div className="meta">
                <div className="title">{b.title}</div>
                <div className="sub">{b.timeLabel} · {b.location}</div>
              </div>
              <IconArrowRight size={16} style={{ color: 'var(--fg-subtle)' }} />
            </button>
          ))}
        </div>
      </section>
    </div>
  );
};

// ─── Bottom sheet for Quick Brunch ────────────────────
const BottomSheet = ({ open, onClose, peek = false, children }) => {
  const sheetRef = React.useRef(null);
  const [drag, setDrag] = React.useState(0);
  const startY = React.useRef(0);
  const dragging = React.useRef(false);

  // Esc key dismisses the sheet — keyboard parity with the drag/scrim.
  // (Partial-flagged in the a11y pass; now resolved.)
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Trap Tab inside the sheet while it's open. Restores focus to the
  // launching button (the FAB, usually) on dismiss.
  window.useFocusTrap(sheetRef, open);

  const onPointerDown = (e) => {
    dragging.current = true;
    startY.current = e.clientY;
  };
  const onPointerMove = (e) => {
    if (!dragging.current) return;
    const dy = Math.max(0, e.clientY - startY.current);
    setDrag(dy);
  };
  const onPointerUp = () => {
    dragging.current = false;
    if (drag > 120) onClose();
    setDrag(0);
  };

  if (!open) return null;
  return (
    <>
      <div className="ms-sheet-scrim" onClick={onClose} />
      <div className="ms-sheet" ref={sheetRef}
           role="dialog" aria-modal="true" aria-label="Plan a brunch"
           style={{ transform: `translateY(${drag}px)`, transition: drag === 0 ? 'transform 0.3s var(--ease-spring)' : 'none' }}>
        <div className="ms-sheet-handle"
             onPointerDown={onPointerDown}
             onPointerMove={onPointerMove}
             onPointerUp={onPointerUp}
             onPointerCancel={onPointerUp}>
          <div className="ms-sheet-grabber" />
        </div>
        <div className="ms-sheet-body">{children}</div>
      </div>
    </>
  );
};

// ─── Mobile Quick Brunch — composer-feel inside a bottom sheet ─────
const MobileQuickBrunch = ({ onClose, onUpgrade, prefill }) => {
  // Replan-from-past entry: same contract as desktop QuickBrunch — seed
  // title + where + who from the past brunch, drop the user past the
  // pre-filled stages so they're explicitly choosing a new time.
  const [stage, setStage] = React.useState(prefill ? 2 : 0);
  const [data, setData] = React.useState({
    title: prefill?.title || '',
    locations: prefill?.location ? [prefill.location] : [],
    times: [],
    invited: prefill?.invitees || [],
  });
  const [replanFrom, setReplanFrom] = React.useState(prefill?.fromBrunch || null);

  const clearReplan = () => {
    setReplanFrom(null);
    setData({ title: '', locations: [], times: [], invited: [] });
    setStage(0);
  };

  const ReplanBanner = () => replanFrom ? (
    <div className="bs-row" style={{
      gap: 8, alignItems: 'center',
      padding: '10px 14px', margin: '0 0 12px',
      borderRadius: 'var(--r-2)',
      background: 'var(--accent-soft)',
      border: '1px solid var(--accent)',
      color: 'var(--accent-fg)',
      fontSize: 12.5,
    }}>
      <window.IconSparkle size={14} />
      <div style={{ flex: 1, lineHeight: 1.35 }}>
        Bringing back <strong>{replanFrom.title}</strong> — round two 🥂 Pick a time.
      </div>
      <button onClick={clearReplan} className="bs-link-inline" style={{
        background: 'transparent', border: 'none', padding: 0,
        color: 'var(--accent-fg)', textDecoration: 'underline',
        textUnderlineOffset: 3, fontSize: 12.5, cursor: 'pointer', fontWeight: 500,
      }}>Nah, start fresh</button>
    </div>
  ) : null;

  const advance = () => setStage(stage + 1);

  if (stage === 0) {
    return (
      <div className="ms-qb">
        <div className="ms-qb-header">
          <button onClick={onClose} className="bs-btn ghost" style={{ padding: '6px 10px' }}>Cancel</button>
          <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--fg-muted)' }}>Quick brunch</span>
          <span style={{ width: 60 }} />
        </div>
        <div className="ms-qb-body">
          <ReplanBanner />
          <p className="bs-eyebrow" style={{ margin: '0 0 8px' }}>What's the occasion?</p>
          <input
            autoFocus
            className="bs-input"
            style={{
              fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 500,
              letterSpacing: '-0.02em', height: 'auto', padding: '8px 0',
              border: 'none', background: 'transparent',
              borderBottom: '2px solid var(--line)',
              borderRadius: 0,
            }}
            placeholder="Sunday catch-up"
            value={data.title}
            onChange={(e) => setData({ ...data, title: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Enter' && data.title.trim()) advance(); }}
          />
          <div className="bs-row" style={{ marginTop: 20, gap: 8, flexWrap: 'wrap' }}>
            {['Sunday catch-up', "Maya's birthday", 'Old roommates'].map(t => (
              <button key={t} onClick={() => setData({ ...data, title: t })}
                      style={{
                        padding: '6px 12px', borderRadius: 'var(--r-pill)',
                        border: '1px solid var(--line)', background: 'var(--surface)',
                        fontSize: 13, color: 'var(--fg)',
                      }}>{t}</button>
            ))}
          </div>
        </div>
        <div className="ms-qb-footer">
          <button className="bs-btn primary lg" disabled={!data.title.trim()} style={{ flex: 1, opacity: data.title.trim() ? 1 : 0.4 }} onClick={advance}>
            Continue <IconArrowRight size={16} />
          </button>
        </div>
        <div className="ms-qb-escape">
          Need to gather opinions?
          <button onClick={onUpgrade} style={{
            background: 'transparent', border: 'none', padding: 0, marginLeft: 6,
            color: 'var(--accent-fg)', textDecoration: 'underline', textUnderlineOffset: 3,
            fontSize: 13, cursor: 'pointer',
          }}>Switch to wizard →</button>
        </div>
      </div>
    );
  }

  // Stage 1: Where (compact list)
  if (stage === 1) {
    return (
      <div className="ms-qb">
        <div className="ms-qb-header">
          <button onClick={() => setStage(0)} className="bs-btn ghost" style={{ padding: '6px 10px' }}>
            <IconArrowLeft size={16} /> Back
          </button>
          <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--fg-muted)' }}>Where?</span>
          <span style={{ width: 60 }} />
        </div>
        <div className="ms-qb-body">
          <ReplanBanner />
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 500, letterSpacing: '-0.02em', margin: '0 0 14px' }}>
            Pick a spot
          </h2>
          <div className="bs-col" style={{ gap: 8 }}>
            {window.SAMPLE_LOCATIONS.slice(0, 4).map((loc) => {
              const isSelected = !!data.locations.find(s => s.id === loc.id);
              return (
                <button key={loc.id} className={`bs-option${isSelected ? ' selected' : ''}`}
                        onClick={() => setData({
                          ...data,
                          locations: isSelected
                            ? data.locations.filter(s => s.id !== loc.id)
                            : [...data.locations, loc]
                        })}>
                  <div className="radio" />
                  <div className="body">
                    <div className="title">{loc.name}</div>
                    <div className="sub">{loc.neighborhood}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
        <div className="ms-qb-footer">
          <button className="bs-btn primary lg" disabled={!data.locations.length} style={{ flex: 1, opacity: data.locations.length ? 1 : 0.4 }} onClick={advance}>
            Continue <IconArrowRight size={16} />
          </button>
        </div>
      </div>
    );
  }

  // (Stages 2/3 abbreviated — same pattern.) For artboard demo we land
  // a placeholder confirmation here.
  return (
    <div className="ms-qb">
      <div className="ms-qb-header">
        <button onClick={() => setStage(stage - 1)} className="bs-btn ghost" style={{ padding: '6px 10px' }}>
          <IconArrowLeft size={16} /> Back
        </button>
        <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--fg-muted)' }}>Almost there</span>
        <span style={{ width: 60 }} />
      </div>
      <div className="ms-qb-body" style={{ padding: '20px 20px 40px' }}>
        <ReplanBanner />
        <div style={{ textAlign: 'center', paddingTop: 20 }}>
        <window.PopCheck size={56} />
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 500, letterSpacing: '-0.02em', margin: '16px 0 8px' }}>
          Looking good
        </h2>
        <p style={{ fontSize: 14, color: 'var(--fg-muted)', margin: 0 }}>
          {replanFrom ? 'One thing left — a time. Then it ships.' : 'Continue picking time + invitees to send.'}
        </p>
        </div>
      </div>
      <div className="ms-qb-footer">
        <button className="bs-btn primary lg" style={{ flex: 1 }} onClick={onClose}>
          Send invites <IconArrowRight size={16} />
        </button>
      </div>
    </div>
  );
};

// ─── Mobile Shell — full mobile prototype with sheet wired up ──
const MobileShell = ({ initialView = 'home' }) => {
  const [view, setView] = React.useState(initialView);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [quickPrefill, setQuickPrefill] = React.useState(null);
  const [openBrunch, setOpenBrunch] = React.useState(null);

  // Open the quick-brunch sheet with optional prefill from a past brunch.
  // Closing the sheet (any path) clears prefill so a fresh "Plan" tap from
  // the FAB doesn't pick up stale data.
  const openSheet = (prefill = null) => {
    setQuickPrefill(prefill);
    setSheetOpen(true);
  };
  const closeSheet = () => {
    setSheetOpen(false);
    setQuickPrefill(null);
  };

  return (
    <div className="ms-frame">
      {/* status bar */}
      <div className="ms-statusbar">
        <span>9:41</span>
        <div className="bs-row" style={{ gap: 6 }}>
          <span style={{ fontSize: 11 }}>●●●</span>
          <span style={{ fontSize: 11 }}>WiFi</span>
          <span style={{ fontSize: 11 }}>100%</span>
        </div>
      </div>

      {/* main content */}
      <div className="ms-scroll">
        {view === 'home' && <MobileDashboard onOpenBrunch={(b, opts) => {
          setOpenBrunch(b);
          setView(opts?.past ? 'past' : 'detail');
        }} />}
        {view === 'detail' && (
          <div className="ms-content">
            <button onClick={() => setView('home')} className="bs-btn ghost" style={{ marginBottom: 12, paddingLeft: 4 }}>
              <IconArrowLeft size={16} /> Back
            </button>
            <window.HostDetailV3 onBack={() => setView('home')} popMode="surgical" />
          </div>
        )}
        {view === 'past' && (
          <div className="ms-content">
            <button onClick={() => setView('home')} className="bs-btn ghost" style={{ marginBottom: 12, paddingLeft: 4 }}>
              <IconArrowLeft size={16} /> Back
            </button>
            <window.PastBrunchDetail
              onBack={() => setView('home')}
              brunch={openBrunch}
              onReplan={(prefill) => { setView('home'); openSheet(prefill); }}
            />
          </div>
        )}
      </div>

      <MobileTabBar active={view === 'home' ? 'home' : ''}
                    onNav={setView}
                    onPlan={() => openSheet()} />

      <BottomSheet open={sheetOpen} onClose={closeSheet}>
        <MobileQuickBrunch onClose={closeSheet} onUpgrade={closeSheet} prefill={quickPrefill} />
      </BottomSheet>
    </div>
  );
};

window.MobileShell = MobileShell;
window.MobileDashboard = MobileDashboard;
window.MobileTabBar = MobileTabBar;
window.MobileQuickBrunch = MobileQuickBrunch;
window.BottomSheet = BottomSheet;
