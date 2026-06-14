// CalendarChip — Google Calendar one-tap add, used inline on the time card.
//
// States:
//  - locked: voting closed (or no voting). Shows "Add to calendar" with Google G.
//  - blocked: voting still open. Disabled, with hint "available when location's locked in"
//  - added:   user has tapped before. Shows "Added · update?" if details changed since.
//
// Builds a Google Calendar event URL. We keep it provider-singular per spec
// (Google only). For MVP we open in a new tab.

const buildGCalUrl = ({ title, description, location, startISO, endISO }) => {
  const fmt = (iso) => iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title || 'Brunch',
    details: description || '',
    location: location || '',
    dates: `${fmt(startISO)}/${fmt(endISO)}`,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
};

// tiny multicolor Google "G" — minimal, recognizable
const GCalGlyph = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 18 18" style={{ display: 'block' }}>
    <path fill="#4285F4" d="M16.5 9.2c0-.5 0-1-.1-1.5H9v2.9h4.2c-.2 1-.7 1.8-1.5 2.4v2h2.4c1.4-1.3 2.4-3.3 2.4-5.8z"/>
    <path fill="#34A853" d="M9 17c2 0 3.7-.7 5-1.8l-2.4-1.9c-.7.4-1.5.7-2.6.7-2 0-3.7-1.4-4.3-3.2H2.2v2C3.5 15.3 6 17 9 17z"/>
    <path fill="#FBBC05" d="M4.7 10.8a4.6 4.6 0 010-2.6V6.2H2.2a8 8 0 000 5.6l2.5-1z"/>
    <path fill="#EA4335" d="M9 4.6c1.1 0 2.1.4 2.9 1.1l2.1-2.1A8 8 0 009 1C6 1 3.5 2.7 2.2 5.2l2.5 2c.6-1.8 2.3-3.2 4.3-3.2z"/>
  </svg>
);

const CalendarChip = ({
  title,
  description,
  location,
  startISO,
  endISO,
  votingOpen = false,
  detailsChanged = false,
  size = 'md',
}) => {
  const [added, setAdded] = React.useState(false);

  const blocked = votingOpen;
  const updateMode = added && detailsChanged && !blocked;

  const onClick = () => {
    if (blocked) return;
    const url = buildGCalUrl({ title, description, location, startISO, endISO });
    window.open(url, '_blank', 'noopener,noreferrer');
    setAdded(true);
  };

  const padY = size === 'sm' ? 4 : 6;
  const padX = size === 'sm' ? 8 : 10;
  const fontSize = size === 'sm' ? 11.5 : 12.5;

  return (
    <button
      onClick={onClick}
      disabled={blocked}
      title={blocked ? "Available once location is confirmed" : (updateMode ? "Re-add — details changed" : "Add to Google Calendar")}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: `${padY}px ${padX}px ${padY}px ${padX - 2}px`,
        borderRadius: 'var(--r-pill)',
        border: '1px solid var(--line)',
        background: blocked ? 'transparent' : (added && !updateMode ? 'var(--mint)' : 'var(--surface)'),
        color: blocked ? 'var(--fg-subtle)'
              : updateMode ? 'var(--accent-fg)'
              : (added ? 'var(--mint-fg)' : 'var(--fg)'),
        borderColor: blocked ? 'var(--line-soft)'
                   : updateMode ? 'var(--accent-strong)'
                   : (added ? 'transparent' : 'var(--line)'),
        fontSize, fontWeight: 500,
        cursor: blocked ? 'not-allowed' : 'pointer',
        opacity: blocked ? 0.6 : 1,
        transition: 'all 0.15s var(--ease)',
        whiteSpace: 'nowrap',
      }}
    >
      <GCalGlyph size={size === 'sm' ? 12 : 14} />
      <span>
        {blocked ? 'Calendar locks when location does'
         : updateMode ? 'Update calendar'
         : added ? 'Added' : 'Add to calendar'}
      </span>
    </button>
  );
};

window.CalendarChip = CalendarChip;
window.buildGCalUrl = buildGCalUrl;
window.GCalGlyph = GCalGlyph;
