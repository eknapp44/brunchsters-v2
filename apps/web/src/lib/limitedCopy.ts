import { RATE_LIMIT_POLICIES } from '@brunchsters/shared';

// What a person is told when a limit holds them back (spec 0012, ADR 0013). In the Brand Voice
// (`design-docs/Brand Voice.html`): a friend, not a service, so no "rate limit" and no
// "successfully"; and it promises nothing the app does not do (no "we'll try again", because the
// person has to). The wait lines here are the only copy a 429 has with a wait of its own; a refusal a
// control has no wait for is `errorCopy`'s "Slow down a sec, then try again." (spec 0014).

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

// Whether a refusal means no invite email can go out for this brunch or host until the window ends
// (the day's budget), as opposed to one invite's resend cooldown. Every control that sends mail
// waits then, not only the one that was pressed.
export function holdsAllInvites(policy: string): boolean {
  return (
    policy === RATE_LIMIT_POLICIES.inviteEmailsPerBrunch.name ||
    policy === RATE_LIMIT_POLICIES.inviteEmailsPerHost.name
  );
}

export function limitedMessage(facts: RateLimitFacts): string {
  if (facts.policy === RATE_LIMIT_POLICIES.resendPerInvite.name) {
    return `That one just went out. Give it ${formatWait(facts.retryAfterSeconds)}.`;
  }
  if (holdsAllInvites(facts.policy)) {
    return `Easy there, that's a lot of invites for one day. Try again in ${formatWait(facts.retryAfterSeconds)}.`;
  }
  if (facts.policy === RATE_LIMIT_POLICIES.cancelNoticesPerHost.name) {
    return `That's a lot of called-off brunches for one day. Try again in ${formatWait(facts.retryAfterSeconds)}.`;
  }
  // Place search, the write limit, and any policy a later spec adds.
  return 'Slow down a sec, then try again.';
}
