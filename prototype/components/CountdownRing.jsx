// CountdownRing — tiny SVG ring that fills as a deadline approaches.
// Goes amber when <24h remain. Sits inline with text or pills.
//
// Props: hoursTotal (window length), hoursLeft (remaining), size, label (optional)

const CountdownRing = ({ hoursTotal = 96, hoursLeft = 48, size = 18, strokeWidth = 2.4 }) => {
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  // "filled" = how much of the window has elapsed
  const elapsed = Math.max(0, Math.min(1, 1 - hoursLeft / hoursTotal));
  const dash = c * elapsed;

  // amber when <24h, ok otherwise
  const urgent = hoursLeft <= 24;
  const color = urgent ? 'var(--pop-tomato, oklch(0.78 0.140 30))' : 'var(--accent-strong)';
  const trackColor = 'var(--line)';

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          aria-hidden="true">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block' }}
           focusable="false">
        <circle cx={size / 2} cy={size / 2} r={r}
                fill="none" stroke={trackColor} strokeWidth={strokeWidth} />
        <circle cx={size / 2} cy={size / 2} r={r}
                fill="none" stroke={color} strokeWidth={strokeWidth}
                strokeDasharray={`${dash} ${c}`}
                strokeLinecap="round"
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
                style={{ transition: 'stroke-dasharray 0.6s var(--ease)' }} />
      </svg>
    </span>
  );
};

// Format helper — "2d 4h", "14h", "47m" etc.
const formatCountdown = (hoursLeft) => {
  if (hoursLeft >= 48) return `${Math.floor(hoursLeft / 24)}d ${Math.round(hoursLeft % 24)}h`;
  if (hoursLeft >= 24) return `1d ${Math.round(hoursLeft - 24)}h`;
  if (hoursLeft >= 1)  return `${Math.round(hoursLeft)}h`;
  return `${Math.round(hoursLeft * 60)}m`;
};

window.CountdownRing = CountdownRing;
window.formatCountdown = formatCountdown;
