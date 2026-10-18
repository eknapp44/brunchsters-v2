# Spec 0007 — Email Normalization

**Status:** Complete (merged, PR #10)  
**Branch:** `feat/0007-email-normalization`  
**PLANNING.md ref:** §17 Open Questions ("Email addresses are compared case-sensitively across requests")  
**ADRs:** [0008 — Normalize email addresses to lowercase at the boundary](../../docs/adrs/0008-normalize-email-addresses.md)

---

## What

Make one email address mean one person, however it is capitalized. Today `Case-X@Example.com` and `case-x@example.com` are different strings, so inviting both creates two invites (two links, two rows in the host's list) for the same person, and an invite typed in lowercase can fail to find an existing account whose Google address has capitals.

Found by the e2e suite (spec 0006 M5), logged in PLANNING §17, and decided in ADR 0008: **normalize to lowercase at every boundary, enforce it with the branded `Email` type, backfill existing rows, and add a database check constraint as a safety net.**

---

## User flows

### Host invites the same address twice, in different cases

1. Host invites `Guest@Example.com` (wizard or "Invite more people")
2. Later invites `guest@example.com`
3. There is **one** invite for that person; the second request refreshes it (the existing "already invited → resend" behavior) instead of creating another row and another link

### Invitee's account matches however the invite was typed

1. Someone's Google account reports `Alex.Smith@Gmail.com`; the account is stored as `alex.smith@gmail.com`
2. A host invites `ALEX.SMITH@gmail.com`
3. The invite finds the existing account (the known-user path: an attendee row is created immediately), rather than treating Alex as a stranger

### Suggestions

Suggesting an address that was already suggested, in any case, is refused as a repeat (`already_suggested`). Suggesting one the host has already invited is allowed (as today), and approving it refreshes the existing invite instead of creating a second one — one person, one invite.

---

## Acceptance Criteria

### Shared type and boundaries

- [x] `normalizeEmail(raw: string): Email` in `packages/shared` trims and lowercases; it is the only constructor of the branded `Email` type
- [x] The request schemas that accept addresses (`sendInvites`, `suggestInvitee`) transform to `Email`; the services take `Email`, so passing an un-normalized string does not compile
- [x] `signInWithProvider` normalizes the address the provider reports before looking up or creating the account
- [x] Unit tests for `normalizeEmail` (case, surrounding whitespace, idempotence) and for each boundary

### Behavior

- [x] Inviting the same address in two cases produces one invite row and one link (real-Postgres test)
- [x] An existing account is found whatever the case of the invited address, and vice versa (real-Postgres test)
- [x] A suggestion for an address already suggested in another case is refused as a repeat, and approving a suggestion for an address already invited in another case leaves one invite (e2e)
- [x] The host's own address is excluded from their invite list and cannot be invited, in any case (already true within a request; now true everywhere)

### Data

- [x] A migration lowercases `User.email`, `UserAuthProvider.email`, `BrunchInvite.invitedEmail` and `BrunchInviteSuggestion.suggestedEmail`
- [x] The migration first detects rows that would collide once lowercased and stops with a readable message rather than a unique-constraint error half way through
- [x] The migration adds `CHECK (… = lower(…))` constraints to those four columns; a direct insert of a mixed-case address fails
- [x] Verified against a database that contains mixed-case rows and collisions (manual script, results in the testing notes)

### E2E Journeys

- [x] **I7** — one address, one person: the host invites an address in two cases and sees one invite with one working link; an existing user whose account address has capitals is recognized when invited in lowercase (known-user path)
- [x] The existing journeys and the API-authorization tests keep passing unchanged

### Docs

- [x] ADR 0008; PLANNING §17 entry resolved; `CLAUDE.md` notes that emails are `Email` values produced by `normalizeEmail`
- [x] Testing notes per milestone in `tasks.md`

---

## What This Spec Does Not Cover

- Provider-specific aliasing (Gmail ignoring dots and `+tags`) — two addresses that mail providers deliver to the same inbox but that differ as strings stay different people
- Internationalized (non-ASCII) addresses
- Remembering or displaying the casing the user typed
- Email delivery (nothing sends mail yet)

---

## Open Questions

None blocking. One thing to confirm during M2: the production-like path for the migration's collision check — there is no production data yet (pre-launch), so the check exists for the day there is.
