import { describe, expect, it } from 'vitest';
import { safeSubject } from './safeSubject';

const CRLF = String.fromCharCode(13, 10);
const LINE_SEPARATOR = String.fromCharCode(0x2028);

describe('safeSubject', () => {
  it('leaves a normal subject unchanged', () => {
    expect(safeSubject('Evan invited you to brunch: Sunday Funday')).toBe(
      'Evan invited you to brunch: Sunday Funday',
    );
  });

  it('turns a smuggled header into plain text on one line', () => {
    const subject = safeSubject(`Brunch${CRLF}Bcc: attacker@example.com`);

    expect(subject).toBe('Brunch Bcc: attacker@example.com');
    expect(subject).not.toContain(String.fromCharCode(13));
    expect(subject).not.toContain(String.fromCharCode(10));
  });

  it('flattens tabs, other control characters and Unicode line separators', () => {
    expect(
      safeSubject(`a${String.fromCharCode(9)}b${String.fromCharCode(0)}c${LINE_SEPARATOR}d`),
    ).toBe('a b c d');
  });

  it('collapses runs of spaces and trims the ends', () => {
    expect(safeSubject('   too    many   spaces  ')).toBe('too many spaces');
  });

  it('truncates a very long subject with an ellipsis', () => {
    const subject = safeSubject('x'.repeat(400));

    expect(subject).toHaveLength(150);
    expect(subject.endsWith('…')).toBe(true);
  });
});
