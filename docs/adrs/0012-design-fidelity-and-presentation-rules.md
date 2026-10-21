# 0012 — Design fidelity: compositions, voice, and where presentation rules live

**Date:** 2026-10-21  
**Status:** Accepted  
**Deciders:** Evan Knapp

## Context

Spec 0009 signed off the styling _foundation_ (tokens, primitives, dark mode, accessibility and layout checks) but not the design: the built screens do not look or sound like the Claude Design prototype. The cause was a process failure, not only a scope choice: the prototype was read as source and never rendered, `Brand Voice.html` was never read, and no review compared the app with the prototype. Spec 0009 deferred "copy and terminology" to a later pass and filed most compositions under "ships later" although they are presentation over data that exists.

Spec 0011 closes that gap. Five questions need a decision that a future reader would not guess:

1. **How** the prototype and the existing design are reconciled (the owner likes the dark palette, the two-column desktop layout and the lighter voting rows).
2. **Who may see attendee names.** The prototype's "Who's coming" shows names to invitees. `PLANNING.md` §17 says invitees see "aggregate counts only … names are hidden on 'no' entries", which can be read two ways.
3. **Avatars.** `User.avatarUrl` holds a Google photo; the prototype uses initials.
4. **Where derived presentation rules live** ("leading", "vote waiting", "next up", "past"), given that business logic belongs in `packages/core`.
5. **Which wording is adopted** from `Brand Voice.html` and `Copy Pass.html`, given that accessible names are a contract with about 20 e2e journeys.

## Decision

1. **Per screen, per element: adopt, keep ours, or blend, decided with a side-by-side board in front of the owner.** The board (prototype next to app, light and dark, desktop and phone) is the review artifact at every milestone, produced by a committed script, not scratch tooling. Kept from spec 0009: the dark palette, the two-column desktop layout, the lighter voting rows (checkboxes, vote-count badge), and the accessibility and phone work.
2. **Names rule.** The host sees every attendee with their full name and state, plus invited people who have not responded (as their email, "Hasn't said yet"). Every other member sees `First L.` for those who said **yes** or **maybe**, and only **counts** for "no" and "hasn't said yet". Outsiders see nothing (the same 404 as a made-up id). `PLANNING.md` §17 is reworded to say exactly this. A roster is a service in `packages/core` with the membership check first.
3. **Initials only.** Every avatar is initials on a deterministic token color. Google photos are not shown to other members. Profile photos (Google or uploaded), and the settings they need (photo opt-in, dark mode, edit profile), are a named future **Settings** spec. Opt-**in**, not opt-out, because showing the photo first and asking later makes the exposing choice the default, and every viewer's browser would fetch the image from Google (a privacy leak by itself).
4. **Derived presentation rules are pure functions in `packages/core`**, unit-tested, and consumed by Server Components: `leadingOptionId` (ties and zero votes: none), `isVoteWaiting`, `pickNextUp`, `isPastBrunch`, and the roster. React components format and draw; they never decide. This is the same rule as the rest of the repo, stated for presentation because that is where the temptation is, and it lets the notifications spec reuse the same functions ("Tartine's leading by 2").
5. **Voice.** `Brand Voice.html` and `Copy Pass.html` are the source. Adopted strings are listed in `specs/0011-design-fidelity/plan.md` (the copy table), including those deliberately **not** adopted (features that do not exist, and "Pick your one", which contradicts multi-pick ballots). Emoji appear at moments (greeting, confirmation, the empty state, RSVP card buttons by the owner's choice), never in labels that carry state; they are `aria-hidden`, so accessible names stay words ("I'm in", "Maybe", "Can't"). Status wording from the Copy Pass ("Open for votes", "In the works") is a **display mapping** in `apps/web`, not a relabel of the status lookup table, so the exact-text rule on the brunch page (about 37 journey lines mention "Active", "Draft" or "Confirmed") keeps holding; the mapping is covered by a test that fails when a seeded status code has no entry.
6. **Time-aware greeting is client-rendered** with a neutral server snapshot (`useSyncExternalStore`), because the server does not know the viewer's time zone.
7. **Per-screen milestones, each with its own data**, every one deployable (no placeholder data on a page that could ship), because the app should always be in a shippable state and the owner will review it on a real phone once it is deployed (the deployment spec was moved to last on 2026-10-21; until then the phone is judged on phone-width boards).

## Consequences

- Journeys change **deliberately**, in the same commit as their screen: the dashboard heading, `No brunches yet.`, the RSVP button names (`yes/no/maybe` become `I'm in/Maybe/Can't`), `Your RSVP` (becomes `You in?`), the wizard's `Next` and `What`. Each milestone lists them in `tasks.md`.
- The dashboard and brunch page gain read-only fields and one new read (`getBrunchRoster`). No schema change, no new route, no new permission surface beyond the roster, which has its own 404 test.
- A confirmed brunch whose time has passed moves to "Past" on the dashboard (derived at read time, as deadlines are). It is the one rule people can observe that this spec changes, and it exists only because dates now show.
- Every deferral is also written in `PLANNING.md` §17: the Settings spec (photos, upload, dark mode, edit profile), collapsible phone sections (decide after a real-phone review), link-preview (Open Graph) images, privacy and terms pages and a footer for the beta, the auto-"yes" on opening an invite link, and the notification strings the Copy Pass already wrote.
- The landing page stops being a placeholder; the sign-out destination and the front door of the private beta are the same page.

## Alternatives considered

- **Adopt the prototype wholesale.** Rejected: the owner prefers the current dark palette, two-column layout and lighter voting rows, and radio-style options would silently change a rule (ballots take several picks).
- **Keep names host-only.** Safest reading of §17, but the invitee's "Who's coming" would be counts with no faces, the prototype's social heart. Rejected by the owner; "no" names stay hidden.
- **Everyone sees every name, including "no".** Rejected: exactly what §17 wanted hidden.
- **Google photos now, with an opt-out.** Rejected: privacy-by-default, and it needs a settings surface that does not exist.
- **Relabel the status lookup rows to the Copy Pass wording.** Rejected: a seed and migration change, and a second place the wording can drift; revisit when the labels move to a copy source (open question in the spec).
- **A standalone backend milestone first.** Rejected: it would ship fields nothing shows, and the phone review would come last.
- **Auto-collapsing sections on phone.** Rejected for this spec: state that changes by itself, and a behavior change. Collapsible sections are re-decided after a real-phone review.
