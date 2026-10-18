import type { ReactElement, ReactNode } from 'react';
import styles from './icons.module.css';

// The "Pop" set from the prototype's IconsPop.jsx: the same silhouettes as the line icons on a
// colored tile, for moments where color earns its place (cards, empty states, confirmations).
// Colors come from the Pop palette in tokens.css. Decorative, like every icon here.
type Tone = 'butter' | 'tomato' | 'mint' | 'peri' | 'egg';
type Glyph = { readonly tone: Tone; readonly round?: boolean; readonly detail: ReactNode };

const GLYPHS = {
  calendar: {
    tone: 'butter',
    detail: (
      <>
        <rect x="5" y="7" width="14" height="12" rx="1.6" />
        <path d="M5 11h14M9 5v3M15 5v3" />
      </>
    ),
  },
  pin: {
    tone: 'tomato',
    detail: (
      <>
        <path d="M12 19s5-5.2 5-9a5 5 0 10-10 0c0 3.8 5 9 5 9z" />
        <circle cx="12" cy="10" r="1.8" />
      </>
    ),
  },
  users: {
    tone: 'mint',
    detail: (
      <>
        <circle cx="9.5" cy="10" r="2.4" />
        <path d="M5 18c0-2.4 2-4 4.5-4s4.5 1.6 4.5 4" />
        <circle cx="16" cy="9" r="1.7" />
        <path d="M19 16c0-1.6-1-2.9-2.5-3.4" />
      </>
    ),
  },
  clock: {
    tone: 'peri',
    detail: (
      <>
        <circle cx="12" cy="12" r="6" />
        <path d="M12 9v3l2 1.4" />
      </>
    ),
  },
  check: {
    tone: 'mint',
    round: true,
    detail: <path d="M7.5 12.2l3 3L17 9" strokeWidth="2" />,
  },
  plus: {
    tone: 'butter',
    round: true,
    detail: <path d="M12 7v10M7 12h10" strokeWidth="2" />,
  },
  egg: {
    tone: 'egg',
    detail: (
      <>
        <ellipse cx="12" cy="12.5" rx="6" ry="7" />
        <ellipse className={styles.yolk} cx="10.5" cy="11" rx="2.6" ry="2.4" />
        <ellipse cx="10.5" cy="11" rx="2.6" ry="2.4" />
      </>
    ),
  },
} as const satisfies Record<string, Glyph>;

export type PopIconName = keyof typeof GLYPHS;

export function PopIcon(props: {
  readonly name: PopIconName;
  readonly size?: number;
}): ReactElement {
  const size = props.size ?? 24;
  const glyph: Glyph = GLYPHS[props.name];
  return (
    <svg
      className={`${styles.pop} ${styles[glyph.tone]}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <rect
        className={styles.tile}
        x="0.5"
        y="0.5"
        width="23"
        height="23"
        rx={glyph.round === true ? 11.5 : 6.5}
      />
      <g className={styles.detail}>{glyph.detail}</g>
    </svg>
  );
}
