// EmptyDashboard — the moment a fresh user lands on a Brunchsters dashboard
// with nothing booked. The hero slot becomes a placeholder breakfast scene
// (table, plate, coffee, empty chairs) inviting them in. CTA is the primary
// verb, not chrome.
//
// Drawn as flat shapes — no skeuomorphic illustration, just confident
// geometric stand-ins consistent with the brand's "minimal-utility with
// fun accents" voice.

const BreakfastScene = ({ width = 520, height = 320 }) => (
  <svg viewBox="0 0 520 320" width="100%" height={height} preserveAspectRatio="xMidYMid meet"
       style={{ display: 'block', maxWidth: width }}
       xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="es-spot" cx="50%" cy="40%" r="60%">
        <stop offset="0%" stopColor="oklch(0.97 0.020 80)" stopOpacity="0.9"/>
        <stop offset="100%" stopColor="oklch(0.97 0.020 80)" stopOpacity="0"/>
      </radialGradient>
      <linearGradient id="es-table" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stopColor="oklch(0.92 0.018 70)"/>
        <stop offset="100%" stopColor="oklch(0.86 0.020 65)"/>
      </linearGradient>
    </defs>

    {/* warm spotlight */}
    <ellipse cx="260" cy="140" rx="240" ry="140" fill="url(#es-spot)" />

    {/* table edge — receding perspective */}
    <path d="M 30 230 L 490 230 L 510 290 L 10 290 Z"
          fill="url(#es-table)" stroke="oklch(0.78 0.020 60)" strokeWidth="1"/>

    {/* far chair (silhouetted, empty) — left */}
    <g opacity="0.55">
      <rect x="64" y="124" width="42" height="78" rx="4" fill="oklch(0.84 0.018 65)"/>
      <rect x="68" y="190" width="34" height="12" rx="2" fill="oklch(0.78 0.020 60)"/>
      <rect x="72" y="200" width="4" height="32" fill="oklch(0.78 0.020 60)"/>
      <rect x="94" y="200" width="4" height="32" fill="oklch(0.78 0.020 60)"/>
    </g>

    {/* far chair — right */}
    <g opacity="0.55">
      <rect x="412" y="124" width="42" height="78" rx="4" fill="oklch(0.84 0.018 65)"/>
      <rect x="416" y="190" width="34" height="12" rx="2" fill="oklch(0.78 0.020 60)"/>
      <rect x="420" y="200" width="4" height="32" fill="oklch(0.78 0.020 60)"/>
      <rect x="442" y="200" width="4" height="32" fill="oklch(0.78 0.020 60)"/>
    </g>

    {/* placemat under plate */}
    <ellipse cx="260" cy="232" rx="120" ry="20" fill="oklch(0.94 0.012 70)"/>

    {/* plate */}
    <ellipse cx="260" cy="220" rx="84" ry="18" fill="oklch(0.99 0.005 80)" stroke="oklch(0.85 0.012 70)" strokeWidth="1.2"/>
    <ellipse cx="260" cy="216" rx="68" ry="13" fill="oklch(0.985 0.008 80)" stroke="oklch(0.88 0.014 70)" strokeWidth="0.8"/>

    {/* fried egg on plate — A2 brand mark, perspective-flattened */}
    <g transform="translate(260 215)">
      <ellipse cx="0" cy="0" rx="40" ry="8" fill="oklch(0.97 0.025 85)" stroke="oklch(0.86 0.020 65)" strokeWidth="0.6"/>
      <ellipse cx="-6" cy="-1" rx="10" ry="3" fill="var(--accent-strong)"/>
    </g>

    {/* coffee cup — left of plate */}
    <g transform="translate(160 200)">
      {/* saucer */}
      <ellipse cx="0" cy="22" rx="34" ry="6" fill="oklch(0.97 0.008 80)" stroke="oklch(0.86 0.012 70)" strokeWidth="0.8"/>
      {/* cup body */}
      <path d="M -22 0 Q -22 18 -16 22 L 16 22 Q 22 18 22 0 Z" fill="oklch(0.99 0.005 80)" stroke="oklch(0.84 0.014 70)" strokeWidth="1.2"/>
      {/* coffee surface */}
      <ellipse cx="0" cy="0" rx="22" ry="5" fill="oklch(0.40 0.060 50)"/>
      <ellipse cx="0" cy="0" rx="22" ry="5" fill="none" stroke="oklch(0.30 0.060 50)" strokeWidth="0.6"/>
      {/* handle */}
      <path d="M 22 4 Q 30 4 30 12 Q 30 18 22 17"
            fill="none" stroke="oklch(0.84 0.014 70)" strokeWidth="1.2"/>
      {/* steam */}
      <path d="M -6 -8 Q -8 -16 -4 -22 Q 0 -28 -2 -36"
            fill="none" stroke="oklch(0.84 0.014 70)" strokeWidth="1.4" strokeLinecap="round" opacity="0.55"/>
      <path d="M 6 -10 Q 10 -16 6 -24 Q 2 -30 6 -38"
            fill="none" stroke="oklch(0.84 0.014 70)" strokeWidth="1.4" strokeLinecap="round" opacity="0.45"/>
    </g>

    {/* small juice glass — right of plate */}
    <g transform="translate(360 200)">
      <path d="M -12 0 L -10 22 Q -10 25 -7 25 L 7 25 Q 10 25 10 22 L 12 0 Z"
            fill="oklch(0.95 0.005 80)" fillOpacity="0.55"
            stroke="oklch(0.84 0.014 70)" strokeWidth="1"/>
      <path d="M -11 4 L -9 22 Q -9 24 -6 24 L 6 24 Q 9 24 9 22 L 11 4 Z"
            fill="var(--accent)" fillOpacity="0.6"/>
    </g>

    {/* utensil — fork, left of plate, casual angle */}
    <g transform="translate(126 230) rotate(-8)" stroke="oklch(0.78 0.012 70)" strokeWidth="1.4" strokeLinecap="round" fill="none">
      <line x1="0" y1="0" x2="0" y2="-30"/>
      <line x1="-4" y1="-30" x2="-4" y2="-44"/>
      <line x1="0" y1="-30" x2="0" y2="-44"/>
      <line x1="4" y1="-30" x2="4" y2="-44"/>
      <path d="M -6 -28 Q 0 -22 6 -28" />
    </g>

    {/* sparkle — tiny brand wink above the empty far seat */}
    <g transform="translate(85 88)" fill="var(--accent-strong)" opacity="0.85">
      <path d="M 0 -8 L 1.6 -1.6 L 8 0 L 1.6 1.6 L 0 8 L -1.6 1.6 L -8 0 L -1.6 -1.6 Z"/>
    </g>
    <g transform="translate(434 96)" fill="var(--accent-strong)" opacity="0.6">
      <path d="M 0 -5 L 1 -1 L 5 0 L 1 1 L 0 5 L -1 1 L -5 0 L -1 -1 Z"/>
    </g>
  </svg>
);

const EmptyDashboard = ({ onCreate, onCreateQuick, theme, onThemeToggle }) => {
  return (
    <div className="bs-app">
      <TopBar active="home" onCreate={onCreate} theme={theme} onThemeToggle={onThemeToggle} />
      <main className="bs-page">
        {/* Greeting */}
        <div style={{ marginBottom: 28 }}>
          <p className="bs-eyebrow" style={{ margin: '0 0 8px' }}>Sunday, April 26</p>
          <h1 className="bs-h1">Morning, Yusef <span style={{ display: 'inline-block', transform: 'translateY(-2px)' }}>👋</span></h1>
          <p style={{ color: 'var(--fg-muted)', fontSize: 16, margin: 0, maxWidth: 540 }}>
            Nothing on the calendar yet — let's fix that.
          </p>
        </div>

        {/* Empty-state hero */}
        <div className="bs-card elev" style={{
          padding: 0, overflow: 'hidden', marginBottom: 40,
          background: 'linear-gradient(180deg, var(--accent-soft) 0%, var(--surface) 70%)',
        }}>
          <div style={{ padding: '48px 48px 24px', display: 'flex', justifyContent: 'center' }}>
            <BreakfastScene width={520} height={300} />
          </div>
          <div style={{ padding: '0 48px 48px', textAlign: 'center', maxWidth: 580, margin: '0 auto' }}>
            <h2 style={{
              fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 500,
              letterSpacing: '-0.022em', margin: '0 0 12px', textWrap: 'balance',
            }}>
              The table's set. Now invite some people.
            </h2>
            <p style={{ color: 'var(--fg-muted)', fontSize: 15, margin: '0 0 24px', lineHeight: 1.5 }}>
              Quick brunch takes 30 seconds — pick a spot, pick a time, send it.
              We'll handle invites, RSVPs, and the inevitable "what about Tartine?" debate.
            </p>
            <div className="bs-row" style={{ gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button className="bs-btn primary lg" onClick={onCreateQuick || onCreate}>
                <IconPlus size={16} /> <span>Round up the crew</span>
              </button>
            </div>
          </div>
        </div>

        {/* How it works — three-step strip. Marketing-only, no feature implications.
            (The richer curated-list version is parked in EmptyDashboard.v2-reference.jsx.) */}
        <div style={{ marginBottom: 16 }}>
          <p className="bs-eyebrow" style={{ margin: '0 0 12px' }}>How it works</p>
          <div className="bs-row" style={{ gap: 12, flexWrap: 'wrap', alignItems: 'stretch' }}>
            {[
              { n: 1, icon: <window.PopPin size={22} />,   title: 'Pick a spot',   sub: 'One place, or a few to vote on.' },
              { n: 2, icon: <window.PopUsers size={22} />, title: 'Invite the crew', sub: 'Share a link. No app to download.' },
              { n: 3, icon: <window.PopCheck size={22} />, title: 'RSVPs roll in', sub: "We'll nudge the slow ones." },
            ].map((s) => (
              <div key={s.n} className="bs-card" style={{
                flex: '1 1 240px', padding: 18,
                background: 'var(--surface)', border: '1px solid var(--line-soft)',
              }}>
                <div className="bs-row" style={{ gap: 12, marginBottom: 10, alignItems: 'center' }}>
                  {s.icon}
                  <div className="bs-spacer" />
                  <span style={{
                    fontSize: 11, fontWeight: 600, letterSpacing: '0.06em',
                    color: 'var(--fg-subtle)',
                  }}>
                    STEP {s.n}
                  </span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>{s.title}</div>
                <div style={{ fontSize: 13, color: 'var(--fg-muted)', lineHeight: 1.4 }}>{s.sub}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Join-by-link — promoted from the hero into its own tile.
            This IS a real v1 flow (invite link → RSVP without account). */}
        <button className="bs-card" style={{
          width: '100%', padding: '16px 20px', textAlign: 'left',
          background: 'var(--surface)', border: '1px dashed var(--line)',
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <IconShare size={18} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 2 }}>
              Got a link from a friend?
            </div>
            <div style={{ fontSize: 13, color: 'var(--fg-muted)', lineHeight: 1.4 }}>
              Paste it in to RSVP. No app, no signup.
            </div>
          </div>
          <span style={{ fontSize: 13, color: 'var(--fg-subtle)' }}>›</span>
        </button>
      </main>
    </div>
  );
};

window.EmptyDashboard = EmptyDashboard;
window.BreakfastScene = BreakfastScene;
