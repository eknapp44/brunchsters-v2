// Cancel + Change brunch modals — destructive/edit flows for hosts.
//
// Decisions:
//  - Entry: overflow menu (•••) AND visible secondary button (decide-for-me default)
//  - Confirm: modal with optional reason field; reason flows into notifications
//  - Change scope: time, date, location (locked-in only), title/desc, re-open voting
//
// Both modals share base chrome.

const ModalShell = ({ open, onClose, title, sub, children, footer, tone = 'neutral' }) => {
  const dialogRef = React.useRef(null);
  window.useFocusTrap(dialogRef, open);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  const toneBg = tone === 'destructive' ? 'oklch(0.78 0.140 30)' : 'var(--accent-strong)';
  return (
    <div onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="modal-title" style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'oklch(0.20 0.01 70 / 0.40)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20, animation: 'ms-fade 0.2s var(--ease)',
    }}>
      <div ref={dialogRef} onClick={(e) => e.stopPropagation()} style={{
        background: 'var(--surface)',
        borderRadius: 'var(--r-3)', maxWidth: 520, width: '100%',
        boxShadow: '0 24px 60px -12px oklch(0.20 0.01 70 / 0.30)',
        animation: 'ms-slide-up 0.28s var(--ease-spring)',
        overflow: 'hidden',
      }}>
        <div style={{ height: 4, background: toneBg }} />
        <div style={{ padding: '24px 24px 4px' }}>
          <h2 id="modal-title" style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 500,
                       letterSpacing: '-0.015em', margin: '0 0 6px' }}>{title}</h2>
          {sub && <p style={{ color: 'var(--fg-muted)', fontSize: 14, margin: 0, lineHeight: 1.5 }}>{sub}</p>}
        </div>
        <div style={{ padding: '16px 24px' }}>{children}</div>
        <div style={{
          padding: '16px 24px', display: 'flex', gap: 10,
          borderTop: '1px solid var(--line-soft)', background: 'var(--surface-2)',
        }}>{footer}</div>
      </div>
    </div>
  );
};

const CancelBrunchModal = ({ open, onClose, brunchTitle = 'Birthday brunch for Sam', notifyCount = 5, onConfirm }) => {
  const [reason, setReason] = React.useState('');
  return (
    <ModalShell
      open={open} onClose={onClose} tone="destructive"
      title={`Calling off "${brunchTitle}"?`}
      sub={`We'll let the ${notifyCount} ${notifyCount === 1 ? 'person' : 'folks'} who said yes, maybe, or hadn't said yet know.`}
      footer={<>
        <button className="bs-btn ghost" onClick={onClose}>Nope, keep it</button>
        <span className="bs-spacer" />
        <button className="bs-btn lg" onClick={() => onConfirm(reason)} style={{
          background: 'oklch(0.78 0.140 30)', color: '#fff', borderColor: 'transparent',
        }}>Call it off</button>
      </>}
    >
      <label className="bs-label">A short note · <span style={{ color: 'var(--fg-subtle)', fontWeight: 400 }}>optional</span></label>
      <textarea
        className="bs-textarea"
        placeholder="e.g. 'Sam came down with something — let's reschedule next month.'"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        style={{ minHeight: 80 }}
      />
      <p style={{ fontSize: 12, color: 'var(--fg-subtle)', margin: '8px 0 0' }}>
        Goes in their notification. Helps avoid texts.
      </p>
    </ModalShell>
  );
};

const ChangeBrunchModal = ({ open, onClose, onSave }) => {
  const [draft, setDraft] = React.useState({
    title: 'Birthday brunch for Sam',
    description: 'Sunday vibes, low-key, bring whoever 💕',
    date: '2026-05-10',
    time: '11:30',
    location: 'Tartine Bakery',
    reopenVoting: false,
  });
  const fields = [
    { key: 'title', label: 'Title' },
    { key: 'description', label: 'Description', multi: true },
    { key: 'date', label: 'Date', type: 'date' },
    { key: 'time', label: 'Time', type: 'time' },
    { key: 'location', label: 'Location · locked in' },
  ];
  return (
    <ModalShell
      open={open} onClose={onClose}
      title="Tweak the details"
      sub="Anyone who said yes or maybe will get a heads-up."
      footer={<>
        <button className="bs-btn ghost" onClick={onClose}>Cancel</button>
        <span className="bs-spacer" />
        <button className="bs-btn primary lg" onClick={() => onSave(draft)}>
          <window.PopCheck size={18} /> <span>Save it</span>
        </button>
      </>}
    >
      <div className="bs-col" style={{ gap: 14 }}>
        {fields.map((f) => (
          <div key={f.key}>
            <label className="bs-label">{f.label}</label>
            {f.multi
              ? <textarea className="bs-textarea" value={draft[f.key]}
                  onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} />
              : <input className="bs-input" type={f.type || 'text'} value={draft[f.key]}
                  onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} />}
          </div>
        ))}
        <label className="bs-row" style={{ gap: 10, padding: '10px 12px',
                                            background: 'var(--surface-2)',
                                            borderRadius: 'var(--r-2)',
                                            cursor: 'pointer' }}>
          <input type="checkbox" checked={draft.reopenVoting}
                 onChange={(e) => setDraft({ ...draft, reopenVoting: e.target.checked })} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 500 }}>Re-open the vote on location</div>
            <div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>Useful if Tartine doesn't open on the new date.</div>
          </div>
        </label>
      </div>
    </ModalShell>
  );
};

window.CancelBrunchModal = CancelBrunchModal;
window.ChangeBrunchModal = ChangeBrunchModal;
window.ModalShell = ModalShell;
