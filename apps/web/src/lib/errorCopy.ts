import type { ApiErrorCode } from '@brunchsters/shared';
import { limitedMessage, type RateLimitFacts } from './limitedCopy';

// What a person is told when something does not work (spec 0014, ADR 0016). The routes send a
// code and nothing else reaches the screen, so this table is the only place error wording lives:
// one place to read it in the Brand Voice (`docs/voice-and-copy.md`), one place the voice test
// scans, and no way for a route to leak by how it words something. Rules the lines follow: say
// what happened to the thing, not the system; nothing the app does not do (no "we'll try again":
// the person taps again); no "failed", "error" or "invalid"; one or two short sentences.

// A code the browser makes by itself: the request never got an answer.
export type ClientErrorCode = ApiErrorCode | 'network';

const COPY: Readonly<Record<ClientErrorCode, string>> = {
  signed_out: "You've been signed out. Sign back in and give that another go.",
  forbidden: "That one's the host's.",
  cannot_vote: "Voting's for the folks who are in. Change your answer if you're up for it.",
  // A 404 says nothing about what was looked for (voice rule 8): the same line for every id.
  suggestions_off: "The host isn't taking suggestions on this one.",
  not_found: "This table's empty.",
  option_gone: 'That one just came off the table. Have a look at what is left.',
  invalid: "That didn't look right. Check it and try again.",
  cannot_suggest_host: "That's the host. They're already in.",
  brunch_called_off: "This one's been called off, so it can't change.",
  brunch_not_active: "This brunch isn't open for that right now.",
  brunch_changed: 'Something just changed on this brunch. Have a look and try again.',
  brunch_over: 'That brunch already happened.',
  voting_closed: "Voting's closed on this one.",
  already_confirmed: "This one's already locked in.",
  nothing_to_confirm: 'Add a spot and a time before you lock it in.',
  option_confirmed: "That one's locked in, so it can't come off the table.",
  not_a_vote: "There's only one option, so there's nothing to vote on.",
  last_option: "That's the last one on the table, so it has to stay.",
  already_reviewed: "That one's already been looked at.",
  already_there: "That one's already on the list.",
  not_called_off: "This brunch isn't called off.",
  not_deletable: 'Call it off first, then you can delete it.',
  notice_pending: 'People are still being told it was called off. Give it a few minutes.',
  // Worded from the wait when there is one (`limitedMessage`); the generic line is below.
  rate_limited: 'Slow down a sec, then try again.',
  unavailable: 'Our end hiccuped. Give it a minute, then try again.',
  internal: 'Something went sideways on our end.',
  network: "Looks like you're offline.",
};

// Failures that mean the page is not what the brunch is any more (an option was removed, voting
// closed, it was called off or its status moved), not that the person did something wrong. A
// control asks the page again after one, so what is on screen is true while the line says why.
const PAGE_IS_STALE_CODES: readonly ClientErrorCode[] = [
  'option_gone',
  'voting_closed',
  'brunch_called_off',
  'brunch_over',
  'brunch_not_active',
  'brunch_changed',
  'already_confirmed',
  'already_reviewed',
];

export function pageIsStale(code: ClientErrorCode): boolean {
  return PAGE_IS_STALE_CODES.includes(code);
}

export const ERROR_COPY_CODES = Object.keys(COPY) as readonly ClientErrorCode[];

export function errorCopy(params: {
  readonly code: ClientErrorCode;
  // The facts of a 429, when there are some: the line then says how long.
  readonly rateLimit?: RateLimitFacts | undefined;
}): string {
  if (params.code === 'rate_limited' && params.rateLimit !== undefined) {
    return limitedMessage(params.rateLimit);
  }
  return COPY[params.code];
}
