---
name: limited-surface
description: Add or change anything in Brunchsters that can be abused or costs something - a new mutating API route, a new email, a new paid third-party call, or a new control that must wait after a 429. Walks the rate-limit recipe in order so the guard tests pass for the right reasons. Use when adding a route, an email event, a Places-style call, or a "try again in..." control.
---

# limited-surface

The rules are in the root `CLAUDE.md` ("Every route that changes something spends the caller's write budget…"), ADR 0013 and `apps/web/CLAUDE.md`. This is the order to work in. Three tests fail loudly if a step is skipped (`routeLimits.test.ts`, `emailBudgets.test.ts`, the Places reachability check); read their failure message, it says what to do.

## 1. Decide what it is

- **A route that changes something** → it spends the write budget (60 per person per minute) and nothing else, unless it also sends mail or costs money.
- **Sends mail** (a new `EventBus` event that a handler emails) → needs its own policy in `packages/shared/src/rateLimits.ts`, **or** a recorded reason it is bounded (`emailBudgets.test.ts` holds the decision list).
- **Costs money** (Google Places, any paid API) → its own per-person policy, and the route that reaches it is added to `routeLimits.test.ts` on purpose.
- **A signed-out route** → keyed by address (`clientIp`) and spent before the session check; see the invite-token routes.

## 2. Key it by the caller, never by a named id

The limit key is the signed-in user id or the address, never a brunch, invite or suggestion id the caller merely named: a limit that depends on an id tells a real id from a made-up one and breaks the 404 rule. Budgets that are naturally per-brunch (the 50 invites per brunch) are spent in `packages/core` **after** the host check, so an outsider never reaches them.

## 3. Build it

1. Policy constant in `packages/shared/src/rateLimits.ts` (name, limit, window) with its test.
2. Route: `enforceWriteLimit(session.user.id)` right after the session check and before reading the request (a signed-out route spends the address budget first). Paid or mail routes also call `enforceLimit` or spend through `consumeBudgets` in core (several budgets in order, fail closed).
3. Core service: take `rateLimiter` in `ctx`, spend after the permission check, return the refusal as a `Result` error; the route maps it with `rateLimitHttp.ts` (429 with `Retry-After`, or 503 when the counters fail).
4. Unit tests with `InMemoryRateLimiter` and `RecordingRateLimiter` (what was spent, in what order, nothing spent on a refused host check); an integration test when it touches Postgres.

## 4. If a control must wait

- The server answers, the browser does not remember: add the question to `getInviteWaits` (or a sibling in `packages/core`, using the limiter's read-only `peek`), pass the answer from the page as a prop, show it with `useWait`, and call `router.refresh()` after a 429 so every control on the page agrees. **No `localStorage`.**
- Wording is `limitedMessage` (Brand Voice; ask which strings change and which journeys find them by name). The button is `aria-disabled`, not `disabled`.

## 5. Journeys (they own their data)

- A journey that spends a real budget: seed big batches through the factory (it spends the real budget and queues no mail), start each segment with `alignToWindow`, and use `untilRefused` for loops.
- Add the made-up-id vs real-id case to the API-authorization journey (L5 is the model).
- `click({ force: true })` for a button that is `aria-disabled`; switch the color scheme before loading the page.
- **Mutation-check the refresh:** remove `router.refresh()` after the 429 and confirm a journey fails (it was unguarded once).

## 6. Docs

The spec's journey table, ADR 0013 if a budget changes, `PLANNING.md` §17 for deferrals. Close with `/milestone-done`.
