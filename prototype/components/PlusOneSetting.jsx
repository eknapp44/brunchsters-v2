// Plus-ones — host-side opt-in toggle on host detail.
// Default: off. Host opts in per brunch. Affects head count + invitee view.
//
// Component shape:
//   <PlusOneSetting allowed={bool} max={n} onChange={(allowed, max) => ...} />
//
// Lives in a small card inside the host detail's right column (with
// "Who's coming" and "Heads up").

const PlusOneSetting = ({ allowed = false, max = 1, onChange }) => {
  const [open, setOpen] = React.useState(allowed);

  React.useEffect(() => setOpen(allowed), [allowed]);

  return (
    <div className="bs-card flat" style={{
      padding: 18,
      background: 'var(--surface-2)',
      border: '1px solid var(--line-soft)',
    }}>
      <label className="bs-row" style={{ gap: 12, cursor: 'pointer', alignItems: 'flex-start' }}>
        <input type="checkbox" checked={allowed}
               onChange={(e) => { onChange(e.target.checked, max); }}
               style={{ marginTop: 3 }} />
        <div style={{ flex: 1 }}>
          <div className="bs-row" style={{ gap: 8, alignItems: 'center', marginBottom: 4 }}>
            <window.PopUsers size={20} />
            <span style={{ fontSize: 14, fontWeight: 500 }}>Allow plus-ones</span>
          </div>
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--fg-muted)', lineHeight: 1.45 }}>
            Off by default. Turn on if your spot can fit extras — guests can bring up to {max} more.
          </p>
        </div>
      </label>

      {allowed && (
        <div className="bs-row" style={{ marginTop: 12, paddingTop: 12,
                                          borderTop: '1px solid var(--line-soft)',
                                          gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: 'var(--fg-muted)' }}>Each guest can bring</span>
          <div className="bs-row" style={{ gap: 4 }}>
            {[1, 2, 3].map((n) => (
              <button key={n}
                      onClick={() => onChange(true, n)}
                      style={{
                        width: 32, height: 30,
                        border: '1px solid var(--line)',
                        background: max === n ? 'var(--accent-strong)' : 'var(--surface)',
                        color: max === n ? 'var(--accent-fg)' : 'var(--fg)',
                        borderRadius: 'var(--r-1)',
                        fontSize: 13, fontWeight: 500,
                        cursor: 'pointer',
                      }}>+{n}</button>
            ))}
          </div>
          <span className="bs-spacer" />
          <span style={{ fontSize: 11, color: 'var(--fg-subtle)' }}>
            up to {max} per guest
          </span>
        </div>
      )}
    </div>
  );
};

// Helper to render a plus-one summary on the "Who's coming" list, when an
// attendee has registered one. Renders inline beside the name.
const PlusOneTag = ({ name }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '1px 8px 1px 6px',
    background: 'var(--accent-soft)',
    color: 'var(--accent-fg)',
    borderRadius: 'var(--r-pill)',
    fontSize: 11, fontWeight: 500,
  }}>
    +1{name && ` · ${name}`}
  </span>
);

window.PlusOneSetting = PlusOneSetting;
window.PlusOneTag = PlusOneTag;
