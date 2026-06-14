// ShareSheet — host's share modal. Fires from the Share button on host detail.
//
// Decisions:
//   - Link format: brunchsters.app/b/{slug}-{token} (readable + signed)
//   - Expires: 7 days after the brunch (gives a window to look back at it)
//   - Revoke: yes, host can regenerate (kicks anyone with the old link)
//
// Three sections:
//   1. The link + copy state (with success toast)
//   2. Native share targets (iMessage / Mail / WhatsApp / more — via Web Share API)
//   3. "Advanced" disclosure — revoke + regenerate

const SLUG_BASE = 'brunchsters.app/b/sam-birthday-8fX2k';

const ShareSheet = ({ open, onClose, brunch }) => {
  const [copied, setCopied] = React.useState(false);
  const [revealAdvanced, setRevealAdvanced] = React.useState(false);
  const [confirmRevoke, setConfirmRevoke] = React.useState(false);
  const [linkSlug, setLinkSlug] = React.useState(SLUG_BASE);

  const onCopy = () => {
    navigator.clipboard?.writeText('https://' + linkSlug).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2400);
  };

  const onNativeShare = () => {
    if (navigator.share) {
      navigator.share({
        title: 'You\'re invited to brunch 🥂',
        text: 'Sam invited you to brunch — RSVP + vote on where.',
        url: 'https://' + linkSlug,
      }).catch(() => {});
    }
  };

  const onRegenerate = () => {
    // Generate a new token; same slug, new tail.
    const tail = Math.random().toString(36).slice(2, 7);
    setLinkSlug(SLUG_BASE.replace(/-[a-zA-Z0-9]+$/, '-' + tail));
    setConfirmRevoke(false);
    setRevealAdvanced(true);
  };

  return (
    <window.ModalShell
      open={open} onClose={onClose}
      title="Share this brunch"
      sub="Anyone with this link can RSVP and vote. Expires 7 days after the brunch."
      footer={<>
        <span className="bs-spacer" />
        <button className="bs-btn lg" onClick={onClose}>Done</button>
      </>}
    >
      <div className="bs-col" style={{ gap: 14 }}>
        {/* The link + copy */}
        <div style={{
          display: 'flex', gap: 6, padding: 6,
          border: '1px solid var(--line)', borderRadius: 'var(--r-2)',
          background: 'var(--surface)',
        }}>
          <div style={{
            flex: 1, padding: '8px 12px',
            fontFamily: 'var(--font-mono)', fontSize: 13,
            color: 'var(--fg)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            display: 'flex', alignItems: 'center',
          }}>{linkSlug}</div>
          <button className="bs-btn" onClick={onCopy} style={{
            background: copied ? 'var(--mint)' : 'var(--accent-strong)',
            color: copied ? 'var(--mint-fg)' : 'var(--accent-fg)',
            borderColor: 'transparent', transition: 'background 0.2s var(--ease)',
            minWidth: 100, justifyContent: 'center',
          }}>
            {copied
              ? <><window.PopCheck size={18} /> Copied</>
              : <><window.PopShare size={18} /> Copy link</>}
          </button>
        </div>

        {/* Native share + suggested apps row */}
        <div>
          <p className="bs-eyebrow" style={{ margin: '4px 0 8px' }}>Or share to…</p>
          <div className="bs-row" style={{ gap: 10, flexWrap: 'wrap' }}>
            <ShareTarget icon="💬" label="iMessage" onClick={onNativeShare} />
            <ShareTarget icon="✉️" label="Email" onClick={onNativeShare} />
            <ShareTarget icon="💚" label="WhatsApp" onClick={onNativeShare} />
            <ShareTarget icon="…" label="More" onClick={onNativeShare} />
          </div>
        </div>

        {/* Advanced disclosure */}
        <button onClick={() => setRevealAdvanced(!revealAdvanced)}
                className="bs-row"
                style={{
                  background: 'transparent', border: 0,
                  padding: '6px 0', cursor: 'pointer',
                  color: 'var(--fg-muted)', fontSize: 12.5,
                  width: 'fit-content',
                }}>
          <span>{revealAdvanced ? '−' : '+'}</span>
          <span>Advanced · revoke this link</span>
        </button>

        {revealAdvanced && (
          <div style={{
            padding: 14, borderRadius: 'var(--r-2)',
            background: 'oklch(0.98 0.012 30)',
            border: '1px solid oklch(0.88 0.060 30)',
          }}>
            <div className="bs-row" style={{ gap: 12, alignItems: 'flex-start' }}>
              <window.PopSparkle size={22} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 500, marginBottom: 2 }}>
                  Revoke and regenerate
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--fg-muted)', lineHeight: 1.5 }}>
                  Kills the current link. Anyone who hasn't opened it yet won't be able to RSVP.
                  People already in are unaffected. We'll generate a fresh link for you to re-share.
                </div>
              </div>
            </div>
            {!confirmRevoke ? (
              <button className="bs-btn sm" onClick={() => setConfirmRevoke(true)}
                      style={{
                        marginTop: 12, color: 'oklch(0.42 0.140 30)',
                        borderColor: 'oklch(0.78 0.140 30 / 0.5)',
                      }}>
                Revoke this link
              </button>
            ) : (
              <div className="bs-row" style={{ gap: 8, marginTop: 12 }}>
                <button className="bs-btn sm" onClick={() => setConfirmRevoke(false)}>
                  Cancel
                </button>
                <button className="bs-btn sm" onClick={onRegenerate}
                        style={{
                          background: 'oklch(0.78 0.140 30)', color: '#fff', borderColor: 'transparent',
                        }}>
                  Yes, revoke &amp; regenerate
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </window.ModalShell>
  );
};

const ShareTarget = ({ icon, label, onClick }) => (
  <button onClick={onClick} className="bs-row" style={{
    background: 'var(--surface)', border: '1px solid var(--line)',
    borderRadius: 'var(--r-2)', padding: '10px 14px', gap: 8,
    cursor: 'pointer', fontSize: 13, color: 'var(--fg)',
    fontWeight: 500,
  }}>
    <span style={{ fontSize: 18 }}>{icon}</span>
    <span>{label}</span>
  </button>
);

window.ShareSheet = ShareSheet;
window.ShareTarget = ShareTarget;
