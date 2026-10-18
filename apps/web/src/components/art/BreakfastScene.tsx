import type { ReactElement } from 'react';
import styles from './BreakfastScene.module.css';

// The empty-dashboard illustration (the prototype's BreakfastScene): a table set for brunch with
// empty chairs, waiting for friends. Flat geometric shapes; every color is a token (--art-*),
// so it follows light and dark and can be recolored in tokens.css. Decorative: the text beside
// it says what to do.
export function BreakfastScene(): ReactElement {
  return (
    <svg
      className={styles.scene}
      viewBox="0 0 520 320"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <radialGradient id="breakfast-spot" cx="50%" cy="40%" r="60%">
          <stop className={styles.spotStop} offset="0%" stopOpacity="0.9" />
          <stop className={styles.spotStop} offset="100%" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="breakfast-table" x1="0" x2="0" y1="0" y2="1">
          <stop className={styles.tableTopStop} offset="0%" />
          <stop className={styles.tableBottomStop} offset="100%" />
        </linearGradient>
      </defs>

      <ellipse cx="260" cy="140" rx="240" ry="140" fill="url(#breakfast-spot)" />

      <path
        className={styles.table}
        d="M 30 230 L 490 230 L 510 290 L 10 290 Z"
        fill="url(#breakfast-table)"
      />

      <g className={styles.farChair}>
        <rect className={styles.chair} x="64" y="124" width="42" height="78" rx="4" />
        <rect className={styles.chairPart} x="68" y="190" width="34" height="12" rx="2" />
        <rect className={styles.chairPart} x="72" y="200" width="4" height="32" />
        <rect className={styles.chairPart} x="94" y="200" width="4" height="32" />
      </g>
      <g className={styles.farChair}>
        <rect className={styles.chair} x="412" y="124" width="42" height="78" rx="4" />
        <rect className={styles.chairPart} x="416" y="190" width="34" height="12" rx="2" />
        <rect className={styles.chairPart} x="420" y="200" width="4" height="32" />
        <rect className={styles.chairPart} x="442" y="200" width="4" height="32" />
      </g>

      <ellipse className={styles.mat} cx="260" cy="232" rx="120" ry="20" />
      <ellipse className={styles.plate} cx="260" cy="220" rx="84" ry="18" />
      <ellipse className={styles.plateInner} cx="260" cy="216" rx="68" ry="13" />

      <g transform="translate(260 215)">
        <ellipse className={styles.eggWhite} cx="0" cy="0" rx="40" ry="8" />
        <ellipse className={styles.yolk} cx="-6" cy="-1" rx="10" ry="3" />
      </g>

      <g transform="translate(160 200)">
        <ellipse className={styles.saucer} cx="0" cy="22" rx="34" ry="6" />
        <path className={styles.cup} d="M -22 0 Q -22 18 -16 22 L 16 22 Q 22 18 22 0 Z" />
        <ellipse className={styles.coffee} cx="0" cy="0" rx="22" ry="5" />
        <path className={styles.handle} d="M 22 4 Q 30 4 30 12 Q 30 18 22 17" />
        <path className={styles.steam} opacity="0.55" d="M -6 -8 Q -8 -16 -4 -22 Q 0 -28 -2 -36" />
        <path className={styles.steam} opacity="0.45" d="M 6 -10 Q 10 -16 6 -24 Q 2 -30 6 -38" />
      </g>

      <g transform="translate(360 200)">
        <path
          className={styles.glass}
          d="M -12 0 L -10 22 Q -10 25 -7 25 L 7 25 Q 10 25 10 22 L 12 0 Z"
        />
        <path
          className={styles.juice}
          d="M -11 4 L -9 22 Q -9 24 -6 24 L 6 24 Q 9 24 9 22 L 11 4 Z"
        />
      </g>

      <g className={styles.fork} transform="translate(126 230) rotate(-8)">
        <line x1="0" y1="0" x2="0" y2="-30" />
        <line x1="-4" y1="-30" x2="-4" y2="-44" />
        <line x1="0" y1="-30" x2="0" y2="-44" />
        <line x1="4" y1="-30" x2="4" y2="-44" />
        <path d="M -6 -28 Q 0 -22 6 -28" />
      </g>

      <g className={styles.sparkle} transform="translate(85 88)" opacity="0.85">
        <path d="M 0 -8 L 1.6 -1.6 L 8 0 L 1.6 1.6 L 0 8 L -1.6 1.6 L -8 0 L -1.6 -1.6 Z" />
      </g>
      <g className={styles.sparkle} transform="translate(434 96)" opacity="0.6">
        <path d="M 0 -5 L 1 -1 L 5 0 L 1 1 L 0 5 L -1 1 L -5 0 L -1 -1 Z" />
      </g>
    </svg>
  );
}
