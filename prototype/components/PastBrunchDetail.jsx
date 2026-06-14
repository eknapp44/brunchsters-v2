// Past brunch detail — frozen, read-only view.
//
// Decision: one component handles both host's and invitee's past view, since
// the dynamic states (vote/RSVP) collapse to historical facts. Page reads as
// a softly-faded memory: who came, where, when, what got eaten (later — photos).
//
// Hooks pre-built for v2 features but not wired:
//   - Photo strip placeholder (deferred — image upload is a separate todo)
//
// "Do this again?" — IS in v1. Pre-fills a new Quick Brunch with the same
// title, location, and invitee list; deliberately leaves time blank so the
// user is forced to actively pick a new date. Everything is editable, so
// the prefill is a starting point not a commitment. See onReplan below.

const PastBrunchDetail = ({ onBack, theme, brunch, onReplan }) => {
  // Adapt to the sample-data shape: list view passes objects with `dateLong`
  // and `time` while older fallback uses `date`. Coalesce so either works.
  const incoming = brunch || {};
  const data = {
    title: incoming.title || "Easter brunch with Mom",
    date: incoming.dateLong || incoming.date || "Sun, Apr 5, 2026",
    time: incoming.time || "12:00 PM",
    location: incoming.location || "Zazie",
    locationSub: incoming.locationSub || "941 Cole St · Cole Valley",
    description: incoming.description || "Mom flew in. Eggs benedict for everyone.",
    role: incoming.role || "host",
    id: incoming.id || 'past',
    attendees: incoming.attendees || [
      { id: 'u1', name: 'You', initials: 'YO', rsvp: 'yes' },
      { id: 'u2', name: 'Mom', initials: 'M',  rsvp: 'yes' },
      { id: 'u3', name: 'Maya Reyes',  initials: 'MR', rsvp: 'yes' },
      { id: 'u4', name: 'Devon Kim',   initials: 'DK', rsvp: 'yes' },
      { id: 'u5', name: 'Priya Shah',  initials: 'PS', rsvp: 'yes' },
      { id: 'u6', name: 'Sam Liu',     initials: 'SL', rsvp: 'no'  },
    ],
  };

  const yeses = data.attendees.filter(a => a.rsvp === 'yes');
  const nos   = data.attendees.filter(a => a.rsvp === 'no');

  // Map this past brunch's attendees + location into the shapes QuickBrunch
  // expects (SAMPLE_FRIENDS / SAMPLE_LOCATIONS), so prefill arrives as
  // already-selected entries — not as standalone strings the user has to
  // re-pick. "You" is excluded (we're the host); names without a friend
  // record (e.g. "Mom") are dropped from the auto-fill but the user can
  // re-add them by hand on the Who step.
  const buildPrefill = () => {
    const friends = (window.SAMPLE_FRIENDS || []);
    const locations = (window.SAMPLE_LOCATIONS || []);
    const invitees = data.attendees
      .filter(a => a.name !== 'You')
      .map(a => friends.find(f => f.name === a.name))
      .filter(Boolean);
    const location = locations.find(l => l.name === data.location);
    return {
      title: data.title,
      location: location || null,
      invitees,
      fromBrunch: { id: data.id || 'past', title: data.title },
    };
  };

  const handleReplan = () => {
    if (onReplan) onReplan(buildPrefill());
  };

  return (
    <div className="bs-app">
      <TopBar active="past" onCreate={() => {}} theme={theme} />
      <main className="bs-page" style={{ maxWidth: 880 }}>
        <button className="bs-btn ghost" style={{ marginBottom: 20, paddingLeft: 8 }} onClick={onBack}>
          <IconArrowLeft size={16} /> <span>Back</span>
        </button>

        {/* Status strip — quiet, factual */}
        <div className="bs-row" style={{ gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <span className="bs-pill" style={{ background: 'var(--surface-2)', color: 'var(--fg-muted)' }}>
            <window.PopClock size={14} />
            <span>Happened</span>
          </span>
          <span className="bs-pill">{data.role === 'host' ? "You hosted" : "You came"}</span>
        </div>

        <h1 className="bs-h1" style={{ marginBottom: 10, opacity: 0.92 }}>{data.title}</h1>
        <p style={{ color: 'var(--fg-muted)', fontSize: 16, margin: '0 0 36px', maxWidth: 640 }}>
          {data.description}
        </p>

        {/* Photo strip placeholder — flagged for v2 image-upload feature */}
        <div style={{
          padding: 20, marginBottom: 24,
          borderRadius: 'var(--r-3)', border: '1px dashed var(--line)',
          background: 'var(--surface-2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          minHeight: 120, color: 'var(--fg-subtle)', fontSize: 13,
          gap: 10,
        }}>
          <window.PopEgg size={28} />
          <span>Photos from this brunch — coming when image upload lands</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 24 }}>
          {/* Left: where & when (frozen) */}
          <div className="bs-col" style={{ gap: 14 }}>
            <div className="bs-card flat" style={{ padding: 18, background: 'var(--surface-2)' }}>
              <div className="bs-row" style={{ marginBottom: 10, gap: 10 }}>
                <window.PopCalendar size={22} />
                <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-subtle)' }}>When</span>
              </div>
              <p style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 500, letterSpacing: '-0.01em' }}>
                {data.date}
              </p>
              <p style={{ color: 'var(--fg-muted)', fontSize: 13, margin: '4px 0 0' }}>{data.time}</p>
            </div>

            <div className="bs-card flat" style={{ padding: 18, background: 'var(--surface-2)' }}>
              <div className="bs-row" style={{ marginBottom: 10, gap: 10 }}>
                <window.PopPin size={22} />
                <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-subtle)' }}>Where</span>
              </div>
              <p style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 500, letterSpacing: '-0.01em' }}>
                {data.location}
              </p>
              <p style={{ color: 'var(--fg-muted)', fontSize: 13, margin: '4px 0 0' }}>{data.locationSub}</p>
            </div>

            {/* "Do this again" — v1 supported. Prefills location + invitees,
                leaves time blank (forces the user to pick a fresh date). */}
            <button onClick={handleReplan} style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '16px 18px',
              border: '1.5px dashed var(--line)',
              borderRadius: 'var(--r-3)',
              background: 'transparent', cursor: 'pointer',
              width: '100%', textAlign: 'left',
              transition: 'all 0.15s var(--ease)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent-strong)'; e.currentTarget.style.background = 'var(--accent-soft)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--line)'; e.currentTarget.style.background = 'transparent'; }}>
              <window.PopPlus size={28} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--fg)', marginBottom: 2 }}>
                  Do this again?
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--fg-muted)' }}>
                  Same crew, same spot. Fresh time's on you.
                </div>
              </div>
              <IconArrowRight size={16} style={{ color: 'var(--fg-subtle)' }} />
            </button>
          </div>

          {/* Right: who came */}
          <div className="bs-card flat" style={{ padding: 18, background: 'var(--surface-2)' }}>
            <div className="bs-row" style={{ marginBottom: 14, gap: 10 }}>
              <window.PopUsers size={22} />
              <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-subtle)' }}>
                Who came
              </span>
              <span className="bs-spacer" />
              <span style={{ fontSize: 12, color: 'var(--fg-muted)', fontVariantNumeric: 'tabular-nums' }}>
                {yeses.length} of {data.attendees.length}
              </span>
            </div>
            <div className="bs-col" style={{ gap: 4 }}>
              {yeses.map((a) => (
                <div key={a.id} className="bs-row" style={{ gap: 10, padding: '6px 0' }}>
                  <div className="bs-avatar sm" aria-hidden="true">{a.initials}</div>
                  <span style={{ fontSize: 13.5, flex: 1 }}>{a.name}</span>
                </div>
              ))}
              {nos.length > 0 && (
                <>
                  <hr className="bs-divider" />
                  <p className="bs-eyebrow" style={{ margin: '0 0 4px' }}>Missed it</p>
                  {nos.map((a) => (
                    <div key={a.id} className="bs-row" style={{ gap: 10, padding: '6px 0', opacity: 0.55 }}>
                      <div className="bs-avatar sm" aria-hidden="true">{a.initials}</div>
                      <span style={{ fontSize: 13.5, flex: 1 }}>{a.name}</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

window.PastBrunchDetail = PastBrunchDetail;
