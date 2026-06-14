// SignOutModal — confirms before signing out.
// Decision: confirm modal → land on Welcome.
// Friend-tone, no ceremony.

const SignOutModal = ({ open, onClose, onConfirm }) => {
  return (
    <window.ModalShell
      open={open} onClose={onClose}
      title="Heading out?"
      sub="You can come back anytime — your brunches will still be here."
      footer={<>
        <button className="bs-btn ghost" onClick={onClose}>Stay signed in</button>
        <span className="bs-spacer" />
        <button className="bs-btn lg" onClick={onConfirm}
                style={{ background: 'var(--surface-2)', color: 'var(--fg)' }}>
          Sign out
        </button>
      </>}
    >
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16,
        padding: 14, background: 'var(--surface-2)',
        borderRadius: 'var(--r-2)',
      }}>
        <window.PopSparkle size={32} />
        <p style={{ margin: 0, fontSize: 13.5, color: 'var(--fg-muted)', lineHeight: 1.5 }}>
          We'll keep an eye on your upcoming brunches.
          Next time you sign in, you'll pick right up.
        </p>
      </div>
    </window.ModalShell>
  );
};

window.SignOutModal = SignOutModal;
