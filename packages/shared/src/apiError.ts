// What a failing route says (spec 0014, ADR 0016): a short stable code, never wording. The client
// turns a code into the app's voice (`errorCopy` in apps/web), so no server string is ever shown
// and a route cannot leak by how it words something. Each code lists the HTTP statuses it may be
// sent with, which a route helper checks.
//
// The codes come from the routes' real error cases (walked in spec 0014 M1), grouped so that one
// line of copy serves them: all the 404s are `not_found` (a person must not learn which thing was
// missing), except an option that went away under a voter, which a member may be told.
export const API_ERROR_STATUSES = {
  signed_out: [401],
  forbidden: [403],
  cannot_vote: [403],
  suggestions_off: [403],
  not_found: [404],
  option_gone: [404],
  invalid: [400, 422],
  cannot_suggest_host: [422],
  brunch_called_off: [409],
  brunch_not_active: [409],
  brunch_changed: [409],
  brunch_over: [409],
  voting_closed: [409],
  already_confirmed: [409],
  nothing_to_confirm: [409],
  option_confirmed: [409],
  not_a_vote: [409],
  last_option: [409],
  already_reviewed: [409],
  already_there: [409],
  not_called_off: [409],
  not_deletable: [409],
  notice_pending: [409],
  rate_limited: [429],
  unavailable: [502, 503],
  internal: [500],
} as const satisfies Record<string, readonly number[]>;

export type ApiErrorCode = keyof typeof API_ERROR_STATUSES;

export const API_ERROR_CODES = Object.keys(API_ERROR_STATUSES) as readonly ApiErrorCode[];

export type ApiErrorBody = {
  readonly error: {
    readonly code: ApiErrorCode;
    // For logs and other clients; the web app never renders it.
    readonly message: string;
  };
};

export function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return typeof value === 'string' && Object.hasOwn(API_ERROR_STATUSES, value);
}

export function isStatusAllowedFor(params: {
  readonly code: ApiErrorCode;
  readonly status: number;
}): boolean {
  const allowed: readonly number[] = API_ERROR_STATUSES[params.code];
  return allowed.includes(params.status);
}

// The code to assume for an answer that carries none (a route not migrated yet, a proxy's page).
// A 404 never depends on the body, so it says the same thing for every id.
export function codeForStatus(status: number): ApiErrorCode {
  if (status === 401) return 'signed_out';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 409) return 'brunch_changed';
  if (status === 400 || status === 422) return 'invalid';
  if (status === 429) return 'rate_limited';
  if (status === 502 || status === 503) return 'unavailable';
  return 'internal';
}
