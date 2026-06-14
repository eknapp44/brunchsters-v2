// MuteBrunchControl — per-brunch notification mute.
//
// Replaces the dead "Mute notifications" button at the bottom of InviteeDetail.
// Tappable chip with three states: on / quiet (only big events) / off.
//
// "Quiet" is a soft middle ground — mutes vote pings + nudges, but still
// notifies on host actions (cancel, lock-in, time change) that they need to know.

const MUTE_STATES = [
  { v: 'on',    label: "All on",        sub: "Everything",            icon: '🔔' },
  { v: 'quiet', label: "Just big stuff", sub: "Hosts only",           icon: '🤫' },
  { v: 'off',   label: "Muted",         sub: "Nothing till the day",  icon: '🔕' },
];

const MuteBrunchControl = ({ value = 'on', onChange }) => {
  const [open, setOpen] = React.useState(false);
  const current = MUTE_STATES.find(s => s.v === value) || MUTE_STATES[0];

  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(!open)} className="bs-btn ghost"
              style={{
                color: value === 'off' ? 'oklch(0.50 0.140 30)'
                     : value === 'quiet' ? 'var(--fg-muted)'
                     : 'var(--fg-subtle)',
                gap: 8,
              }}>
        <span style={{ fontSize: 16 }}>{current.icon}</span>
        <span>{value === 'on' ? 'Notifications on' : current.label}</span>
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{
            position: 'fixed', inset: 0, zIndex: 40,
          }} />
          <div style={{
            position: 'absolute', right: 0, bottom: 'calc(100% + 6px)', zIndex: 50,
            minWidth: 260,
            background: 'var(--surface)', border: '1px solid var(--line)',
            borderRadius: 'var(--r-3)', padding: 6,
            boxShadow: '0 12px 32px -8px oklch(0.20 0.01 70 / 0.20)',
          }}>
            <p className="bs-eyebrow" style={{ margin: '8px 12px 6px' }}>
              Notifications for this brunch
            </p>
            {MUTE_STATES.map((s) => {
              const selected = s.v === value;
              return (
                <button key={s.v}
                        onClick={() => { onChange(s.v); setOpen(false); }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 12,
                          width: '100%', padding: '10px 12px',
                          background: selected ? 'var(--accent-soft)' : 'transparent',
                          border: 0, borderRadius: 'var(--r-2)',
                          cursor: 'pointer', textAlign: 'left',
                          color: selected ? 'var(--accent-fg)' : 'var(--fg)',
                        }}>
                  <span style={{ fontSize: 20 }}>{s.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{s.label}</div>
                    <div style={{ fontSize: 12, color: selected ? 'var(--accent-fg)' : 'var(--fg-muted)', opacity: selected ? 0.7 : 1 }}>{s.sub}</div>
                  </div>
                  {selected && <window.PopCheck size={18} />}
                </button>
              );
            })}
            {value === 'off' && (
              <p style={{ fontSize: 11.5, color: 'var(--fg-subtle)',
                          padding: '6px 12px 8px', margin: 0, lineHeight: 1.5 }}>
                You'll still get a heads-up the morning of, just in case.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
};

window.MuteBrunchControl = MuteBrunchControl;
window.MUTE_STATES = MUTE_STATES;
