// V11LateAdditions — design artboards for v1.1 decisions recorded
// in Engineering Handoff v1.1. Each component is a self-contained
// surface rendered into the design canvas so engineering can see the
// actual UI for the new decisions, not just spec text.
//
//   - RunningLateSurfaces     : "I'll be late" RSVP option + day-of "tell the gang" push
//   - PlusOneEditSurface      : editing plus-one names after submit
//   - HostTransferSurface     : "Hand off hosting" modal
//   - UndoCancelSurface       : the 5-second undo toast post-cancel
//   - TimezoneSurface         : multi-timezone time card display
//   - ReducedDataGallery      : six inline reduced-data states
//   - InlineTieBreakerSurface : tie-break shown inline on host detail (not a modal)

// ─────────────────────────────────────────────────────────────────────
// Tiny shared helpers
// ─────────────────────────────────────────────────────────────────────
const v11SectionStyle = {
  display: 'grid', gap: 16,
  fontFamily: 'var(--font-sans, "Nunito", sans-serif)',
};
const v11Eyebrow = {
  fontSize: 11, fontWeight: 700, letterSpacing: '0.12em',
  textTransform: 'uppercase', color: 'var(--fg-subtle)', margin: 0,
};
const v11Caption = {
  fontSize: 12, color: 'var(--fg-subtle)', margin: '6px 0 0',
};
const v11Avatar = (initials, hue = 50) => (
  <div style={{
    width: 32, height: 32, borderRadius: '50%',
    background: `oklch(0.85 0.080 ${hue})`,
    color: `oklch(0.32 0.110 ${hue})`,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 12, fontWeight: 700, letterSpacing: 0.5,
    border: '2px solid var(--surface)',
  }}>{initials}</div>
);

// ─────────────────────────────────────────────────────────────────────
// 1. Running late — two surfaces in one artboard
// ─────────────────────────────────────────────────────────────────────
const RunningLateSurfaces = () => {
  const [planLate, setPlanLate] = React.useState(true);
  const [pushedDayOf, setPushedDayOf] = React.useState(false);

  return (
    <div style={{ ...v11SectionStyle, gap: 28 }}>
      {/* Surface A — planning-ahead "late" RSVP option */}
      <div>
        <p style={v11Eyebrow}>Surface A · Planning-ahead</p>
        <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 22, margin: '4px 0 14px' }}>
          Pick "I'll be late" when you RSVP yes.
        </h3>
        <div className="bs-card elev" style={{ padding: 20, maxWidth: 520 }}>
          <div className="bs-row" style={{ gap: 10, marginBottom: 12 }}>
            {v11Avatar('YOU', 35)}
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Your RSVP — Sunday at Tartine</div>
              <div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>11:00 AM · 4 yeses so far</div>
            </div>
            <span className="bs-pill mint">Yes 🎉</span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--fg-muted)', margin: '0 0 10px' }}>Anything the host should know?</p>
          <div className="bs-row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => setPlanLate(!planLate)}
                    className="bs-btn sm"
                    style={{
                      borderColor: planLate ? 'var(--accent-strong)' : 'var(--line)',
                      background: planLate ? 'var(--accent-soft)' : 'var(--surface)',
                      color: planLate ? 'var(--accent-fg)' : 'var(--fg)',
                    }}>
              {planLate ? '✓ I\'ll be ~15 min late' : 'I\'ll be late'}
            </button>
            <button className="bs-btn sm">+1 plus-one</button>
            <button className="bs-btn sm">Leaving early</button>
            <button className="bs-btn sm">Dietary note</button>
          </div>
          <p style={v11Caption}>
            Sets a soft "late" flag on your RSVP. Host sees it; the rest of the gang sees it on the attendee list.
          </p>
        </div>
      </div>

      {/* Surface B — day-of action */}
      <div>
        <p style={v11Eyebrow}>Surface B · Day-of · within T-1h</p>
        <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 22, margin: '4px 0 14px' }}>
          One-tap "tell the gang" the morning of.
        </h3>
        <div className="bs-card elev" style={{ padding: 20, maxWidth: 520 }}>
          <div className="bs-row" style={{ gap: 10, marginBottom: 8 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'oklch(0.95 0.060 70)', color: 'oklch(0.40 0.14 60)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18,
            }}>⏰</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Brunch in 35 min</div>
              <div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>Tartine · Sunday 11:00 AM</div>
            </div>
          </div>
          <p style={{ fontSize: 13, color: 'var(--fg-muted)', margin: '8px 0 14px' }}>
            Stuck in line for coffee? Train delayed? Let the gang know.
          </p>
          {!pushedDayOf ? (
            <button className="bs-btn primary block" onClick={() => setPushedDayOf(true)}>
              <span style={{ fontSize: 16 }}>🏃</span>
              <span>Tell the gang I'm running late</span>
            </button>
          ) : (
            <div style={{
              padding: 12, borderRadius: 8,
              background: 'oklch(0.94 0.055 150)', color: 'oklch(0.32 0.12 150)',
              fontSize: 13, fontWeight: 600, textAlign: 'center',
            }}>
              ✓ Pinged the gang — they know you're on your way.
            </div>
          )}
          <p style={v11Caption}>
            Fires a single push to all yes-RSVPs. No chat thread. No follow-up required.
            Surface only appears within 1 hour of start time.
          </p>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────
// 2. Plus-one name editing
// ─────────────────────────────────────────────────────────────────────
const PlusOneEditSurface = () => {
  const [editing, setEditing] = React.useState(false);
  const [name, setName] = React.useState('Jordan');
  const [draft, setDraft] = React.useState(name);

  return (
    <div style={{ ...v11SectionStyle, maxWidth: 520 }}>
      <div>
        <p style={v11Eyebrow}>Invitee · After RSVP yes + plus-one</p>
        <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 22, margin: '4px 0 14px' }}>
          Plus-one names stay editable until brunch starts.
        </h3>
      </div>

      <div className="bs-card elev" style={{ padding: 20 }}>
        <div className="bs-row" style={{ gap: 10, marginBottom: 14 }}>
          {v11Avatar('MA', 25)}
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Maya · Yes</div>
            <div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>RSVP'd 2 days ago</div>
          </div>
          <span className="bs-pill mint">+1 plus-one</span>
        </div>

        <div style={{
          padding: 12, borderRadius: 10,
          background: 'var(--surface-2)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            background: 'oklch(0.90 0.040 75)',
            color: 'oklch(0.40 0.12 60)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 700,
          }}>+1</div>

          {!editing ? (
            <>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{name || "Maya's +1"}</div>
                <div style={{ fontSize: 11, color: 'var(--fg-subtle)' }}>
                  {name ? 'Helps with reservations later.' : 'Tap to add a name (optional).'}
                </div>
              </div>
              <button className="bs-btn sm" onClick={() => { setDraft(name); setEditing(true); }}>
                {name ? 'Edit' : 'Add name'}
              </button>
            </>
          ) : (
            <>
              <input
                className="bs-input"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Their first name"
                style={{ flex: 1, height: 34, fontSize: 13 }}
                autoFocus
              />
              <button className="bs-btn sm primary" onClick={() => { setName(draft.trim()); setEditing(false); }}>
                Save
              </button>
              <button className="bs-btn sm ghost" onClick={() => setEditing(false)}>Cancel</button>
            </>
          )}
        </div>

        <p style={v11Caption}>
          Edits are silent — no notification to the host (these are housekeeping changes). Locks at brunch start time.
        </p>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────
// 3. Host transfer
// ─────────────────────────────────────────────────────────────────────
const HostTransferSurface = () => {
  const candidates = [
    { id: 'm', name: 'Maya', sub: 'Yes · plus-one Jordan',  hue: 25 },
    { id: 's', name: 'Sam',  sub: 'Yes',                    hue: 70 },
    { id: 't', name: 'Theo', sub: 'Yes · running late',     hue: 200 },
    { id: 'r', name: 'Rae',  sub: 'Yes · leaving early',    hue: 320 },
  ];
  const [picked, setPicked] = React.useState('m');

  return (
    <div style={{ ...v11SectionStyle, maxWidth: 520 }}>
      <div>
        <p style={v11Eyebrow}>Host detail · Overflow menu → "Hand off hosting"</p>
        <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 22, margin: '4px 0 14px' }}>
          Can't make it? Hand the brunch to someone who can.
        </h3>
      </div>

      <div className="bs-card elev" style={{ padding: 22 }}>
        <p style={{ fontSize: 13.5, color: 'var(--fg-muted)', margin: '0 0 16px', lineHeight: 1.5 }}>
          Pick anyone who RSVP'd yes. They become host, you stay as a regular attendee.
          Once handed off, it's theirs — including cancellation.
        </p>

        <div className="bs-col" style={{ gap: 8 }}>
          {candidates.map((c) => {
            const sel = picked === c.id;
            return (
              <button key={c.id}
                      onClick={() => setPicked(c.id)}
                      className={`bs-option${sel ? ' selected' : ''}`}
                      style={{
                        padding: 12,
                        borderColor: sel ? 'var(--accent-strong)' : 'var(--line)',
                        background: sel ? 'var(--accent-soft)' : 'var(--surface)',
                      }}>
                <div className="radio" />
                {v11Avatar(c.name.slice(0, 2).toUpperCase(), c.hue)}
                <div className="body">
                  <div className="title">{c.name}</div>
                  <div className="sub">{c.sub}</div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="bs-row" style={{ gap: 10, marginTop: 18 }}>
          <button className="bs-btn primary lg" disabled={!picked}
                  style={{ opacity: picked ? 1 : 0.4 }}>
            <span>Hand off to {candidates.find(c => c.id === picked)?.name || '…'}</span>
          </button>
          <button className="bs-btn">Never mind</button>
        </div>

        <p style={v11Caption}>
          One transfer per brunch — keeps the audit trail simple. New host gets a push.
          You can still leave / change your RSVP afterward.
        </p>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────
// 4. Undo on cancel — the 5s window
// ─────────────────────────────────────────────────────────────────────
const UndoCancelSurface = () => {
  const [phase, setPhase] = React.useState('idle'); // idle | undoable | committed | undone
  const [secs, setSecs] = React.useState(5);

  React.useEffect(() => {
    if (phase !== 'undoable') return;
    if (secs <= 0) { setPhase('committed'); return; }
    const t = setTimeout(() => setSecs((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, secs]);

  const fire = () => { setSecs(5); setPhase('undoable'); };
  const undo = () => { setPhase('undone'); };
  const reset = () => { setSecs(5); setPhase('idle'); };

  // ring math
  const r = 14, c = 2 * Math.PI * r;
  const ringOffset = c - (secs / 5) * c;

  return (
    <div style={{ ...v11SectionStyle, maxWidth: 520 }}>
      <div>
        <p style={v11Eyebrow}>Host · After confirming cancel modal</p>
        <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 22, margin: '4px 0 14px' }}>
          5-second undo before notifications fire.
        </h3>
      </div>

      <div className="bs-card" style={{ padding: 22 }}>
        <p style={{ fontSize: 13.5, color: 'var(--fg-muted)', margin: '0 0 16px', lineHeight: 1.55 }}>
          The cancellation isn't committed until 5 seconds pass. The 4 yes-RSVPs and
          2 maybes don't get pinged until then.
        </p>

        {phase === 'idle' && (
          <button className="bs-btn" onClick={fire} style={{ borderColor: 'oklch(0.78 0.140 30)', color: 'oklch(0.42 0.18 30)' }}>
            Simulate "Call it off" confirmation
          </button>
        )}

        {phase === 'undoable' && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 14,
            padding: '14px 18px', borderRadius: 14,
            background: 'oklch(0.20 0.020 70)',
            color: 'oklch(0.98 0.015 70)',
            boxShadow: '0 12px 36px -8px oklch(0.20 0.04 70 / 0.45)',
          }}>
            <svg width="32" height="32" viewBox="0 0 32 32" style={{ transform: 'rotate(-90deg)' }} aria-hidden>
              <circle cx="16" cy="16" r={r} fill="none" stroke="oklch(0.40 0.020 70)" strokeWidth="3" />
              <circle cx="16" cy="16" r={r} fill="none"
                      stroke="oklch(0.85 0.130 70)" strokeWidth="3"
                      strokeDasharray={c} strokeDashoffset={ringOffset}
                      strokeLinecap="round"
                      style={{ transition: 'stroke-dashoffset 1s linear' }} />
            </svg>
            <div style={{ flex: 1, fontSize: 13.5 }}>
              <div style={{ fontWeight: 600 }}>Calling it off…</div>
              <div style={{ opacity: 0.7, fontSize: 12 }}>Notifications go out in {secs}s</div>
            </div>
            <button onClick={undo}
                    style={{
                      background: 'transparent', color: 'oklch(0.85 0.130 70)',
                      border: '1px solid oklch(0.50 0.040 70)', padding: '6px 14px',
                      borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer',
                    }}>
              Undo
            </button>
          </div>
        )}

        {phase === 'committed' && (
          <div style={{
            padding: 14, borderRadius: 10, background: 'oklch(0.95 0.040 30)',
            color: 'oklch(0.36 0.140 30)', fontSize: 13.5,
          }}>
            ✗ Cancelled · Notifications sent to 6 invitees.
            <button onClick={reset} className="bs-btn sm" style={{ marginLeft: 12 }}>Reset demo</button>
          </div>
        )}

        {phase === 'undone' && (
          <div style={{
            padding: 14, borderRadius: 10, background: 'oklch(0.94 0.055 150)',
            color: 'oklch(0.32 0.12 150)', fontSize: 13.5,
          }}>
            ✓ Brunch is back on. No one was notified.
            <button onClick={reset} className="bs-btn sm" style={{ marginLeft: 12 }}>Reset demo</button>
          </div>
        )}

        <p style={v11Caption}>
          Same pattern reused for invitee-side "leave brunch." Toast is bottom-anchored on mobile.
        </p>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────
// 5. Timezone-aware time card
// ─────────────────────────────────────────────────────────────────────
const TimezoneSurface = () => (
  <div style={{ ...v11SectionStyle, maxWidth: 600 }}>
    <div>
      <p style={v11Eyebrow}>Brunch detail · Time card</p>
      <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 22, margin: '4px 0 14px' }}>
        Everyone sees their own local time.
      </h3>
    </div>

    <div className="bs-card elev" style={{ padding: 22 }}>
      <p style={v11Eyebrow}>Maya · Brooklyn (ET)</p>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, margin: '6px 0 4px' }}>
        <span style={{
          fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 36,
          letterSpacing: '-0.02em', color: 'var(--fg)',
        }}>2:00 PM</span>
        <span style={{ fontSize: 14, color: 'var(--fg-muted)' }}>Sun · Mar 8</span>
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--fg-subtle)', margin: 0 }}>
        Host's time: <strong style={{ color: 'var(--fg-muted)', fontWeight: 600 }}>11:00 AM PT</strong>
      </p>
    </div>

    <div className="bs-card" style={{ padding: 22 }}>
      <p style={v11Eyebrow}>Sam · San Francisco (PT) · Host</p>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, margin: '6px 0 4px' }}>
        <span style={{
          fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 36,
          letterSpacing: '-0.02em', color: 'var(--fg)',
        }}>11:00 AM</span>
        <span style={{ fontSize: 14, color: 'var(--fg-muted)' }}>Sun · Mar 8</span>
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--fg-subtle)', margin: 0, fontStyle: 'italic' }}>
        Same timezone — host's line stays hidden.
      </p>
    </div>

    <div style={{
      padding: 14, borderRadius: 10, background: 'var(--surface-2)',
      fontSize: 12.5, color: 'var(--fg-muted)', lineHeight: 1.55,
    }}>
      <strong style={{ color: 'var(--fg)' }}>Spec:</strong> Brunch time stored as UTC + IANA zone string
      (e.g. <code style={{ fontFamily: 'var(--font-mono)' }}>"America/Los_Angeles"</code>) authored by the host.
      Each invitee's view renders in their device's local zone. The host's-time subline only renders when
      the invitee's zone differs. Voting time options follow the same rule. Calendar export uses host zone.
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────────────
// 6. Reduced-data gallery — six inline empty/playful lines
// ─────────────────────────────────────────────────────────────────────
const ReducedDataGallery = () => {
  const reduced = [
    { ctx: 'No invitees yet',         line: 'Nothing on the table yet 🍽 — invite the gang?',  cta: 'Invite' },
    { ctx: 'Voting open · 0 votes',   line: 'No votes in. Be the first?',                       cta: 'Vote' },
    { ctx: 'T-24h · 0 RSVPs',         line: 'Crickets so far — try a nudge?',                   cta: 'Nudge' },
    { ctx: 'Inbox empty',             line: 'All caught up. ☕',                                cta: null },
    { ctx: 'Past brunches empty',     line: 'No brunches in the rearview yet.',                 cta: null },
    { ctx: 'Place search · 0 results',line: 'No matches. Try a different spot?',                cta: null },
  ];

  return (
    <div style={{ ...v11SectionStyle, maxWidth: 880 }}>
      <div>
        <p style={v11Eyebrow}>Voice-on · Never apologetic</p>
        <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 22, margin: '4px 0 6px' }}>
          Reduced-data, not empty.
        </h3>
        <p style={{ fontSize: 13, color: 'var(--fg-muted)', margin: '0 0 6px' }}>
          When a screen has loaded but a region has zero items, show an inline playful line — not a full empty state.
        </p>
      </div>

      <div style={{
        display: 'grid', gap: 12,
        gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))',
      }}>
        {reduced.map((r, i) => (
          <div key={i} className="bs-card" style={{ padding: 16 }}>
            <p style={v11Eyebrow}>{r.ctx}</p>
            <div style={{
              padding: '14px 16px', marginTop: 8,
              background: 'var(--surface-2)', borderRadius: 10,
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <span style={{ fontSize: 14, fontFamily: 'var(--font-display)', flex: 1, color: 'var(--fg-muted)', fontStyle: 'italic' }}>
                {r.line}
              </span>
              {r.cta && <button className="bs-btn sm primary">{r.cta}</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────
// 7. Inline tie-breaker (vs the standalone TieBreaker modal)
// ─────────────────────────────────────────────────────────────────────
const InlineTieBreakerSurface = () => {
  const [picked, setPicked] = React.useState(null);
  const options = [
    { id: 'a', name: 'Tartine Bakery', sub: 'Mission · 0.4 mi', votes: 3, voters: ['MA','SA','TH'] },
    { id: 'b', name: 'Zazie',          sub: 'Cole Valley · 1.8 mi', votes: 3, voters: ['RA','JO','LE'] },
  ];

  return (
    <div style={{ ...v11SectionStyle, maxWidth: 720 }}>
      <div>
        <p style={v11Eyebrow}>Host detail · Inline · No modal</p>
        <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 22, margin: '4px 0 6px' }}>
          Tie at close → host decides in place.
        </h3>
        <p style={{ fontSize: 13, color: 'var(--fg-muted)', margin: '0 0 8px' }}>
          The tie-break replaces the voting card on the host's brunch detail. No modal, no overlay —
          just an inline state change. Invitees see a "host is deciding…" pill.
        </p>
      </div>

      <div style={{
        position: 'relative',
        padding: 22,
        borderRadius: 'var(--r-3, 14px)',
        background: 'oklch(0.97 0.030 75)',
        border: '1px solid oklch(0.85 0.080 65)',
      }}>
        <div className="bs-row" style={{ gap: 10, marginBottom: 14 }}>
          <span className="bs-pill" style={{ background: 'oklch(0.85 0.130 70)', color: 'oklch(0.30 0.16 60)', borderColor: 'transparent' }}>
            Voting closed · Tied
          </span>
          <span style={{ fontSize: 12, color: 'var(--fg-subtle)' }}>3 vs 3</span>
        </div>

        <p style={{ margin: '0 0 14px', fontSize: 14, color: 'var(--fg-muted)' }}>
          You're the host — make the call. The gang will see the winner in their inbox.
        </p>

        <div className="bs-col" style={{ gap: 10 }}>
          {options.map((o) => {
            const sel = picked === o.id;
            return (
              <button key={o.id} onClick={() => setPicked(o.id)}
                      className={`bs-option${sel ? ' selected' : ''}`}
                      style={{
                        padding: 14,
                        borderColor: sel ? 'var(--accent-strong)' : 'var(--line)',
                        background: sel ? 'var(--accent-soft)' : 'var(--surface)',
                      }}>
                <div className="radio" />
                <div className="body" style={{ flex: 1 }}>
                  <div className="title">{o.name}</div>
                  <div className="sub">{o.sub}</div>
                </div>
                <div style={{ display: 'flex', marginRight: 8 }}>
                  {o.voters.map((v, i) => (
                    <div key={i} style={{
                      width: 22, height: 22, borderRadius: '50%',
                      background: `oklch(0.85 0.080 ${30 + i * 50})`,
                      color: `oklch(0.32 0.12 ${30 + i * 50})`,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 9, fontWeight: 700,
                      border: '2px solid var(--surface)', marginLeft: i ? -6 : 0,
                    }}>{v}</div>
                  ))}
                </div>
                <span className="bs-pill" style={{ height: 22 }}>{o.votes}</span>
              </button>
            );
          })}
        </div>

        <div className="bs-row" style={{ gap: 10, marginTop: 16 }}>
          <button className="bs-btn primary lg" disabled={!picked}
                  style={{ opacity: picked ? 1 : 0.4 }}>
            <span>Lock in {picked ? options.find(o => o.id === picked).name : 'pick'}</span>
          </button>
          <button className="bs-btn">Open a runoff</button>
        </div>
      </div>
    </div>
  );
};

// Export
Object.assign(window, {
  RunningLateSurfaces,
  PlusOneEditSurface,
  HostTransferSurface,
  UndoCancelSurface,
  TimezoneSurface,
  ReducedDataGallery,
  InlineTieBreakerSurface,
});
