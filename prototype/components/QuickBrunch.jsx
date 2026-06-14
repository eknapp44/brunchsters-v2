// QuickBrunch — conversational, one-focused-field-at-a-time.
// No stepper chrome; auto-advances after each commit (Enter / pick).
// "Need a vote?" link at bottom escalates into the full wizard.
//
// Field order: title → where → when → who → review.
// Each prior field collapses to a one-line summary you can tap to edit.

const QB_FIELDS = ['title', 'where', 'when', 'who', 'review'];

const QBChip = ({ children, onClick, active, dim }) => (
  <button onClick={onClick} className="qb-chip" data-active={active || undefined}
          style={{
            padding: '6px 12px', borderRadius: 'var(--r-pill)',
            border: '1px solid var(--line)',
            background: active ? 'var(--accent-soft)' : 'var(--surface)',
            color: active ? 'var(--accent-fg)' : (dim ? 'var(--fg-muted)' : 'var(--fg)'),
            fontSize: 13, fontWeight: 500,
            display: 'inline-flex', alignItems: 'center', gap: 6,
            transition: 'all 0.15s var(--ease)',
            cursor: 'pointer',
          }}>
    {children}
  </button>
);

const QBSummaryRow = ({ icon, label, onEdit }) => (
  <button className="bs-row qb-summary" onClick={onEdit}
          style={{
            width: '100%', textAlign: 'left',
            padding: '10px 14px', gap: 12,
            background: 'transparent', border: '1px solid var(--line-soft)',
            borderRadius: 'var(--r-2)', color: 'var(--fg-muted)',
            fontSize: 14, cursor: 'pointer',
            transition: 'background 0.15s var(--ease)',
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-2)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
    <span style={{ display: 'inline-flex' }}>{icon}</span>
    <span style={{ flex: 1, color: 'var(--fg)' }}>{label}</span>
    <span style={{ fontSize: 12, color: 'var(--fg-subtle)' }}>edit</span>
  </button>
);

const QuickBrunch = ({ onClose, onComplete, onUpgradeToWizard, theme, prefill }) => {
  // "Replan from past brunch" entry: prefill seeds title + where + who, and
  // we drop the user directly on the "when" step — time is the one thing
  // they MUST actively choose so an old brunch can't be accidentally
  // re-sent at the same time as a calendar conflict.
  const [stage, setStage] = React.useState(prefill ? 2 : 0);
  const [data, setData] = React.useState({
    title: prefill?.title || '',
    locations: prefill?.location ? [prefill.location] : [],
    times: [],
    invited: prefill?.invitees || [],
  });
  const [replanFrom, setReplanFrom] = React.useState(prefill?.fromBrunch || null);
  const [done, setDone] = React.useState(false);
  const titleInputRef = React.useRef(null);

  const clearReplan = () => {
    setReplanFrom(null);
    setData({ title: '', locations: [], times: [], invited: [] });
    setStage(0);
  };

  // Watch for "voting" upgrade trigger — adding 2nd place / time auto-promotes.
  const willEscalate = data.locations.length >= 2 || data.times.length >= 2;

  const advance = () => {
    if (stage < 4) setStage(stage + 1);
    else setDone(true);
  };

  const goTo = (s) => setStage(s);

  React.useEffect(() => {
    if (stage === 0 && titleInputRef.current) titleInputRef.current.focus();
  }, [stage]);

  if (done) {
    return (
      <div className="bs-app">
        <header className="bs-topbar">
          <Wordmark size="md" />
          <button className="bs-btn ghost" onClick={onClose}>
            <IconClose size={16} /> <span>Close</span>
          </button>
        </header>
        <main className="bs-page" style={{ maxWidth: 720 }}>
          <SuccessScreen data={data} onDone={onComplete} />
        </main>
      </div>
    );
  }

  // Summaries for committed fields
  const titleSummary = data.title && stage > 0;
  const whereSummary = data.locations.length > 0 && stage > 1;
  const whenSummary = data.times.length > 0 && stage > 2;
  const whoSummary = data.invited.length > 0 && stage > 3;

  return (
    <div className="bs-app">
      <header className="bs-topbar">
        <Wordmark size="md" />
        <div className="bs-row" style={{ gap: 8 }}>
          <span className="bs-pill" style={{ background: 'transparent' }}>
            <span style={{ color: 'var(--fg-subtle)' }}>Quick brunch</span>
          </span>
          <button className="bs-btn ghost" onClick={onClose}>
            <IconClose size={16} /> <span>Cancel</span>
          </button>
        </div>
      </header>

      <main className="bs-page" style={{ maxWidth: 640, paddingTop: 32 }}>
        {/* Replanning banner — surfaces when QuickBrunch is entered with
            prefill from a past brunch. Persists until the user resets or
            sends. "Start fresh" wipes prefill + restarts at the title step. */}
        {replanFrom && (
          <div className="bs-row" style={{
            gap: 12, alignItems: 'center',
            padding: '12px 16px', marginBottom: 24,
            borderRadius: 'var(--r-2)',
            background: 'var(--accent-soft)',
            border: '1px solid var(--accent)',
            color: 'var(--accent-fg)',
            fontSize: 13,
          }}>
            <IconSparkle size={16} />
            <div style={{ flex: 1 }}>
              Bringing back <strong>{replanFrom.title}</strong> — round two 🥂 Just pick a new time.
            </div>
            <button onClick={clearReplan}
                    className="bs-link-inline"
                    style={{
                      background: 'transparent', border: 'none', padding: 0,
                      color: 'var(--accent-fg)', textDecoration: 'underline',
                      textUnderlineOffset: 3, fontSize: 13, cursor: 'pointer',
                      fontWeight: 500,
                    }}>
              Nah, start fresh
            </button>
          </div>
        )}

        {/* Committed-field summaries — collapse stack */}
        <div className="bs-col" style={{ gap: 8, marginBottom: titleSummary || whereSummary || whenSummary || whoSummary ? 28 : 0 }}>
          {titleSummary && <QBSummaryRow icon={<IconSparkle size={16} />} label={data.title} onEdit={() => goTo(0)} />}
          {whereSummary && <QBSummaryRow icon={<IconPin size={16} />}
            label={data.locations.length === 1 ? data.locations[0].name : `${data.locations.length} places to vote on`}
            onEdit={() => goTo(1)} />}
          {whenSummary && <QBSummaryRow icon={<IconCalendar size={16} />}
            label={data.times.length === 1 ? `${data.times[0].label} · ${data.times[0].time}` : `${data.times.length} times to vote on`}
            onEdit={() => goTo(2)} />}
          {whoSummary && <QBSummaryRow icon={<IconUsers size={16} />}
            label={`${data.invited.length} ${data.invited.length === 1 ? 'friend' : 'friends'} invited`}
            onEdit={() => goTo(3)} />}
        </div>

        {/* Active stage */}
        <div className="qb-stage" key={stage} style={{ animation: 'qb-fade 0.35s var(--ease)' }}>
          {stage === 0 && (
            <div>
              <p className="bs-eyebrow" style={{ margin: '0 0 8px' }}>What's the occasion?</p>
              <input
                ref={titleInputRef}
                className="bs-input"
                style={{
                  fontFamily: 'var(--font-display)', fontSize: 36, fontWeight: 500,
                  letterSpacing: '-0.025em', height: 'auto', padding: '8px 0',
                  border: 'none', background: 'transparent',
                  borderBottom: '2px solid var(--line)',
                  borderRadius: 0,
                }}
                placeholder="Sunday catch-up"
                value={data.title}
                onChange={(e) => setData({ ...data, title: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter' && data.title.trim()) advance(); }}
              />
              <div className="bs-row" style={{ marginTop: 18, gap: 10, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--fg-subtle)' }}>Try:</span>
                {['Sunday catch-up', "Maya's birthday brunch", 'Old roommates'].map(t => (
                  <QBChip key={t} onClick={() => setData({ ...data, title: t })}>{t}</QBChip>
                ))}
              </div>
              <div className="bs-row" style={{ marginTop: 36, gap: 10 }}>
                <button className="bs-btn primary lg" disabled={!data.title.trim()}
                        style={{ opacity: data.title.trim() ? 1 : 0.4 }}
                        onClick={advance}>
                  <span>Continue</span> <IconArrowRight size={16} />
                </button>
                <span style={{ fontSize: 12, color: 'var(--fg-subtle)', alignSelf: 'center' }}>or press ↵</span>
              </div>
            </div>
          )}

          {stage === 1 && (
            <div>
              <p className="bs-eyebrow" style={{ margin: '0 0 8px' }}>Where?</p>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 500, letterSpacing: '-0.02em', margin: '0 0 6px' }}>
                Pick a spot
              </h2>
              <p style={{ color: 'var(--fg-muted)', fontSize: 14, margin: '0 0 20px' }}>
                Pick one to lock it in — or a few and we'll vote.
              </p>
              <div style={{ position: 'relative', marginBottom: 16 }}>
                <IconSearch size={18} style={{ position: 'absolute', left: 14, top: 13, color: 'var(--fg-subtle)' }} />
                <input className="bs-input" placeholder="Search restaurants, cafés…" style={{ paddingLeft: 44 }} />
              </div>
              <div className="bs-col" style={{ gap: 8 }}>
                {window.SAMPLE_LOCATIONS.map((loc) => {
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
                        <div className="sub">{loc.address} · {loc.neighborhood}</div>
                      </div>
                      <div className="meta">★ {loc.rating} · {loc.distance}</div>
                    </button>
                  );
                })}
              </div>
              {willEscalate && (
                <div style={{ marginTop: 16, padding: '10px 14px', background: 'var(--accent-soft)',
                              borderRadius: 'var(--r-2)', color: 'var(--accent-fg)',
                              fontSize: 13, display: 'flex', gap: 10, alignItems: 'center' }}>
                  <IconSparkle size={16} />
                  <span><strong>{data.locations.length} places</strong> — guests will vote.</span>
                </div>
              )}
              <div className="bs-row" style={{ marginTop: 28, gap: 10 }}>
                <button className="bs-btn" onClick={() => goTo(0)}>
                  <IconArrowLeft size={16} /> <span>Back</span>
                </button>
                <span className="bs-spacer" />
                <button className="bs-btn primary lg" disabled={data.locations.length === 0}
                        style={{ opacity: data.locations.length ? 1 : 0.4 }}
                        onClick={advance}>
                  <span>Continue</span> <IconArrowRight size={16} />
                </button>
              </div>
            </div>
          )}

          {stage === 2 && (
            <div>
              <p className="bs-eyebrow" style={{ margin: '0 0 8px' }}>When?</p>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 500, letterSpacing: '-0.02em', margin: '0 0 20px' }}>
                Pick a time
              </h2>
              <div className="bs-row" style={{ gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                <QBChip>📅 This weekend</QBChip>
                <QBChip>Next weekend</QBChip>
                <QBChip dim>+ Custom date</QBChip>
              </div>
              <div className="bs-col" style={{ gap: 8 }}>
                {window.SAMPLE_TIMES.map((t) => {
                  const isSelected = !!data.times.find(s => s.id === t.id);
                  return (
                    <button key={t.id} className={`bs-option${isSelected ? ' selected' : ''}`}
                            onClick={() => setData({
                              ...data,
                              times: isSelected
                                ? data.times.filter(s => s.id !== t.id)
                                : [...data.times, t]
                            })}>
                      <div className="radio" />
                      <div className="body">
                        <div className="title">{t.label} · {t.time}</div>
                        <div className="sub">{t.sub}</div>
                      </div>
                      <div className="meta"><IconClock size={14} style={{ verticalAlign: -2 }} /></div>
                    </button>
                  );
                })}
              </div>
              <div className="bs-row" style={{ marginTop: 28, gap: 10 }}>
                <button className="bs-btn" onClick={() => goTo(1)}>
                  <IconArrowLeft size={16} /> <span>Back</span>
                </button>
                <span className="bs-spacer" />
                <button className="bs-btn primary lg" disabled={data.times.length === 0}
                        style={{ opacity: data.times.length ? 1 : 0.4 }}
                        onClick={advance}>
                  <span>Continue</span> <IconArrowRight size={16} />
                </button>
              </div>
            </div>
          )}

          {stage === 3 && (
            <div>
              <p className="bs-eyebrow" style={{ margin: '0 0 8px' }}>Who?</p>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 500, letterSpacing: '-0.02em', margin: '0 0 20px' }}>
                Invite your crew
              </h2>
              <div className="bs-col" style={{ gap: 8 }}>
                {window.SAMPLE_FRIENDS.map((f) => {
                  const isSelected = !!data.invited.find(s => s.id === f.id);
                  return (
                    <button key={f.id} className={`bs-option${isSelected ? ' selected' : ''}`}
                            onClick={() => setData({
                              ...data,
                              invited: isSelected
                                ? data.invited.filter(s => s.id !== f.id)
                                : [...data.invited, f]
                            })}>
                      <div className="radio" />
                      <div className="bs-avatar" aria-hidden="true" style={{ background: 'var(--surface-2)' }}>{f.initials}</div>
                      <div className="body">
                        <div className="title">{f.name}</div>
                        <div className="sub">{f.email}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="bs-row" style={{ marginTop: 28, gap: 10 }}>
                <button className="bs-btn" onClick={() => goTo(2)}>
                  <IconArrowLeft size={16} /> <span>Back</span>
                </button>
                <span className="bs-spacer" />
                <button className="bs-btn primary lg" disabled={data.invited.length === 0}
                        style={{ opacity: data.invited.length ? 1 : 0.4 }}
                        onClick={advance}>
                  <span>Send invites</span> <IconArrowRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer escape hatches */}
        <div style={{ marginTop: 56, paddingTop: 20, borderTop: '1px solid var(--line-soft)',
                      display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'center',
                      color: 'var(--fg-subtle)', fontSize: 13 }}>
          <span>Need to gather opinions?</span>
          <button onClick={onUpgradeToWizard}
                  style={{ background: 'transparent', border: 'none', padding: 0,
                           color: 'var(--accent-fg)', textDecoration: 'underline',
                           textUnderlineOffset: 3, fontSize: 13, cursor: 'pointer' }}>
            Switch to the full wizard →
          </button>
        </div>
      </main>

      <style>{`
        @keyframes qb-fade {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

window.QuickBrunch = QuickBrunch;
