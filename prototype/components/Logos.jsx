// Two logo/wordmark directions for Brunchsters.
// Both lean on display serif (Fraunces) — feels editorial + warm,
// fits the "modern minimal-utility with fun accents" brief without going maximalist.

const LogoMarkA = ({ size = 40 }) => (
  // A0 — original "sunny side": perfect circle + concentric yolk.
  // Reads as bullseye/target as much as egg. Kept for reference.
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
    <circle cx="20" cy="20" r="18" stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.35"/>
    <circle cx="20" cy="20" r="7.5" fill="var(--accent-strong)"/>
  </svg>
);

// A1 — same circle white, but yolk shifted up-and-left.
// Cheapest fix: asymmetry alone reads "egg" (target needs concentricity).
const LogoMarkA1 = ({ size = 40 }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
    <circle cx="20" cy="20" r="18" stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.35"/>
    <circle cx="16.5" cy="16.5" r="7" fill="var(--accent-strong)"/>
  </svg>
);

// A2 — soft ellipse white (taller than wide) + off-center yolk.
// Geometrically still primitive but unmistakably egg-shaped.
const LogoMarkA2 = ({ size = 40 }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
    <ellipse cx="20" cy="20" rx="15" ry="18" stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.35"/>
    <ellipse cx="17" cy="17" rx="6.5" ry="6" fill="var(--accent-strong)"/>
  </svg>
);

// A3 — irregular blob white (the "real" fried egg) + off-center yolk.
// Most egg-like; warmer / more illustrative — pushes brand a touch friendlier.
const LogoMarkA3 = ({ size = 40 }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
    <path
      d="M20 3.5
         C 27 3.5, 33 7, 35.5 13
         C 38 19, 36.5 26, 32 30
         C 28 33.5, 23 35.5, 17.5 35
         C 11 34.4, 5.5 30, 4 24
         C 2.8 19, 5 12.5, 10 8
         C 13 5.2, 16.5 3.5, 20 3.5 Z"
      stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.35"
      strokeLinejoin="round"
    />
    <ellipse cx="16.5" cy="16" rx="6.8" ry="6.2" fill="var(--accent-strong)"/>
  </svg>
);

// A4 — two yolks stacked vertically, left-of-center → reads as a capital B's bumps.
// Equal-sized, tight gap. Most explicit "B" reading.
const LogoMarkA4 = ({ size = 40 }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
    <ellipse cx="20" cy="20" rx="15" ry="18" stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.35"/>
    <circle cx="15.5" cy="14.5" r="4.6" fill="var(--accent-strong)"/>
    <circle cx="15.5" cy="24.5" r="4.6" fill="var(--accent-strong)"/>
  </svg>
);

// A5 — double-yolk laid out to read as a capital B:
// a thin vertical "spine" near the left of the egg + two yolks bulging
// out to the right (smaller top bump, larger lower bump, like a real B).
const LogoMarkA5 = ({ size = 40 }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
    <ellipse cx="20" cy="20" rx="15" ry="18" stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.35"/>
    {/* spine — sits where a B's vertical stroke would */}
    <rect x="13.6" y="9" width="2" height="22" rx="1" fill="var(--accent-strong)"/>
    {/* upper bump — smaller */}
    <circle cx="22"   cy="14.5" r="4.4" fill="var(--accent-strong)"/>
    {/* lower bump — larger, like a real B */}
    <circle cx="22.5" cy="25"   r="5.1" fill="var(--accent-strong)"/>
  </svg>
);

const LogoMarkB = ({ size = 40 }) => (
  // The "B-cup" mark — letter B as a coffee cup silhouette.
  // Geometric. Pairs with the wordmark for a more identity-forward lockup.
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
    <rect x="2" y="2" width="36" height="36" rx="10" fill="var(--accent-strong)"/>
    <path d="M14 11h8.5a4.5 4.5 0 010 9H14V11z" stroke="var(--accent-fg)" strokeWidth="1.6" fill="none"/>
    <path d="M14 20h9.5a4.5 4.5 0 010 9H14v-9z" stroke="var(--accent-fg)" strokeWidth="1.6" fill="none"/>
  </svg>
);

const MARKS = { a: LogoMarkA, a1: LogoMarkA1, a2: LogoMarkA2, a3: LogoMarkA3, a4: LogoMarkA4, a5: LogoMarkA5, b: LogoMarkB };

// A2 is the canonical mark across the app; legacy variants stay available for the gallery.
const Wordmark = ({ size = 'md', mark = 'a5' }) => {
  const cls = size === 'lg' ? 'bs-wordmark lg' : size === 'xl' ? 'bs-wordmark xl' : 'bs-wordmark';
  const Mark = MARKS[mark] || LogoMarkA;
  const markSize = size === 'xl' ? 56 : size === 'lg' ? 40 : 28;
  return (
    <span className={cls}>
      <Mark size={markSize} />
      <span>brunchsters</span>
    </span>
  );
};

// Minimal wordmark only — no mark
const WordmarkOnly = ({ size = 'md' }) => {
  const cls = size === 'lg' ? 'bs-wordmark lg' : size === 'xl' ? 'bs-wordmark xl' : 'bs-wordmark';
  return (
    <span className={cls}>
      <span className="dot"></span>
      <span>brunchsters</span>
    </span>
  );
};

window.LogoMarkA = LogoMarkA;
window.LogoMarkA1 = LogoMarkA1;
window.LogoMarkA2 = LogoMarkA2;
window.LogoMarkA3 = LogoMarkA3;
window.LogoMarkA4 = LogoMarkA4;
window.LogoMarkA5 = LogoMarkA5;
window.LogoMarkB = LogoMarkB;
window.Wordmark = Wordmark;
window.WordmarkOnly = WordmarkOnly;
