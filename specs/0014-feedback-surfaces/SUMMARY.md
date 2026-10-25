# Spec 0014 — Feedback surfaces: summary

The one page to read. `spec.md`, `plan.md` and `tasks.md` are the working documents behind it.

**Status:** complete on `feat/0014-feedback-surfaces` (2026-10-25). **Release:** not yet (PR pending).

## What it does, in plain words

When you tap something and it works or doesn't, the app now tells you, in its own voice, in the right place:

- **A one-tap result** (RSVP, remove, approve, hide, copy a link) answers with a small toast at the bottom: "You're in. See you there." or "Something went sideways on our end."
- **Something you typed or chose** (an invite, a time to add, locking it in, a vote) answers with a line beside it, and what you typed stays.
- **A wait** ("Easy there, that's a lot of invites for one day…") stays beside its button, as before.
- **Things that used to fail without a word now say so:** a brunch created with invites that didn't go out, a place search that couldn't answer, a copy-link the browser refused, and a session that ended while a page was open (you land on sign-in with a way back).

Every failure message comes from one table in the app's voice. The server only sends a short code; it never sends words that reach the screen.

## Decisions you made (and why)

| Decision                                                                    | Why                                                                                                                                                                                                                                                             |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The server sends a **code**, the client words it                            | A message can never leak whether a brunch exists (the 404 rule), and the voice lives in one place                                                                                                                                                               |
| **Toast** for one-tap results, **inline** for what you must fix or wait out | A wait has to stay beside its button; a toast would vanish                                                                                                                                                                                                      |
| **No retry button**                                                         | The control is as it was, so tapping again is the retry; nothing promised that isn't done                                                                                                                                                                       |
| **All controls at once**, in five milestones                                | Two ways to do the same thing for weeks would be worse                                                                                                                                                                                                          |
| Success toasts only where the page change is subtle                         | RSVP's button looks the same to a screen reader; a vote's checkbox already shows it                                                                                                                                                                             |
| **Skeletons deferred** (2026-10-25)                                         | The spike showed a placeholder either turns a 404 into a 200 or delays when controls become tappable (about 45 ms became about 330 ms), and about ten journeys failed. Revisit with real latency from the deployed beta (`docs/BACKLOG.md` "Loading skeletons") |

## What changed from the plan

- Error text is read **by hand** in the browser, not with Zod (Zod there trips the Content-Security-Policy).
- A signed-out tap **redirects explicitly** to sign-in rather than refreshing; the toast doesn't survive it, so the sign-in page says "Sign in and we'll take you right back to where you were headed."
- The invites-didn't-go-out note clears when an invite is sent, not when read.
- The review added a signed-out redirect for ballots, the wizard and place search (the first version covered only the shared hook).

## Not done, on purpose

Loading skeletons; live updates for what other people change (BACKLOG "Live updates", to discuss); a retry button; an offline queue; the host-facing "an email didn't go out" signal (notifications spec); the exact words for a session that ended (BACKLOG).

## How it was checked

Unit tests (web 685, core 721, shared 54), a scanning test that fails any route answering the old way, a test that fails a component calling `fetch` itself, a banned-words test for the voice rules, and 13 new journeys plus about a dozen edited, each proved to fail with its behavior removed. Production-build e2e: 279 passed, 2 skipped (the same 2 as before the spec). The notes per milestone are in `tasks.md`.

## Where to look

- **See it:** [`screenshots/`](./screenshots/README.md) (how it looked when finished).
- **Try it yourself:** [`MANUAL-TESTING.md`](./MANUAL-TESTING.md) (a checklist for your own sign-off).
- **Why it is built this way:** [ADR 0016](../../docs/adrs/0016-feedback-surfaces.md); the conventions for the next control are in `apps/web/CLAUDE.md` ("Adding a control that sends a request").
- **The detail:** [`spec.md`](./spec.md) (including "Outcome"), [`plan.md`](./plan.md) (the code and copy tables), [`tasks.md`](./tasks.md) (per-milestone testing notes).
