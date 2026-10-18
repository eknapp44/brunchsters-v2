import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { findStyleViolations } from './findStyleViolations';

const SRC_DIR = fileURLToPath(new URL('..', import.meta.url));

// The only files allowed to define colors and fonts (ADR 0010). The detector and its test
// necessarily mention the patterns they look for.
const ALLOWED = new Set(
  [
    ['styles', 'tokens.css'],
    ['styles', 'findStyleViolations.ts'],
    ['styles', 'styleGuard.test.ts'],
  ].map((parts) => join(...parts)),
);

function listStyledFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listStyledFiles(path);
    return /\.(css|tsx?)$/.test(entry.name) ? [path] : [];
  });
}

describe('style guard: the look is defined only in tokens.css', () => {
  it('finds no color literal or font-family outside the tokens file', () => {
    const offences = listStyledFiles(SRC_DIR)
      .filter((path) => !ALLOWED.has(relative(SRC_DIR, path)))
      .flatMap((path) =>
        findStyleViolations(readFileSync(path, 'utf8')).map(
          (violation) =>
            `${relative(SRC_DIR, path).split(sep).join('/')}:${violation.line} ${violation.rule}: ${violation.text}`,
        ),
      );

    expect(offences).toEqual([]);
  });

  it('actually scans the source tree (the guard is not passing on an empty list)', () => {
    const scanned = listStyledFiles(SRC_DIR).map((path) => relative(SRC_DIR, path));
    expect(scanned).toContain(join('styles', 'global.css'));
    expect(scanned).toContain(join('app', 'layout.tsx'));
  });
});

describe('findStyleViolations', () => {
  const rulesFor = (source: string) => findStyleViolations(source).map((v) => v.rule);

  it.each([
    ['a hex color', '.a { color: #fc8; }', 'hex color'],
    ['a long hex color', '.a { background: #ffcc88aa; }', 'hex color'],
    ['rgb()', '.a { color: rgb(0 0 0); }', 'color function'],
    ['oklch()', '.a { color: oklch(0.5 0.1 70); }', 'color function'],
    ['a named color', '.a { color: white; }', 'named color'],
    ['a named color in a border', '.a { border: 1px solid red; }', 'named color'],
    ['a font-family', ".a { font-family: 'Comic Sans MS'; }", 'font-family'],
    ['fontFamily in code', "const s = { fontFamily: 'serif' };", 'fontFamily in code'],
    ['an inline color style', '<p style={{ color: "var(--fg)" }} />', 'inline color style'],
  ])('catches %s', (_name, source, rule) => {
    expect(rulesFor(source)).toContain(rule);
  });

  it.each([
    ['a token', '.a { color: var(--fg); background: var(--surface); }'],
    ['a font token', '.a { font-family: var(--font-sans); }'],
    ['transparent and currentColor', '.a { border-color: transparent; fill: currentColor; }'],
    ['an in-page link', '<a href="#main-content">Skip</a>'],
    ['a color word in a class name', '.white-space { margin: 0; }'],
    ['a color mentioned in a comment', '/* was #fc8 and white */ .a { margin: 0; }'],
    ['a layout inline style', '<div style={{ gridTemplateColumns: "1fr 1fr" }} />'],
  ])('allows %s', (_name, source) => {
    expect(findStyleViolations(source)).toEqual([]);
  });

  it('reports the line number of the offence', () => {
    const violations = findStyleViolations('.a { margin: 0; }\n\n.b { color: #fff; }');
    expect(violations).toEqual([{ rule: 'hex color', line: 3, text: '.b { color: #fff; }' }]);
  });
});
