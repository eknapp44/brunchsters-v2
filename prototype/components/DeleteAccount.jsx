// Account deletion — two-step destructive flow.
//
// Decisions:
//   - Entry: Me tab "Danger zone" at the bottom (industry standard)
//   - Data: cancel upcoming hosted brunches, keep past as historical
//          (Yusef's name stays on past brunches; future ones notify attendees)
//   - Grace: 30-day soft delete — they can sign back in to restore
//
// Flow:
//   1. Click "Delete account" in Danger zone
//   2. Modal Step 1 — show consequences, primary "Continue", ghost "Stay"
//   3. Modal Step 2 — final confirm with typed "delete"
//   4. Replaces page with GoodbyeScreen (30-day countdown)
//   5. If they sign back in within 30 days, RestorePrompt fires

const DeleteAccountModal = ({ open, onClose, onConfirm,
                              upcomingHosting = 1, pendingRsvps = 2 }) => {
  const [step, setStep] = React.useState(1);
  const [confirmText, setConfirmText] = React.useState('');

  React.useEffect(() => { if (open) { setStep(1); setConfirmText(''); } }, [open]);

  if (!open) return null;

  if (step === 1) {
    return (
      <window.ModalShell
        open={open} onClose={onClose} tone="destructive"
        title="Heading out for good?"
        sub="Here's what'll happen if you delete your account. We won't be weird about it."
        footer={<>
          <button className="bs-btn ghost" onClick={onClose}>Stay</button>
          <span className="bs-spacer" />
          <button className="bs-btn lg" onClick={() => setStep(2)} style={{
            background: 'oklch(0.78 0.140 30)', color: '#fff', borderColor: 'transparent',
          }}>Continue</button>
        </>}
      >
        <div className="bs-col" style={{ gap: 10 }}>
          <div style={{
            display: 'flex', gap: 12, padding: 14, alignItems: 'flex-start',
            background: 'var(--surface-2)', borderRadius: 'var(--r-2)',
          }}>
            <window.PopCalendar size={22} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 2 }}>
                {upcomingHosting > 0
                  ? `${upcomingHosting} upcoming brunch ${upcomingHosting === 1 ? "you're hosting will be called off" : "you're hosting will be called off"}`
                  : "No upcoming brunches you're hosting"}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--fg-muted)' }}>
                {upcomingHosting > 0
                  ? 'Everyone who said yes, maybe, or hadn\'t said yet will get a heads-up.'
                  : "Nothing to cancel — you're clear."}
              </div>
            </div>
          </div>

          <div style={{
            display: 'flex', gap: 12, padding: 14, alignItems: 'flex-start',
            background: 'var(--surface-2)', borderRadius: 'var(--r-2)',
          }}>
            <window.PopUsers size={22} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 2 }}>
                {pendingRsvps > 0
                  ? `${pendingRsvps} RSVPs you've sent will be withdrawn`
                  : "No pending RSVPs"}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--fg-muted)' }}>
                Hosts will see you've stepped out — they won't see why.
              </div>
            </div>
          </div>

          <div style={{
            display: 'flex', gap: 12, padding: 14, alignItems: 'flex-start',
            background: 'var(--surface-2)', borderRadius: 'var(--r-2)',
          }}>
            <window.PopClock size={22} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 2 }}>
                30 days to change your mind
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--fg-muted)' }}>
                Sign back in within 30 days to bring it all back. After that, your data's gone for real.
              </div>
            </div>
          </div>

          <div style={{
            display: 'flex', gap: 12, padding: 14, alignItems: 'flex-start',
            background: 'var(--surface-2)', borderRadius: 'var(--r-2)',
          }}>
            <window.PopEgg size={22} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 2 }}>
                Past brunches stick around
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--fg-muted)' }}>
                Friends who hosted brunches you came to keep that history. Your name shows as "former Brunchster."
              </div>
            </div>
          </div>
        </div>
      </window.ModalShell>
    );
  }

  // Step 2 — type-to-confirm
  const canDelete = confirmText.trim().toLowerCase() === 'delete';
  return (
    <window.ModalShell
      open={open} onClose={onClose} tone="destructive"
      title="Last check."
      sub="Type 'delete' below to confirm. We hope you come back."
      footer={<>
        <button className="bs-btn ghost" onClick={() => setStep(1)}>Back</button>
        <span className="bs-spacer" />
        <button className="bs-btn lg" disabled={!canDelete}
                onClick={() => onConfirm()}
                style={{
                  background: canDelete ? 'oklch(0.78 0.140 30)' : 'var(--surface-2)',
                  color: canDelete ? '#fff' : 'var(--fg-subtle)',
                  borderColor: 'transparent',
                  opacity: canDelete ? 1 : 0.6, cursor: canDelete ? 'pointer' : 'not-allowed',
                }}>Delete my account</button>
      </>}
    >
      <input
        className="bs-input"
        autoFocus
        placeholder="type 'delete' to confirm"
        value={confirmText}
        onChange={(e) => setConfirmText(e.target.value)}
        style={{ fontFamily: 'var(--font-mono)' }}
      />
      <p style={{ fontSize: 12.5, color: 'var(--fg-subtle)', margin: '12px 0 0', lineHeight: 1.5 }}>
        Your account will be soft-deleted today. We'll fully erase it on{' '}
        <strong style={{ color: 'var(--fg-muted)' }}>
          {new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
        </strong>.
      </p>
    </window.ModalShell>
  );
};

// Post-deletion screen — what they see after confirming.
// Also what they'd see if they signed in mid-grace-period (with restore option).
const GoodbyeScreen = ({ daysLeft = 30, onRestore }) => (
  <div className="bs-app" style={{ minHeight: '100%',
    background: 'linear-gradient(180deg, var(--surface-2) 0%, var(--bg) 50%)' }}>
    <main style={{
      maxWidth: 480, margin: '0 auto', padding: '64px 24px',
      display: 'flex', flexDirection: 'column', minHeight: '100%', textAlign: 'center',
    }}>
      <div style={{ marginBottom: 'auto', paddingTop: 24, display: 'flex', justifyContent: 'center' }}>
        <Wordmark size="md" />
      </div>

      <div style={{ padding: '40px 0' }}>
        <div style={{
          width: 96, height: 96, margin: '0 auto 24px',
          borderRadius: '50%', background: 'var(--surface)',
          border: '1px solid var(--line)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <window.PopEgg size={48} />
        </div>

        <h1 style={{
          fontFamily: 'var(--font-display)', fontSize: 36, fontWeight: 500,
          letterSpacing: '-0.022em', margin: '0 0 12px', textWrap: 'balance', lineHeight: 1.15,
        }}>
          See you 'round. 💕
        </h1>

        <p style={{ fontSize: 15, color: 'var(--fg-muted)', margin: '0 0 24px',
                     lineHeight: 1.55, textWrap: 'pretty' }}>
          Your account's been deactivated. We've called off your upcoming brunches
          and let everyone know.
        </p>

        <div style={{
          padding: 18, background: 'var(--surface)', borderRadius: 'var(--r-3)',
          border: '1px solid var(--line-soft)', marginBottom: 24,
        }}>
          <div className="bs-row" style={{ gap: 10, justifyContent: 'center', marginBottom: 8 }}>
            <window.PopClock size={20} />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>
              {daysLeft} days to change your mind
            </span>
          </div>
          <p style={{ fontSize: 12.5, color: 'var(--fg-muted)', margin: 0, lineHeight: 1.5 }}>
            Sign in before then and everything comes back. After that, it's gone for real —
            account, history, all of it.
          </p>
        </div>

        {onRestore && (
          <button className="bs-btn primary lg" onClick={onRestore}>
            <window.PopSparkle size={18} /> <span>Actually, bring it back</span>
          </button>
        )}
      </div>

      <p style={{ marginTop: 'auto', fontSize: 11.5, color: 'var(--fg-subtle)', lineHeight: 1.5 }}>
        Questions? <a href="#" style={{ color: 'var(--fg-muted)' }}>hi@brunchsters.app</a>
      </p>
    </main>
  </div>
);

// Restore prompt — shown if user signs in mid-grace-period
const RestorePrompt = ({ daysLeft = 22, onRestore, onComplete }) => (
  <div className="bs-app" style={{ minHeight: '100%',
    background: 'linear-gradient(180deg, var(--accent-soft) 0%, var(--bg) 50%)' }}>
    <main style={{
      maxWidth: 480, margin: '0 auto', padding: '64px 24px',
      display: 'flex', flexDirection: 'column', minHeight: '100%', textAlign: 'center',
    }}>
      <div style={{ marginBottom: 'auto', paddingTop: 24, display: 'flex', justifyContent: 'center' }}>
        <Wordmark size="md" />
      </div>

      <div style={{ padding: '40px 0' }}>
        <div style={{
          width: 96, height: 96, margin: '0 auto 24px',
          borderRadius: '50%', background: 'var(--accent-soft)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <window.PopSparkle size={48} />
        </div>

        <h1 style={{
          fontFamily: 'var(--font-display)', fontSize: 36, fontWeight: 500,
          letterSpacing: '-0.022em', margin: '0 0 12px', textWrap: 'balance', lineHeight: 1.15,
        }}>
          Welcome back. 🥂
        </h1>

        <p style={{ fontSize: 15, color: 'var(--fg-muted)', margin: '0 0 24px',
                     lineHeight: 1.55, textWrap: 'pretty', maxWidth: 380, marginLeft: 'auto', marginRight: 'auto' }}>
          Your account is in a 30-day cool-down. Bring it back now and we'll restore everything —
          your past brunches, your friends, your handle.
        </p>

        <p style={{ fontSize: 12.5, color: 'var(--fg-subtle)', margin: '0 0 32px' }}>
          {daysLeft} days left before it's deleted for good.
        </p>

        <div className="bs-row" style={{ gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="bs-btn primary lg" onClick={onRestore}>
            <window.PopSparkle size={18} /> <span>Restore my account</span>
          </button>
          <button className="bs-btn lg" onClick={onComplete}
                  style={{ background: 'transparent', color: 'var(--fg-muted)' }}>
            Continue with deletion
          </button>
        </div>
      </div>
    </main>
  </div>
);

window.DeleteAccountModal = DeleteAccountModal;
window.GoodbyeScreen = GoodbyeScreen;
window.RestorePrompt = RestorePrompt;
