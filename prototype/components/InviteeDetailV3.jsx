// v3 Invitee detail — countdown ring + rich RSVP states.
//
// Rich RSVP states beyond yes/maybe/no:
//   - "I'm in" with optional: bringing +1, arriving late, leaving early, dietary note
//   - "Maybe" with reason + decide-by date
//   - "Can't make it" with optional regret note
// All extras live in a progressive-disclosure panel that appears after the
// primary choice — keeps the simple case one-click.

const RsvpYesExtras = ({ extras, setExtras }) => (
  <div className="bs-col" style={{ gap: 10, marginTop: 14, padding: 14,
                                    background: 'var(--mint-soft, oklch(0.96 0.04 160))',
                                    borderRadius: 'var(--r-2)' }}>
    <p className="bs-eyebrow" style={{ margin: 0 }}>Anything to flag?</p>

    <label className="bs-row" style={{ gap: 10, alignItems: 'center', cursor: 'pointer' }}>
      <input type="checkbox" checked={extras.plusOne}
             onChange={(e) => setExtras({ ...extras, plusOne: e.target.checked })} />
      <span style={{ flex: 1, fontSize: 14 }}>Bringing a +1</span>
      {extras.plusOne && (
        <input className="bs-input" placeholder="Their name (optional)"
               value={extras.plusOneName || ''}
               onChange={(e) => setExtras({ ...extras, plusOneName: e.target.value })}
               style={{ height: 32, width: 180 }} />
      )}
    </label>

    <label className="bs-row" style={{ gap: 10, alignItems: 'center', cursor: 'pointer' }}>
      <input type="checkbox" checked={extras.late}
             onChange={(e) => setExtras({ ...extras, late: e.target.checked })} />
      <span style={{ flex: 1, fontSize: 14 }}>Running a bit late</span>
      {extras.late && (
        <select className="bs-input" value={extras.lateBy || '15'}
                onChange={(e) => setExtras({ ...extras, lateBy: e.target.value })}
                style={{ height: 32, width: 110 }}>
          <option value="15">~15 min</option>
          <option value="30">~30 min</option>
          <option value="45">~45 min</option>
          <option value="60">~1 hr</option>
        </select>
      )}
    </label>

    <label className="bs-row" style={{ gap: 10, alignItems: 'center', cursor: 'pointer' }}>
      <input type="checkbox" checked={extras.leaveEarly}
             onChange={(e) => setExtras({ ...extras, leaveEarly: e.target.checked })} />
      <span style={{ flex: 1, fontSize: 14 }}>Need to duck out early</span>
      {extras.leaveEarly && (
        <input className="bs-input" placeholder="By when?" value={extras.leaveBy || ''}
               onChange={(e) => setExtras({ ...extras, leaveBy: e.target.value })}
               style={{ height: 32, width: 110 }} />
      )}
    </label>

    <div>
      <label className="bs-label" style={{ marginTop: 4 }}>Dietary note · <span style={{ fontWeight: 400, color: 'var(--fg-subtle)' }}>optional</span></label>
      <input className="bs-input" placeholder="e.g. veggie, GF, no shellfish"
             value={extras.diet || ''}
             onChange={(e) => setExtras({ ...extras, diet: e.target.value })} />
    </div>
  </div>
);

const RsvpMaybeExtras = ({ extras, setExtras }) => (
  <div className="bs-col" style={{ gap: 10, marginTop: 14, padding: 14,
                                    background: 'var(--accent-soft)',
                                    borderRadius: 'var(--r-2)' }}>
    <p className="bs-eyebrow" style={{ margin: 0 }}>Help the host plan</p>
    <div>
      <label className="bs-label">I'll know by…</label>
      <input className="bs-input" type="date" value={extras.decideBy || ''}
             onChange={(e) => setExtras({ ...extras, decideBy: e.target.value })} />
    </div>
    <div>
      <label className="bs-label">What's tentative? · <span style={{ fontWeight: 400, color: 'var(--fg-subtle)' }}>optional</span></label>
      <input className="bs-input" placeholder="e.g. waiting on Friday's flight"
             value={extras.reason || ''}
             onChange={(e) => setExtras({ ...extras, reason: e.target.value })} />
    </div>
  </div>
);

const RsvpNoExtras = ({ extras, setExtras }) => (
  <div className="bs-col" style={{ gap: 10, marginTop: 14, padding: 14,
                                    background: 'var(--surface-2)',
                                    borderRadius: 'var(--r-2)' }}>
    <label className="bs-label">Send a note · <span style={{ fontWeight: 400, color: 'var(--fg-subtle)' }}>optional</span></label>
    <input className="bs-input" placeholder="e.g. so sorry, next one for sure!"
           value={extras.note || ''}
           onChange={(e) => setExtras({ ...extras, note: e.target.value })} />
    <label className="bs-row" style={{ gap: 10, alignItems: 'center', marginTop: 4, cursor: 'pointer' }}>
      <input type="checkbox" checked={extras.nextTime}
             onChange={(e) => setExtras({ ...extras, nextTime: e.target.checked })} />
      <span style={{ fontSize: 13, color: 'var(--fg-muted)' }}>Invite me to the next one</span>
    </label>
  </div>
);

const InviteeDetailV3 = ({ onBack, theme, onThemeToggle }) => {
  const [rsvp, setRsvp] = React.useState(null);
  const [vote, setVote] = React.useState('l1');
  const [extras, setExtras] = React.useState({});
  const [hoursLeft, setHoursLeft] = React.useState(28);
  const hoursTotal = 60;
  const urgent = hoursLeft <= 24;

  const locOptions = [
    { id: 'l1', name: 'Tartine Bakery', sub: '600 Guerrero St · Mission · 0.4 mi', tag: 'pastries · coffee' },
    { id: 'l2', name: 'Zazie',          sub: '941 Cole St · Cole Valley · 1.8 mi', tag: 'french · brunch classic' },
    { id: 'l3', name: 'Plow',           sub: '1299 18th St · Potrero Hill · 2.1 mi', tag: 'no-frills american' },
  ];

  const handleRsvp = (v) => {
    if (rsvp !== v) setExtras({}); // reset extras when switching
    setRsvp(v);
  };

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
            <strong style={{ color: 'var(--fg)' }}>Sam Liu</strong> wants you at brunch
          </span>
        </div>

        <h1 className="bs-h1" style={{ marginBottom: 10 }}>Birthday brunch for Sam</h1>
        <p style={{ color: 'var(--fg-muted)', fontSize: 16, margin: '0 0 24px', maxWidth: 580 }}>
          Sunday vibes, low-key, bring whoever 💕
        </p>

        <div className="bs-row" style={{ gap: 22, marginBottom: 32, color: 'var(--fg-muted)', fontSize: 14, flexWrap: 'wrap' }}>
          <div className="bs-row" style={{ gap: 8 }}><window.PopCalendar size={20} /><span>Sun, May 10 · 11:30 AM</span></div>
          <div className="bs-row" style={{ gap: 8 }}><window.PopPin size={20} /><span>3 places to choose from</span></div>
          <div className="bs-row" style={{ gap: 8 }}>
            <window.PopUsers size={20} />
            <span>6 invited</span>
            <div className="bs-stack" style={{ marginLeft: 6 }}>
              {['MR', 'DK', 'PS', 'JM'].map((i) => (
                <div key={i} className="bs-avatar sm" aria-hidden="true">{i}</div>
              ))}
            </div>
          </div>
        </div>

        {/* RSVP card — primary action with rich states */}
        <div className="bs-card elev" style={{ padding: 24, marginBottom: 24 }}>
          <p className="bs-eyebrow" style={{ margin: '0 0 14px' }}>RSVP</p>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 500, letterSpacing: '-0.015em', margin: '0 0 16px' }}>
            You in?
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
                  onClick={() => handleRsvp(opt.v)}
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

          {rsvp === 'yes'   && <RsvpYesExtras   extras={extras} setExtras={setExtras} />}
          {rsvp === 'maybe' && <RsvpMaybeExtras extras={extras} setExtras={setExtras} />}
          {rsvp === 'no'    && <RsvpNoExtras    extras={extras} setExtras={setExtras} />}

          {rsvp && (
            <div className="bs-row" style={{ marginTop: 14, gap: 10 }}>
              <span className="bs-spacer" />
              <button className="bs-btn primary lg">
                <window.PopCheck size={18} /> <span>Send RSVP</span>
              </button>
            </div>
          )}
        </div>

        {/* Voting — where (single-select), now with countdown ring */}
        <div className="bs-card" style={{ padding: 24, marginBottom: 24 }}>
          <div className="bs-row" style={{ marginBottom: 4, gap: 10 }}>
            <window.PopPin size={20} />
            <h3 className="bs-h3" style={{ margin: 0 }}>Where to?</h3>
            <span className="bs-spacer" />
            <span className="bs-pill accent" style={{ height: 22, display: 'inline-flex', alignItems: 'center', gap: 8, paddingLeft: 8 }}>
              <window.CountdownRing hoursTotal={hoursTotal} hoursLeft={hoursLeft} size={16} />
              <span>{urgent ? 'Closes' : 'Closes'} in {window.formatCountdown(hoursLeft)}</span>
            </span>
          </div>
          <p style={{ color: 'var(--fg-muted)', fontSize: 13, margin: '0 0 16px' }}>Pick your one — change it anytime before voting closes.</p>
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
          <button className="bs-btn">
            <window.PopCalendar size={18} /> <span>Add to calendar</span>
          </button>
          <span className="bs-spacer" />
          <button className="bs-btn ghost" style={{ color: 'var(--fg-subtle)' }}>Mute notifications</button>
        </div>
      </main>
    </div>
  );
};

window.InviteeDetailV3 = InviteeDetailV3;
