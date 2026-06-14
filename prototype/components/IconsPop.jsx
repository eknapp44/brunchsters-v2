// "Pop" icon set — same silhouettes as Icons.jsx, but each ships
// with a tuned filled accent. Used in moments where color earns its
// place: status pills, empty states, success flourishes, primary CTAs.
//
// Palette is an expanded brand set: same chroma (~0.13) as butter-yolk,
// just rotated around the hue wheel so they read as a family. Ships
// as CSS vars so they're one-place tuneable.

const POP_PALETTE_CSS = `
:root {
  --pop-butter:    oklch(0.85 0.135 85);
  --pop-butter-fg: oklch(0.32 0.090 70);
  --pop-tomato:    oklch(0.78 0.140 30);
  --pop-tomato-fg: oklch(0.32 0.090 25);
  --pop-mint:      oklch(0.84 0.110 165);
  --pop-mint-fg:   oklch(0.30 0.075 165);
  --pop-peri:      oklch(0.80 0.110 265);
  --pop-peri-fg:   oklch(0.32 0.075 265);
  --pop-peach:     oklch(0.84 0.115 55);
  --pop-peach-fg:  oklch(0.32 0.085 55);
  --pop-lavender:  oklch(0.82 0.105 310);
  --pop-lavender-fg:oklch(0.32 0.075 310);
}
[data-theme="dark"] {
  --pop-butter:    oklch(0.78 0.150 85);
  --pop-tomato:    oklch(0.72 0.155 30);
  --pop-mint:      oklch(0.76 0.120 165);
  --pop-peri:      oklch(0.74 0.125 265);
  --pop-peach:     oklch(0.78 0.130 55);
  --pop-lavender:  oklch(0.76 0.115 310);
  --pop-butter-fg:    oklch(0.20 0.060 70);
  --pop-tomato-fg:    oklch(0.20 0.060 25);
  --pop-mint-fg:      oklch(0.18 0.050 165);
  --pop-peri-fg:      oklch(0.20 0.050 265);
  --pop-peach-fg:     oklch(0.20 0.060 55);
  --pop-lavender-fg:  oklch(0.20 0.050 310);
}
`;

// Inject palette once.
if (typeof document !== 'undefined' && !document.getElementById('pop-palette')) {
  const s = document.createElement('style');
  s.id = 'pop-palette';
  s.textContent = POP_PALETTE_CSS;
  document.head.appendChild(s);
}

// Wrapper — fill behind, stroke detail on top. Square 24×24,
// rounded so it sits nicely inline with text or as a chip badge.
const PopIcon = ({ children, size = 24, fill = 'var(--pop-butter)', stroke = 'var(--pop-butter-fg)', shape = 'squircle', style, label }) => {
  const radius = shape === 'circle' ? size / 2 : size * 0.28;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         aria-hidden={label ? undefined : "true"}
         role={label ? "img" : undefined}
         aria-label={label}
         focusable="false"
         style={{ display: 'block', flexShrink: 0, ...style }}>
      <rect x="0.5" y="0.5" width="23" height="23" rx={shape === 'circle' ? 11.5 : 6.5}
            fill={fill} stroke="none"/>
      <g stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none">
        {children}
      </g>
    </svg>
  );
};

// Each icon picks a semantic color.
//   calendar  → butter   (date / time-of-day warmth)
//   pin       → tomato   (location / "you are here" pop)
//   users     → mint     (people / fresh)
//   clock     → peri     (cool — when)
//   sparkle   → peach    (delight)
//   check     → mint     (success)
//   share     → lavender (outbound)
//   plus      → butter   (create — primary action)

const PopCalendar = ({ size }) => (
  <PopIcon size={size} fill="var(--pop-butter)" stroke="var(--pop-butter-fg)">
    <rect x="5" y="7" width="14" height="12" rx="1.6"/>
    <path d="M5 11h14M9 5v3M15 5v3"/>
  </PopIcon>
);

const PopPin = ({ size }) => (
  <PopIcon size={size} fill="var(--pop-tomato)" stroke="var(--pop-tomato-fg)">
    <path d="M12 19s5-5.2 5-9a5 5 0 10-10 0c0 3.8 5 9 5 9z"/>
    <circle cx="12" cy="10" r="1.8"/>
  </PopIcon>
);

const PopUsers = ({ size }) => (
  <PopIcon size={size} fill="var(--pop-mint)" stroke="var(--pop-mint-fg)">
    <circle cx="9.5" cy="10" r="2.4"/>
    <path d="M5 18c0-2.4 2-4 4.5-4s4.5 1.6 4.5 4"/>
    <circle cx="16" cy="9" r="1.7"/>
    <path d="M19 16c0-1.6-1-2.9-2.5-3.4"/>
  </PopIcon>
);

const PopClock = ({ size }) => (
  <PopIcon size={size} fill="var(--pop-peri)" stroke="var(--pop-peri-fg)">
    <circle cx="12" cy="12" r="6"/>
    <path d="M12 9v3l2 1.4"/>
  </PopIcon>
);

const PopSparkle = ({ size }) => (
  <PopIcon size={size} fill="var(--pop-peach)" stroke="var(--pop-peach-fg)">
    <path d="M12 6l1.4 3.6L17 11l-3.6 1.4L12 16l-1.4-3.6L7 11l3.6-1.4L12 6z" fill="var(--pop-peach-fg)" stroke="none"/>
  </PopIcon>
);

const PopCheck = ({ size }) => (
  <PopIcon size={size} fill="var(--pop-mint)" stroke="var(--pop-mint-fg)" shape="circle">
    <path d="M7.5 12.2l3 3L17 9" strokeWidth="2"/>
  </PopIcon>
);

const PopShare = ({ size }) => (
  <PopIcon size={size} fill="var(--pop-lavender)" stroke="var(--pop-lavender-fg)">
    <path d="M6 12v5a1.5 1.5 0 001.5 1.5h9A1.5 1.5 0 0018 17v-5"/>
    <path d="M15 8l-3-3-3 3M12 5v10"/>
  </PopIcon>
);

const PopPlus = ({ size }) => (
  <PopIcon size={size} fill="var(--pop-butter)" stroke="var(--pop-butter-fg)" shape="circle">
    <path d="M12 7v10M7 12h10" strokeWidth="2"/>
  </PopIcon>
);

// Egg — bonus, brand-native.
const PopEgg = ({ size }) => (
  <PopIcon size={size} fill="oklch(0.97 0.012 85)" stroke="var(--pop-butter-fg)">
    <ellipse cx="12" cy="12.5" rx="6" ry="7"/>
    <ellipse cx="10.5" cy="11" rx="2.6" ry="2.4" fill="var(--pop-butter)" stroke="none"/>
    <ellipse cx="10.5" cy="11" rx="2.6" ry="2.4"/>
  </PopIcon>
);

Object.assign(window, {
  PopIcon,
  PopCalendar, PopPin, PopUsers, PopClock,
  PopSparkle, PopCheck, PopShare, PopPlus, PopEgg,
});
