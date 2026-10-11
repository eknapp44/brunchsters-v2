// An input guard, not an attendee limit (that is a separate feature): every address
// becomes an email, so one request must not be able to fan out without bound (spec 0008).
// Shared because the server rejects more than this and the creation wizard stops short of it.
export const MAX_INVITES_PER_REQUEST = 50;
