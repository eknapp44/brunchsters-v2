import { describe, expect, it } from 'vitest';
import { DEFAULT_CALLBACK_PATH, safeCallbackPath } from './safeCallbackPath';

describe('safeCallbackPath', () => {
  it.each(['/dashboard', '/invite/abc123', '/brunch/b1/manage', '/brunch/new?step=2', '/'])(
    'keeps the path on this site: %s',
    (path) => {
      expect(safeCallbackPath(path)).toBe(path);
    },
  );

  it('trims surrounding whitespace', () => {
    expect(safeCallbackPath('  /invite/abc  ')).toBe('/invite/abc');
  });

  it.each([
    ['an absolute URL', 'https://evil.test/steal'],
    ['a protocol-relative URL', '//evil.test'],
    ['a backslash host', '/\\evil.test'],
    ['a javascript URL', 'javascript:alert(1)'],
    ['a bare host', 'evil.test/path'],
    ['a relative path', 'dashboard'],
    ['an empty string', ''],
    ['a newline smuggled in', '/ok\nhttps://evil.test'],
    ['a tab', '/ok\t//evil.test'],
    ['a NUL', '/ok\u0000'],
  ])('falls back to the dashboard for %s', (_label, value) => {
    expect(safeCallbackPath(value)).toBe(DEFAULT_CALLBACK_PATH);
  });

  it.each([undefined, null, 42, {}, ['/dashboard']])(
    'falls back to the dashboard for a non-string (%s)',
    (value) => {
      expect(safeCallbackPath(value)).toBe(DEFAULT_CALLBACK_PATH);
    },
  );
});
