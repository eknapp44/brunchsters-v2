import { RATE_LIMIT_POLICIES } from '@brunchsters/shared';

// What a person is told when a limit holds them back (spec 0012, ADR 0013). In the Brand Voice
// (`design-docs/Brand Voice.html`): a friend, not a service, so no "rate limit" and no
// "successfully"; and it promises nothing the app does not do (no "we'll try again", because the
// person has to). These are the only strings the spec adds; every other control keeps its generic
// error until the feedback-surfaces spec.

// The facts a 429 carries (the body of `rateLimitedResponse`).
export type RateLimitFacts = {
  readonly policy: string;
  readonly retryAfterSeconds: number;
};

const SECONDS_PER_HOUR = 3600;

// A wait a person can read, never "0": under about a minute and a half is "a minute", then whole
// minutes, then "about N hours" (the daily limits are measured to the second, which nobody wants).
export function formatWait(seconds: number): string {
  if (seconds <= 90) return 'a minute';
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} minutes`;
  const hours = Math.round(seconds / SECONDS_PER_HOUR);
  return hours <= 1 ? 'about an hour' : `about ${hours} hours`;
}

export function limitedMessage(facts: RateLimitFacts): string {
  switch (facts.policy) {
    case RATE_LIMIT_POLICIES.resendPerInvite.name:
      return `That one just went out. Give it ${formatWait(facts.retryAfterSeconds)}.`;
    case RATE_LIMIT_POLICIES.inviteEmailsPerBrunch.name:
    case RATE_LIMIT_POLICIES.inviteEmailsPerHost.name:
      return `Easy there, that's a lot of invites for one day. Try again in ${formatWait(facts.retryAfterSeconds)}.`;
    default:
      // Place search, the write limit, and any policy a later spec adds.
      return 'Slow down a sec, then try again.';
  }
}
