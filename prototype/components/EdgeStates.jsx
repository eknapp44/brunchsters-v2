// EdgeStates — two cards a host might encounter near close-time:
//
//  - QuietNudge   : T-24h with zero yes/maybe. Three options: nudge, push, cancel.
//  - TieBreaker   : voting closed with ≥2 leading options tied. Host picks one.
//
// Both are dropped into the host detail page when the conditions are met.
// For the design canvas we render them as standalone cards.

const QuietNudge = ({ brunchTitle = "Sunday catch-up", invitedCount = 6, onNudge, onPush, onCancel }) => (
  <div className="bs-card elev" style={{
    padding: 22,
    border: '1px solid oklch(0.85 0.080 65)',
    background: 'oklch(0.97 0.030 75)',
  }}>
    <div className="bs-row" style={{ gap: 10, marginBottom: 8 }}>
      <window.PopSparkle size={24} />
      <p className="bs-eyebrow" style={{ margin: 0, color: 'oklch(0.40 0.080 60)' }}>It's gone quiet</p>
    </div>
    <h3 className="bs-h3" style={{ margin: '0 0 8px' }}>
      It's been crickets on <em style={{ fontStyle: 'normal', color: 'var(--accent-fg)' }}>{brunchTitle}</em>.
    </h3>
    <p style={{ fontSize: 13.5, color: 'var(--fg-muted)', margin: '0 0 16px', lineHeight: 1.5 }}>
      Brunch is tomorrow and {invitedCount} {invitedCount === 1 ? 'person hasn\'t' : 'folks haven\'t'} said anything.
      A friendly nudge tends to fix it. Or punt the date a week, or call it off.
    </p>
    <div className="bs-row" style={{ gap: 10, flexWrap: 'wrap' }}>
      <button className="bs-btn primary" onClick={onNudge}>
        <window.PopSparkle size={18} /> <span>Nudge the gang</span>
      </button>
      <button className="bs-btn" onClick={onPush}>
        <window.PopCalendar size={18} /> <span>Punt a week</span>
      </button>
      <button className="bs-btn" onClick={onCancel}
              style={{ color: 'oklch(0.50 0.180 30)' }}>
        Call it off
      </button>
    </div>
    <p style={{ fontSize: 11.5, color: 'var(--fg-subtle)', margin: '12px 0 0' }}>
      No judgement — life happens. There's always next week.
    </p>
  </div>
);

const TieBreaker = ({ options = [
  { id: 'l1', name: 'Tartine Bakery', sub: 'Mission · 0.4 mi', votes: 3 },
  { id: 'l2', name: 'Zazie',          sub: 'Cole Valley · 1.8 mi', votes: 3 },
], onPick, onRevote }) => {
  const [picked, setPicked] = React.useState(null);
  const tieCount = options[0]?.votes || 0;
  return (
    <div className="bs-card elev" style={{ padding: 22 }}>
      <div className="bs-row" style={{ gap: 10, marginBottom: 8 }}>
        <window.PopUsers size={24} />
        <p className="bs-eyebrow" style={{ margin: 0 }}>Voting closed · it's a tie</p>
      </div>
      <h3 className="bs-h3" style={{ margin: '0 0 6px' }}>
        Tied at {tieCount} each.
      </h3>
      <p style={{ fontSize: 13.5, color: 'var(--fg-muted)', margin: '0 0 16px' }}>
        You're the host — make the call. Pick one to lock in, or open a runoff.
      </p>

      <div className="bs-col" style={{ gap: 10 }}>
        {options.map((o) => {
          const isPicked = picked === o.id;
          return (
            <button key={o.id} onClick={() => setPicked(o.id)}
                    className={`bs-option${isPicked ? ' selected' : ''}`}
                    style={{
                      padding: 14, alignItems: 'center',
                      borderColor: isPicked ? 'var(--accent-strong)' : 'var(--line)',
                      background: isPicked ? 'var(--accent-soft)' : 'var(--surface)',
                    }}>
              <div className="radio" />
              <div className="body" style={{ flex: 1 }}>
                <div className="title">{o.name}</div>
                <div className="sub">{o.sub}</div>
              </div>
              <span className="bs-pill" style={{ height: 22 }}>{o.votes} votes</span>
            </button>
          );
        })}
      </div>

      <div className="bs-row" style={{ gap: 10, marginTop: 16 }}>
        <button className="bs-btn primary lg" disabled={!picked}
                onClick={() => onPick && onPick(picked)}
                style={{ opacity: picked ? 1 : 0.4 }}>
          <window.PopCheck size={18} />
          <span>Lock in {picked ? options.find(o => o.id === picked).name : 'pick'}</span>
        </button>
        <button className="bs-btn" onClick={onRevote}>Run a tiebreaker</button>
      </div>
    </div>
  );
};

window.QuietNudge = QuietNudge;
window.TieBreaker = TieBreaker;
