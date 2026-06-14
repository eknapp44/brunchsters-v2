// FirstBrunchCoach — teaching moment that fires once, after the user sends
// their very first brunch. Shows on top of the dashboard right after the
// SuccessScreen flow. Three pointers: where to watch RSVPs, what the inbox
// is, what happens when voting closes.
//
// Pattern: bottom-anchored card (mobile) / center modal (desktop) — NOT inline
// coachmarks because those date badly + cover content. One card, dismissible.

const FirstBrunchCoach = ({ open, onDismiss }) => {
  const [step, setStep] = React.useState(0);
  if (!open) return null;

  const steps = [
    {
      icon: <window.PopUsers size={40} />,
      title: "Your first brunch is on the table 🥂",
      body: "Quick tour while we wait for the gang to RSVP — three things, 20 seconds.",
      cta: "Let's go",
    },
    {
      icon: <window.PopCalendar size={40} />,
      title: "Watch RSVPs roll in from the dashboard",
      body: "Your brunch is the hero card up top. We'll show who's in, who's maybe, and who hasn't said yet — refresh-free.",
      cta: "Got it",
    },
    {
      icon: <window.PopSparkle size={40} />,
      title: "Inbox catches everything else",
      body: "Vote results, RSVP changes, reminders. Tap the Inbox tab when the dot lights up. We'll ping you for the moments that matter.",
      cta: "Got it",
    },
    {
      icon: <window.PopClock size={40} />,
      title: "Voting wraps automatically",
      body: "If you added more than one spot or time, the gang votes. We close voting when everyone's in, or you can call it early. You're never blocked.",
      cta: "Cool — show me",
    },
  ];

  const s = steps[step];
  const isLast = step === steps.length - 1;
  const isFirst = step === 0;

  return (
    <div style={{
      position: 'fixed', left: 0, right: 0, bottom: 0,
      zIndex: 100, padding: 16,
      display: 'flex', justifyContent: 'center',
      pointerEvents: 'none',
    }}>
      <div style={{
        pointerEvents: 'auto',
        background: 'var(--surface)',
        borderRadius: 'var(--r-3)',
        boxShadow: '0 24px 60px -12px oklch(0.20 0.01 70 / 0.30)',
        border: '1px solid var(--line)',
        padding: '20px 22px 18px',
        maxWidth: 460, width: '100%',
        animation: 'fbc-rise 0.32s var(--ease-spring)',
      }}>
        <div className="bs-row" style={{ gap: 14, marginBottom: 10, alignItems: 'flex-start' }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: 'var(--accent-soft)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            {s.icon}
          </div>
          <div style={{ flex: 1, paddingTop: 2 }}>
            <h3 style={{
              fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 500,
              letterSpacing: '-0.01em', margin: '0 0 4px', lineHeight: 1.3,
            }}>
              {s.title}
            </h3>
            <p style={{ fontSize: 13.5, color: 'var(--fg-muted)', margin: 0, lineHeight: 1.5 }}>
              {s.body}
            </p>
          </div>
          <button onClick={onDismiss} aria-label="Dismiss tour"
                  style={{ background: 'transparent', border: 0,
                            color: 'var(--fg-subtle)', padding: 4,
                            cursor: 'pointer', flexShrink: 0 }}>
            <window.IconClose size={18} />
          </button>
        </div>

        <div className="bs-row" style={{ gap: 12, marginTop: 14, alignItems: 'center' }}>
          {/* Step dots */}
          <div className="bs-row" style={{ gap: 5 }}>
            {steps.map((_, i) => (
              <div key={i} style={{
                width: i === step ? 18 : 5, height: 5,
                borderRadius: 3,
                background: i <= step ? 'var(--accent-strong)' : 'var(--line)',
                transition: 'all 0.3s var(--ease)',
              }} />
            ))}
          </div>
          <span className="bs-spacer" />
          {!isFirst && (
            <button className="bs-btn ghost sm" onClick={() => setStep(step - 1)}>
              Back
            </button>
          )}
          <button className="bs-btn primary" onClick={() => isLast ? onDismiss() : setStep(step + 1)}>
            <span>{s.cta}</span>
            {!isLast && <window.IconArrowRight size={16} />}
          </button>
        </div>
      </div>
      <style>{`
        @keyframes fbc-rise {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

window.FirstBrunchCoach = FirstBrunchCoach;
