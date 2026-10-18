// The rules behind styleGuard.test.ts (ADR 0010): the look is defined once, in tokens.css, so
// no other file may carry a color literal or choose a font family. Kept apart from the test so
// the test can also show the detector catches each kind of violation.

export type StyleViolation = {
  readonly rule: string;
  readonly line: number;
  readonly text: string;
};

const NAMED_COLORS = [
  'white',
  'black',
  'red',
  'green',
  'blue',
  'yellow',
  'orange',
  'purple',
  'pink',
  'brown',
  'gray',
  'grey',
  'silver',
  'gold',
  'navy',
  'teal',
  'maroon',
  'cyan',
  'magenta',
  'beige',
  'ivory',
];

const COLOR_PROPERTIES =
  '(?:color|background|background-color|border|border-color|border-top|border-right|border-bottom|border-left|outline|outline-color|fill|stroke|box-shadow|text-shadow)';

const RULES: readonly { readonly rule: string; readonly pattern: RegExp }[] = [
  {
    rule: 'hex color',
    pattern: /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/,
  },
  {
    rule: 'color function',
    pattern: /\b(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch)\(/,
  },
  {
    // Property and color names must stand alone: `--pop-fill: var(--art-egg-white)` defines a
    // token, it is not a property named `fill` set to the color white.
    rule: 'named color',
    pattern: new RegExp(
      `(?<![\\w-])${COLOR_PROPERTIES}\\s*:[^;{}]*(?<![\\w-])(?:${NAMED_COLORS.join('|')})(?![\\w-])`,
      'i',
    ),
  },
  // A family is chosen once, in tokens.css; elsewhere only `var(--font-…)` is allowed.
  { rule: 'font-family', pattern: /\bfont-family\s*:(?!\s*var\()/i },
  { rule: 'fontFamily in code', pattern: /\bfontFamily\b/ },
  {
    rule: 'inline color style',
    pattern: /style=\{\{[^}]*\b(?:color|background|backgroundColor|borderColor|fill|stroke)\b/,
  },
];

// Block comments are removed first so a note that mentions a color does not trip the guard.
// Line numbers are kept by leaving the newlines in place.
function stripBlockComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '));
}

export function findStyleViolations(source: string): readonly StyleViolation[] {
  const violations: StyleViolation[] = [];
  const lines = stripBlockComments(source).split('\n');

  lines.forEach((text, index) => {
    for (const { rule, pattern } of RULES) {
      if (pattern.test(text)) {
        violations.push({ rule, line: index + 1, text: text.trim() });
      }
    }
  });

  return violations;
}
