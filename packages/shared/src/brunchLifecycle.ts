// How long the "called off" email waits before it goes out (spec 0013, ADR 0015). Bringing the
// brunch back inside this window sends nothing at all, which is also what stops a cancel and
// bring-back loop from emailing people over and over. A named constant, not configuration: it is
// easy to change when real use says five minutes is wrong.
export const CANCEL_NOTICE_HOLD_SECONDS = 5 * 60;

// A called-off brunch cannot be deleted until its notice has gone out (spec 0013): deleting inside
// the hold would leave the guests never told. If the queue never delivers the notice (an outage),
// the host must not be stuck, so deletion opens up this long after the hold is over regardless.
export const CANCEL_NOTICE_GRACE_SECONDS = 60 * 60;

// How many Past brunches the dashboard shows before "Show all". Past grows without bound for
// anyone who never hides a brunch, so the list stays short by default (spec 0013).
export const PAST_BRUNCHES_SHOWN = 5;
