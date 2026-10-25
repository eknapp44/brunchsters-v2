import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { findBannedWords } from './findBannedWords';

const SRC_DIR = fileURLToPath(new URL('..', import.meta.url));

// Everything a person reads is in a copy module (`lib/*Copy.ts`) or in the screens and components
// (`app/**/*.tsx` pages and client components, `components/**/*.tsx`). Tests, the style guard's
// detector and this detector are not read by anyone.
function listCopyFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listCopyFiles(path);
    if (/\.test\.tsx?$/.test(entry.name)) return [];
    const rel = relative(SRC_DIR, path).split(sep).join('/');
    const isCopyModule = /^lib\/[A-Za-z]*Copy\.ts$/.test(rel);
    const isScreen = /^(app|components)\/.*\.tsx$/.test(rel);
    return isCopyModule || isScreen ? [path] : [];
  });
}

// Whole strings (never words) that are not read by a person but contain a banned word. Each needs
// a reason. Keep it short: a word that a person reads is changed, not allowed.
const ALLOWED_STRINGS: readonly string[] = [];

describe('voice: no corporate words in what people read (docs/voice-and-copy.md, rule 4)', () => {
  it('finds none in the copy modules, screens and components', () => {
    const offences = listCopyFiles(SRC_DIR).flatMap((path) =>
      findBannedWords({
        source: readFileSync(path, 'utf8'),
        fileName: path,
        allowedStrings: ALLOWED_STRINGS,
      }).map(
        (finding) =>
          `${relative(SRC_DIR, path).split(sep).join('/')}:${finding.line} "${finding.word}" in "${finding.text}"`,
      ),
    );

    // The message says what to do: reword it in the voice (docs/voice-and-copy.md), or, for a
    // string no person reads, add the whole string to ALLOWED_STRINGS with a reason.
    expect(offences).toEqual([]);
  });

  it('actually scans the copy modules and the screens (the test is not passing on an empty list)', () => {
    const scanned = listCopyFiles(SRC_DIR).map((path) =>
      relative(SRC_DIR, path).split(sep).join('/'),
    );
    expect(scanned).toContain('lib/lifecycleCopy.ts');
    expect(scanned).toContain('lib/limitedCopy.ts');
    expect(scanned).toContain('lib/brunchCopy.ts');
    expect(scanned).toContain('lib/errorCopy.ts');
    expect(scanned.some((path) => path.startsWith('components/ui/'))).toBe(true);
    expect(scanned.some((path) => path.endsWith('RsvpControl.tsx'))).toBe(true);
  });
});

describe('findBannedWords', () => {
  const wordsIn = (source: string, allowedStrings?: readonly string[]) =>
    findBannedWords({
      source,
      fileName: 'x.tsx',
      ...(allowedStrings ? { allowedStrings } : {}),
    }).map((finding) => finding.word);

  it.each([
    ['attendees', 'const a = "Invite attendees";', 'attendees'],
    ['an event', 'const a = `Your event is set`;', 'event'],
    ['leverage', "const a = 'Leverage the crew';", 'leverage'],
    ['reach out', "const a = 'Reach out to them';", 'reach out'],
    ['successfully', "const a = 'Saved successfully';", 'successfully'],
    ['a template with a value', 'const a = `Hi ${name}, connect now`;', 'connect'],
    ['JSX text', 'const a = <p>Join the community</p>;', 'community'],
    ['awesome!', "const a = 'Awesome! Locked in';", 'awesome!'],
  ])('flags %s', (_name, source, word) => {
    expect(wordsIn(source)).toEqual([word]);
  });

  it('does not read code, comments or imports, only what a person reads', () => {
    expect(
      wordsIn(
        [
          "import { event } from 'connect';",
          '// a successfully commented event',
          'function handle(event: Event) { return event.target; }',
          'const ok = true;',
        ].join('\n'),
      ),
    ).toEqual([]);
  });

  it('matches whole words only', () => {
    expect(wordsIn("const a = 'Eventually, we prevent nothing';")).toEqual([]);
  });

  it('skips a whole string that is on the allowlist, and only that string', () => {
    expect(wordsIn("const a = 'keydown event';", ['keydown event'])).toEqual([]);
    expect(wordsIn("const a = 'keydown event twice';", ['keydown event'])).toEqual(['event']);
  });
});
