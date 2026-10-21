// How a person is shown to other people (ADR 0012). Pure, so the roster in `packages/core` and the
// avatars in `apps/web` agree on one rule instead of each deciding.

// Matches the six colors of the Pop palette that `InitialsAvatar` draws from (`--pop-*` in
// `apps/web/src/styles/tokens.css`).
export const AVATAR_COLOR_COUNT = 6;

const firstCharacter = (word: string): string => Array.from(word)[0] ?? '';

const wordsOf = (name: string): readonly string[] =>
  name.split(/\s+/).filter((word) => word !== '');

// "Maya Reyes" → "MR", "Prince" → "P", an empty name → "?". Counts characters, not UTF-16 units,
// so a name that starts with an emoji or an accented capital is not cut in half.
export function initialsOf(name: string): string {
  const initials = wordsOf(name)
    .slice(0, 2)
    .map((word) => firstCharacter(word).toLocaleUpperCase())
    .join('');
  return initials === '' ? '?' : initials;
}

export type PersonNameAudience = 'host' | 'member';

type FormatPersonNameParams = {
  readonly fullName: string;
  readonly audience: PersonNameAudience;
};

// The host sees the full name (they need to tell two Mayas apart). Every other member sees
// "First L."; a one-word name stays as it is, and a blank one becomes "Someone".
export function formatPersonName(params: FormatPersonNameParams): string {
  const words = wordsOf(params.fullName);
  const [first] = words;
  if (first === undefined) return 'Someone';
  if (params.audience === 'host' || words.length === 1) return words.join(' ');
  const last = words[words.length - 1] ?? '';
  return `${first} ${firstCharacter(last).toLocaleUpperCase()}.`;
}

// A stable color for a person's initials: the same seed (their id, or an email for someone who has
// not signed in) is always the same color. FNV-1a, 32-bit; no crypto, just a spread.
export function avatarColorIndex(seed: string): number {
  let hash = 0x811c9dc5;
  for (const char of seed) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % AVATAR_COLOR_COUNT;
}

// The first word of a name, for a greeting ("Evan Knapp" → "Evan"). Empty when there is no name.
export function firstNameOf(name: string): string {
  return wordsOf(name)[0] ?? '';
}
