// ─────────────────────────────────────────────────────────────────────────────
// EmptyDashboard — v2 reference (PARKED, do not load)
// ─────────────────────────────────────────────────────────────────────────────
//
// This is the "three onboarding tiles" treatment of the empty dashboard.
// It was pulled from v1 because two of the three tiles imply features that
// are explicitly deferred to v2 in the engineering handoff:
//
//   • "Add your regulars"   → curated friends list  (v2: Favorite friends)
//   • "Save go-to spots"    → curated places list   (v2: Favorite places)
//   • "Connect calendar"    → calendar OAuth + free/busy overlay (v2)
//
// We liked the direction — three light, optional tiles that nudge the new
// user toward a more set-up account — so we're keeping the markup here for
// when those features actually exist. When v2 picks this back up:
//
//   1. Wire each tile's onClick to its real destination (lists + oauth flow).
//   2. Drop the "optional" eyebrow if any tile becomes a setup requirement.
//   3. Reconsider the "How it works" strip below the hero — these tiles can
//      replace it once the implied features ship, since real curation is a
//      better next step than marketing copy.
//
// Not loaded by Brunchsters Prototype.html. Lives in components/ purely as
// a reference snapshot.
// ─────────────────────────────────────────────────────────────────────────────

const EmptyDashboard_v2tiles_reference = () => (
  <div className="bs-row" style={{ gap: 12, flexWrap: 'wrap', marginTop: -16 }}>
    {[
      { icon: <window.PopUsers size={22} />,    title: 'Add your regulars',  sub: "Friends you'll brunch with often." },
      { icon: <window.PopPin size={22} />,      title: 'Save go-to spots',    sub: 'Start with a couple favorites.' },
      { icon: <window.PopCalendar size={22} />, title: 'Connect calendar',    sub: "We'll show your availability." },
    ].map((c, i) => (
      <button key={i} className="bs-card" style={{
        flex: '1 1 240px', padding: 18, textAlign: 'left',
        background: 'var(--surface)', border: '1px solid var(--line-soft)',
        cursor: 'pointer',
      }}>
        <div className="bs-row" style={{ gap: 12, marginBottom: 10 }}>
          {c.icon}
          <div className="bs-spacer" />
          <span style={{ fontSize: 12, color: 'var(--fg-subtle)' }}>optional</span>
        </div>
        <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>{c.title}</div>
        <div style={{ fontSize: 13, color: 'var(--fg-muted)', lineHeight: 1.4 }}>{c.sub}</div>
      </button>
    ))}
  </div>
);
