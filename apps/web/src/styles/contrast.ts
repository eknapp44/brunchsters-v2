// WCAG contrast for the colors in tokens.css, so a token edit that would make text or a control
// hard to see fails a unit test straight away, instead of waiting for a page to render in axe.
// Only oklch() values are understood: that is all tokens.css uses for colors.

type Rgb = readonly [number, number, number];

const OKLCH = /oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/;

// oklch -> linear sRGB, clipped to the gamut (browsers map out-of-gamut colors a little
// differently; axe's reading of the same colors agreed to within 0.01 when this was written).
export function oklchToLinearRgb(value: string): Rgb {
  const match = OKLCH.exec(value);
  if (match === null) throw new Error(`Not an oklch() color: ${value}`);
  const lightness = Number(match[1]);
  const chroma = Number(match[2]);
  const hue = (Number(match[3]) * Math.PI) / 180;
  const a = chroma * Math.cos(hue);
  const b = chroma * Math.sin(hue);

  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;

  const clip = (channel: number): number => Math.min(1, Math.max(0, channel));
  return [
    clip(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    clip(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    clip(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

function luminance([r, g, b]: Rgb): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(params: {
  readonly foreground: string;
  readonly background: string;
}): number {
  const first = luminance(oklchToLinearRgb(params.foreground));
  const second = luminance(oklchToLinearRgb(params.background));
  const [lighter, darker] = first > second ? [first, second] : [second, first];
  return (lighter + 0.05) / (darker + 0.05);
}

export type TokenPalettes = {
  readonly light: ReadonlyMap<string, string>;
  // light with the dark-mode overrides applied, as the browser sees it in dark mode
  readonly dark: ReadonlyMap<string, string>;
};

function declarationsIn(block: string): Map<string, string> {
  const declarations = new Map<string, string>();
  for (const match of block.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    const [, name, value] = match;
    if (name !== undefined && value !== undefined) {
      declarations.set(name, value.replace(/\/\*.*?\*\//g, '').trim());
    }
  }
  return declarations;
}

// Reads the first :root block (light) and the :root block inside the prefers-color-scheme: dark
// media query (the overrides) from tokens.css.
export function readTokenPalettes(css: string): TokenPalettes {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const darkStart = withoutComments.indexOf('@media (prefers-color-scheme: dark)');
  if (darkStart < 0) throw new Error('tokens.css has no prefers-color-scheme: dark block');

  const lightRoot = /:root\s*\{([^}]*)\}/.exec(withoutComments.slice(0, darkStart));
  const darkRoot = /:root\s*\{([^}]*)\}/.exec(withoutComments.slice(darkStart));
  if (lightRoot?.[1] === undefined || darkRoot?.[1] === undefined) {
    throw new Error('Could not find the :root blocks in tokens.css');
  }

  const light = declarationsIn(lightRoot[1]);
  const dark = new Map([...light, ...declarationsIn(darkRoot[1])]);
  return { light, dark };
}
