const MAX_SUBJECT_LENGTH = 150;
const LINE_SEPARATOR = 0x2028;
const PARAGRAPH_SEPARATOR = 0x2029;

function isHeaderUnsafe(code: number): boolean {
  return code < 0x20 || code === 0x7f || code === LINE_SEPARATOR || code === PARAGRAPH_SEPARATOR;
}

// A subject is a mail header: a newline in it would let a brunch title add headers
// (for example a Bcc). Control characters and line separators become spaces.
export function safeSubject(value: string): string {
  const flattened = Array.from(value, (char) =>
    isHeaderUnsafe(char.codePointAt(0) ?? 0) ? ' ' : char,
  ).join('');
  const collapsed = flattened.replace(/\s+/g, ' ').trim();
  return collapsed.length > MAX_SUBJECT_LENGTH
    ? `${collapsed.slice(0, MAX_SUBJECT_LENGTH - 1)}…`
    : collapsed;
}
