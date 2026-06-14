// SendingLoader — the "we're sending invites" loading moment.
// Rotates through brunch-food Pop icons with a gentle bob + cross-fade.
// Sits centered on a card while the host's invites go out.

const FOOD_ROTATION = [
  { Cmp: window.PopEgg,      label: 'Cracking the eggs…' },
  { Cmp: window.PopCalendar, label: 'Holding the date…' },
  { Cmp: window.PopUsers,    label: 'Rounding up your crew…' },
  { Cmp: window.PopShare,    label: 'Sending invites…' },
  { Cmp: window.PopSparkle,  label: 'Adding sprinkles ✨' },
];

const SendingLoader = ({ duration = 5000, onDone, messages = FOOD_ROTATION, autoplay = true }) => {
  const [idx, setIdx] = React.useState(0);

  React.useEffect(() => {
    if (!autoplay) return;
    const step = duration / messages.length;
    const timer = setInterval(() => {
      setIdx((i) => {
        if (i < messages.length - 1) return i + 1;
        clearInterval(timer);
        if (onDone) setTimeout(onDone, 400);
        return i;
      });
    }, step);
    return () => clearInterval(timer);
  }, [duration, autoplay, messages.length]);

  return (
    <div style={{
      position: 'relative', textAlign: 'center',
      padding: '60px 24px', maxWidth: 480, margin: '0 auto',
    }}>
      <style>{`
        @keyframes sl-bob {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-8px); }
        }
        @keyframes sl-pop-in {
          0%   { opacity: 0; transform: scale(0.7); }
          60%  { opacity: 1; transform: scale(1.08); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes sl-progress {
          from { width: 0%; }
          to   { width: 100%; }
        }
      `}</style>

      {/* rotating food badge */}
      <div style={{
        width: 92, height: 92, margin: '0 auto 24px',
        borderRadius: '50%', background: 'var(--accent-soft)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'sl-bob 1.6s ease-in-out infinite',
      }}>
        {messages.map(({ Cmp }, i) => (
          i === idx && Cmp ? (
            <div key={i} style={{ animation: 'sl-pop-in 0.45s var(--ease-spring)' }}>
              <Cmp size={52} />
            </div>
          ) : null
        ))}
      </div>

      <p style={{
        fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 500,
        letterSpacing: '-0.015em', margin: '0 0 24px', minHeight: 30,
        color: 'var(--fg)',
      }}>
        {messages[idx]?.label}
      </p>

      {/* dot progress */}
      <div className="bs-row" style={{ gap: 6, justifyContent: 'center' }}>
        {messages.map((_, i) => (
          <div key={i} style={{
            width: i === idx ? 24 : 6, height: 6,
            borderRadius: 3,
            background: i <= idx ? 'var(--accent-strong)' : 'var(--line)',
            transition: 'all 0.4s var(--ease)',
          }} />
        ))}
      </div>

      <p style={{ marginTop: 28, fontSize: 12.5, color: 'var(--fg-subtle)' }}>
        Don't refresh — almost done.
      </p>
    </div>
  );
};

window.SendingLoader = SendingLoader;
window.FOOD_ROTATION = FOOD_ROTATION;
