// Inbox — incoming nudges, RSVPs, cancellations, vote results.
// Designed to live behind the mobile shell's Inbox tab AND as a desktop
// drawer/panel. This file exports BOTH a list (InboxList) and a full screen
// (InboxScreen) for use in either context.
//
// Items are grouped by day. Unread = subtle accent dot.

const SAMPLE_INBOX = [
  { id: 'n1', kind: 'cancel', unread: true,
    fromName: 'Yusef', fromInitials: 'YA',
    brunch: 'Birthday brunch for Sam',
    body: 'Sam came down with something — let\'s reschedule next month.',
    time: '2h ago', day: 'Today' },
  { id: 'n2', kind: 'vote-closed', unread: true,
    fromName: 'Brunchsters', fromInitials: 'B',
    brunch: 'Sunday catch-up',
    body: 'Voting closed. Tartine Bakery wins with 4 votes.',
    time: '5h ago', day: 'Today' },
  { id: 'n3', kind: 'rsvp-yes', unread: false,
    fromName: 'Maya Reyes', fromInitials: 'MR',
    brunch: 'Sunday catch-up',
    body: 'is coming!',
    time: '1d ago', day: 'Yesterday' },
  { id: 'n4', kind: 'nudge', unread: false,
    fromName: 'Devon Kim', fromInitials: 'DK',
    brunch: 'Spring brunch club',
    body: 'gently nudged you to vote on location.',
    time: '2d ago', day: 'Earlier' },
  { id: 'n5', kind: 'change', unread: false,
    fromName: 'Priya Shah', fromInitials: 'PS',
    brunch: 'Spring brunch club',
    body: 'updated the time to 12:00 PM.',
    time: '3d ago', day: 'Earlier' },
  { id: 'n6', kind: 'rsvp-maybe', unread: false,
    fromName: 'Sam Liu', fromInitials: 'SL',
    brunch: 'Old roommates',
    body: 'might come (will know by Friday).',
    time: '4d ago', day: 'Earlier' },
];

const InboxIcon = ({ kind }) => {
  const map = {
    cancel:       { Cmp: window.PopSparkle, tone: 'tomato' },
    'vote-closed':{ Cmp: window.PopCheck,   tone: 'mint' },
    'rsvp-yes':   { Cmp: window.PopCheck,   tone: 'mint' },
    'rsvp-maybe': { Cmp: window.PopClock,   tone: 'peri' },
    nudge:        { Cmp: window.PopSparkle, tone: 'butter' },
    change:       { Cmp: window.PopCalendar,tone: 'peach' },
  };
  const { Cmp } = map[kind] || map.nudge;
  return Cmp ? <Cmp size={28} /> : null;
};

const InboxRow = ({ item, onOpen }) => {
  const isCancel = item.kind === 'cancel';
  return (
    <button onClick={onOpen} style={{
      display: 'flex', gap: 14, padding: '14px 16px',
      width: '100%', textAlign: 'left',
      background: item.unread ? 'var(--accent-soft)' : 'var(--surface)',
      border: 'none',
      borderBottom: '1px solid var(--line-soft)',
      cursor: 'pointer', position: 'relative',
      transition: 'background 0.15s var(--ease)',
    }}>
      <div style={{ width: 36, flexShrink: 0, display: 'flex', justifyContent: 'center', paddingTop: 2 }}>
        <InboxIcon kind={item.kind} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="bs-row" style={{ gap: 8, marginBottom: 2, alignItems: 'baseline' }}>
          <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--fg)' }}>{item.fromName}</span>
          <span className="bs-spacer" />
          <span style={{ fontSize: 11, color: 'var(--fg-subtle)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{item.time}</span>
        </div>
        <div style={{ fontSize: 13, color: isCancel ? 'oklch(0.45 0.140 30)' : 'var(--fg-muted)', lineHeight: 1.45, marginBottom: 4 }}>
          {item.body}
        </div>
        <div style={{ fontSize: 12, color: 'var(--fg-subtle)' }}>
          on <strong style={{ color: 'var(--fg-muted)', fontWeight: 500 }}>{item.brunch}</strong>
        </div>
      </div>
      {item.unread && (
        <div style={{
          position: 'absolute', left: 6, top: '50%', transform: 'translateY(-50%)',
          width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-strong)',
        }} />
      )}
    </button>
  );
};

const InboxScreen = ({ items = SAMPLE_INBOX, onOpen = () => {} }) => {
  const grouped = items.reduce((acc, it) => {
    (acc[it.day] = acc[it.day] || []).push(it);
    return acc;
  }, {});
  const dayOrder = ['Today', 'Yesterday', 'Earlier'];

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100%' }}>
      <header style={{
        padding: '20px 16px 16px', borderBottom: '1px solid var(--line-soft)',
        background: 'var(--surface)', position: 'sticky', top: 0, zIndex: 5,
      }}>
        <div className="bs-row" style={{ marginBottom: 4, alignItems: 'baseline' }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 500, letterSpacing: '-0.02em', margin: 0 }}>Inbox</h1>
          <span className="bs-spacer" />
          <span style={{ fontSize: 12, color: 'var(--fg-subtle)' }}>
            {items.filter(i => i.unread).length} unread
          </span>
        </div>
        <p style={{ fontSize: 13, color: 'var(--fg-muted)', margin: 0 }}>
          What's happening with your brunches.
        </p>
      </header>

      {dayOrder.map((day) => grouped[day] && (
        <section key={day}>
          <div style={{
            padding: '14px 16px 6px',
            fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em',
            color: 'var(--fg-subtle)',
          }}>{day}</div>
          {grouped[day].map((it) => (
            <InboxRow key={it.id} item={it} onOpen={() => onOpen(it)} />
          ))}
        </section>
      ))}

      {/* empty-state stub if all are read & there's nothing fresh */}
      {items.length === 0 && (
        <div style={{ padding: '60px 24px', textAlign: 'center' }}>
          <window.PopSparkle size={40} />
          <p style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 500, margin: '12px 0 4px' }}>
            All caught up
          </p>
          <p style={{ fontSize: 13, color: 'var(--fg-muted)', margin: 0 }}>
            We'll ping you when there's news.
          </p>
        </div>
      )}
    </div>
  );
};

window.InboxScreen = InboxScreen;
window.InboxRow = InboxRow;
window.SAMPLE_INBOX = SAMPLE_INBOX;
