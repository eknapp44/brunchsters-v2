// The rate-limit policies (spec 0012, ADR 0013). Named constants, not configuration: they are
// starting points to be tuned with beta data, and tests spend the real budget. Shared because the
// server enforces them and a control's wording may need the wait they imply.
export type RateLimitPolicy = {
  // Part of the counter key ("<name>:<subject>"), so it is unique across policies and stable:
  // renaming one resets its counters.
  readonly name: string;
  readonly limit: number;
  readonly windowSeconds: number;
};

const MINUTE = 60;
const DAY = 24 * 60 * MINUTE;

export const RATE_LIMIT_POLICIES = {
  // Invite emails: one unit per address that will be emailed (created, revived or re-sent).
  inviteEmailsPerHost: { name: 'invite-emails-host', limit: 100, windowSeconds: DAY },
  inviteEmailsPerBrunch: { name: 'invite-emails-brunch', limit: 50, windowSeconds: DAY },
  // Resend is once per invite per window, and it also spends one host invite-email unit.
  resendPerInvite: { name: 'resend-invite', limit: 1, windowSeconds: 10 * MINUTE },
  placeSearchPerUser: { name: 'place-search', limit: 30, windowSeconds: MINUTE },
  placeDetailsPerUser: { name: 'place-details', limit: 20, windowSeconds: MINUTE },
  // Every other authenticated write; counts requests the service then rejects too.
  writesPerUser: { name: 'writes', limit: 60, windowSeconds: MINUTE },
  // Every request to the public invite-token routes, keyed by the caller's address: the only
  // routes a signed-out visitor can call, and nothing in the app's own screens calls them.
  inviteTokenPerIp: { name: 'invite-token', limit: 30, windowSeconds: MINUTE },
} as const satisfies Record<string, RateLimitPolicy>;

export type RateLimitPolicyName = keyof typeof RATE_LIMIT_POLICIES;

// Counters older than this are deleted (Constitution 30): a window is at most a day long, so two
// days keeps the current window and the one before it and nothing else.
export const RATE_LIMIT_RETENTION_DAYS = 2;
