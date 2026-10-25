import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { contrastRatio, readTokenPalettes } from './contrast';

const palettes = readTokenPalettes(
  readFileSync(fileURLToPath(new URL('./tokens.css', import.meta.url)), 'utf8'),
);

// Foreground-on-background pairs the app actually draws, and the WCAG 2.1 AA ratio each needs:
// 4.5 for text, 3 for large text, icons and the boundary of a control (1.4.11). When a token
// edit breaks one, change the token or, if the pair is no longer used, remove it here.
const TEXT = 4.5;
const GRAPHIC = 3;

const PAIRS: readonly {
  readonly foreground: string;
  readonly background: string;
  readonly needs: number;
  readonly what: string;
}[] = [
  { foreground: 'fg', background: 'bg', needs: TEXT, what: 'body text on the page' },
  { foreground: 'fg', background: 'surface', needs: TEXT, what: 'text on a card' },
  { foreground: 'fg-muted', background: 'bg', needs: TEXT, what: 'secondary text on the page' },
  { foreground: 'fg-muted', background: 'surface', needs: TEXT, what: 'secondary text on a card' },
  { foreground: 'fg', background: 'surface-2', needs: TEXT, what: 'a title in a past brunch row' },
  {
    foreground: 'fg-muted',
    background: 'surface-2',
    needs: TEXT,
    what: 'text on a hovered row or badge',
  },
  {
    foreground: 'accent-fg',
    background: 'accent-strong',
    needs: TEXT,
    what: 'primary button label',
  },
  { foreground: 'accent-fg', background: 'accent', needs: TEXT, what: 'the bell count' },
  {
    foreground: 'accent-soft-fg',
    background: 'accent-soft',
    needs: TEXT,
    what: 'accent badge and hint',
  },
  { foreground: 'mint-fg', background: 'mint', needs: TEXT, what: 'confirmed badge' },
  { foreground: 'fg', background: 'danger-soft', needs: TEXT, what: 'text in an error message' },
  { foreground: 'fg', background: 'accent-soft', needs: TEXT, what: 'text on the gradient pages' },
  { foreground: 'fg', background: 'wash-a', needs: TEXT, what: 'text on the warm page wash' },
  { foreground: 'fg', background: 'wash-b', needs: TEXT, what: 'text on the cooler page wash' },
  {
    foreground: 'fg-muted',
    background: 'wash-a',
    needs: TEXT,
    what: 'secondary text on the warm page wash',
  },
  {
    foreground: 'fg-muted',
    background: 'wash-b',
    needs: TEXT,
    what: 'secondary text on the cooler page wash',
  },
  {
    foreground: 'fg-muted',
    background: 'surface-3',
    needs: TEXT,
    what: 'a date tile with no date, or a past one',
  },
  { foreground: 'fg', background: 'bar', needs: TEXT, what: 'a place name over a vote bar' },
  {
    foreground: 'fg-muted',
    background: 'bar',
    needs: TEXT,
    what: 'an address over a vote bar',
  },
  // Initials are small text, so each avatar color is held to the text ratio, not the icon one.
  {
    foreground: 'pop-butter-fg',
    background: 'pop-butter',
    needs: TEXT,
    what: 'initials on an avatar (butter)',
  },
  {
    foreground: 'pop-tomato-fg',
    background: 'pop-tomato',
    needs: TEXT,
    what: 'initials on an avatar (tomato)',
  },
  {
    foreground: 'pop-mint-fg',
    background: 'pop-mint',
    needs: TEXT,
    what: 'initials on an avatar (mint)',
  },
  {
    foreground: 'pop-peri-fg',
    background: 'pop-peri',
    needs: TEXT,
    what: 'initials on an avatar (periwinkle)',
  },
  {
    foreground: 'pop-peach-fg',
    background: 'pop-peach',
    needs: TEXT,
    what: 'initials on an avatar (peach)',
  },
  {
    foreground: 'pop-lavender-fg',
    background: 'pop-lavender',
    needs: TEXT,
    what: 'initials on an avatar (lavender)',
  },
  {
    foreground: 'control-border',
    background: 'surface',
    needs: GRAPHIC,
    what: 'form control border',
  },
  {
    foreground: 'control-border',
    background: 'bg',
    needs: GRAPHIC,
    what: 'form control against the page',
  },
  {
    foreground: 'pop-butter-fg',
    background: 'pop-butter',
    needs: GRAPHIC,
    what: 'Pop icon (butter)',
  },
  {
    foreground: 'pop-tomato-fg',
    background: 'pop-tomato',
    needs: GRAPHIC,
    what: 'Pop icon (tomato)',
  },
  { foreground: 'pop-mint-fg', background: 'pop-mint', needs: GRAPHIC, what: 'Pop icon (mint)' },
  {
    foreground: 'pop-peri-fg',
    background: 'pop-peri',
    needs: GRAPHIC,
    what: 'Pop icon (periwinkle)',
  },
];

describe.each(['light', 'dark'] as const)('token contrast, %s palette', (mode) => {
  const palette = palettes[mode];

  it.each(PAIRS)('$what: $foreground on $background needs $needs:1', (pair) => {
    const foreground = palette.get(pair.foreground);
    const background = palette.get(pair.background);
    expect(foreground, `--${pair.foreground} is defined`).toBeDefined();
    expect(background, `--${pair.background} is defined`).toBeDefined();

    const ratio = contrastRatio({
      foreground: foreground ?? '',
      background: background ?? '',
    });
    expect(ratio, `${pair.what} (${mode}): ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(
      pair.needs,
    );
  });
});

describe('contrastRatio', () => {
  it('is 21:1 for black on white and symmetric', () => {
    const black = 'oklch(0 0 0)';
    const white = 'oklch(1 0 0)';
    expect(contrastRatio({ foreground: black, background: white })).toBeCloseTo(21, 0);
    expect(contrastRatio({ foreground: white, background: black })).toBeCloseTo(21, 0);
  });

  it('reproduces the 1.55:1 axe reported for dark accent-fg on accent-soft', () => {
    // The M3 finding: this pair was dark text on a dark background.
    const ratio = contrastRatio({
      foreground: 'oklch(0.205 0.08 60)',
      background: 'oklch(0.345 0.06 78)',
    });
    expect(ratio).toBeGreaterThan(1.5);
    expect(ratio).toBeLessThan(1.6);
  });

  it('refuses a color it cannot read', () => {
    expect(() => contrastRatio({ foreground: '#fff', background: 'oklch(0 0 0)' })).toThrow();
  });
});
