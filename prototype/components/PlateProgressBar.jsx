// PlateProgressBar — replacement for the wizard's pip ProgressBar.
// "Medium commitment" breakfast metaphor:
//   - 4 Pop icons in a row: egg → plate → coffee → friends
//   - a thin warm bar grows behind them as steps complete
//
// Less twee than full illustrated scenes, more brand-rich than dots.

const PlateMilestoneIcon = ({ kind, active, done, size = 24 }) => {
  // tone: full-color when reached, muted+stroke-only when ahead
  const opacity = done ? 1 : active ? 1 : 0.35;
  const filter = (done || active) ? 'none' : 'saturate(0.2)';

  // Pop icons unless ahead — then we render a small stroke icon to keep the
  // composition quiet. Icons selected to feel like the "table state":
  //   step 0: egg (cooking starts) — PopEgg
  //   step 1: pin (where) — PopPin
  //   step 2: clock (when) — PopClock
  //   step 3: users (who) — PopUsers
  const Cmp = {
    egg: window.PopEgg,
    pin: window.PopPin,
    clock: window.PopClock,
    users: window.PopUsers,
  }[kind];

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      opacity, filter, transition: 'opacity 0.3s var(--ease), filter 0.3s var(--ease)',
    }}>
      {Cmp ? <Cmp size={size} /> : null}
    </span>
  );
};

const PlateProgressBar = ({ step, total = 4, labels = ['Title', 'Where', 'When', 'Who'], kinds = ['egg', 'pin', 'clock', 'users'] }) => {
  // bar fill: how far through total the user is (0 → 1)
  // Use (step + 0.5) so being on step 0 already shows a tiny sliver of progress.
  const pct = Math.max(0, Math.min(1, (step + 0.5) / total));

  return (
    <div className="ppb-wrap"
         role="progressbar"
         aria-valuemin="0"
         aria-valuemax={total}
         aria-valuenow={step + 1}
         aria-label={`Step ${step + 1} of ${total}: ${labels[step]}`}
         style={{ position: 'relative', padding: '8px 0 6px', marginBottom: 28 }}>
      {/* track + fill bar */}
      <div aria-hidden="true" style={{
        position: 'absolute', left: 18, right: 18, top: '50%',
        height: 8, transform: 'translateY(-50%)',
        background: 'var(--surface-2)',
        borderRadius: 'var(--r-pill)',
        overflow: 'hidden',
        border: '1px solid var(--line-soft)',
      }}>
        <div style={{
          width: `${pct * 100}%`, height: '100%',
          background: 'linear-gradient(90deg, var(--accent-soft) 0%, var(--accent) 100%)',
          transition: 'width 0.5s var(--ease)',
        }} />
      </div>

      {/* milestones */}
      <div className="bs-row" style={{
        position: 'relative', justifyContent: 'space-between',
        padding: '0 4px',
      }}>
        {labels.map((label, i) => {
          const done = i < step;
          const active = i === step;
          return (
            <div key={i} className="bs-col" style={{
              alignItems: 'center', gap: 6,
              transform: active ? 'scale(1.06)' : 'none',
              transition: 'transform 0.25s var(--ease-spring)',
            }}>
              {/* circular plate behind icon — gives icon something to sit on, hides bar */}
              <div style={{
                width: 36, height: 36, borderRadius: '50%',
                background: 'var(--bg)',
                border: `1.5px solid ${done || active ? 'var(--accent-strong)' : 'var(--line)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: active ? '0 4px 14px -6px var(--accent-strong)' : 'none',
                transition: 'border-color 0.25s var(--ease), box-shadow 0.25s var(--ease)',
              }}>
                <PlateMilestoneIcon kind={kinds[i]} active={active} done={done} size={22} />
              </div>
              <span style={{
                fontSize: 11, fontWeight: 500,
                color: active ? 'var(--fg)' : done ? 'var(--fg-muted)' : 'var(--fg-subtle)',
                letterSpacing: '0.02em',
                transition: 'color 0.25s var(--ease)',
              }}>{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

window.PlateProgressBar = PlateProgressBar;
window.PlateMilestoneIcon = PlateMilestoneIcon;
