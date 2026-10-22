# Manual tests for spec 0011 (design fidelity) and the post-review hardening

For you to run by hand against your local app. It lists only what needs eyes: look, feel, copy, and
real-browser behavior. The e2e suite already proves the rules (who sees whom, the 404 and 403 text,
vote counts, the Past rule, escaping, the headers), so those are not repeated here; "Already proven"
at the end lists them. Tick as you go; write what looks wrong next to the line.

## 0. Setup (about five minutes)

1. Local Supabase running (Docker Desktop), then `pnpm dev` (the app on http://localhost:3000).
2. **Do not run the Inngest dev server for this pass** unless you want emails. Your `.env.local` has the real Resend key,
   so with Inngest running, inviting a fake address like `ava@example.com` would try to send a real email to it. Without
   Inngest, events are dropped and nothing is sent.
3. Your own browser stays signed in as you (host). For the friends, open extra windows with
   `pnpm dev:as ava`, `pnpm dev:as ben` and `pnpm dev:as cleo --phone` (a phone-sized window). Each is a separate person.
4. Optional, to start clean: `pnpm db:clear-brunches evan.l.knapp@gmail.com` (dry run), then `--apply`.
5. Do the whole pass once in light and once in dark (switch your operating system's theme; there is no toggle).
   Do the phone checks in the `--phone` window or Chrome's device mode.

## 1. The front door (signed out; use a private window)

- [ ] **Landing `/`, desktop:** the headline is large and serif, the breakfast scene sits on the right, "Round up the crew" is the one orange button, "See how" scrolls to three steps, the footer is a quiet line. Nothing mentions Apple, plus-ones, dietary notes or "free".
- [ ] **Landing, phone:** one column, no sideways scroll, the scene sits below the buttons, the three steps stack.
- [ ] **Sign-in `/sign-in`:** "Welcome", the voiced headline, "Sign in with Google", "We never post for you. Promise." Starts a real Google sign-in (use your own account).
- [ ] **Invite link while signed out** (copy one from your host window): the card shows the host's initials, "{Host} wants you at brunch 🥂", the brunch title, and the description in quotes if there is one. No place, no date, no other names. "Sign in with Google" works and you land back on the brunch.
- [ ] **A bad invite** (`/invite/nonsense`): "That invite's gone cold." with the help line; no button.
- [ ] **A 404** (`/nothing-here`, and a brunch address you are not in): "This table's empty." and "Back home". The same words for both.
- [ ] Light and dark both look right on every one of these; the landing hero gradient is dark, not a white flash.

## 2. Host: dashboard and creating a brunch (your window)

- [ ] **Empty dashboard** (after clearing): greeting by time of day ("Morning, Evan" and an emoji), "The table's set. Now invite some people.", a "Plan a Brunch" button.
- [ ] **The wizard:** four steps, each with a small "Step N of 4 · …" line and a big heading (Give it a name, Pick a spot, Pick a time, Round up the crew). The progress plates are easy to read, Back and Continue are at the bottom, Cancel is a link. Description says "optional". Place search shows suggestions; adding a second place and a second time works. On a phone the plates are large and nothing is cut off.
- [ ] **Cancel mid-way** leaves without saving; nothing appears on the dashboard.
- [ ] **Create:** you land on the new brunch page. A draft shows its status badge once ("Draft").
- [ ] **Invite panel:** "Round up the crew" with an email field; invite `ava@example.com` and `ben@example.com`; each shows as pending with a "Copy link" button.

## 3. Friends: invitee flow (the dev:as windows)

- [ ] **Open Ava's link in her window.** Note what happens: today a signed-in person is joined and marked "yes" at once. That is the behavior you called odd (recorded in PLANNING §17 for a change); just confirm it matches this description.
- [ ] **Brunch page, Ava:** host line ("{Host} wants you…" style), the "You in?" card with **I'm in / Maybe / Can't** (emoji on the buttons), "Where to?" and "When?" lists with checkboxes, quiet vote bars that fade on selected rows, a "leading" tag on the front-runner, the helper line under each heading.
- [ ] **Vote** for a place and a time as Ava; as Ben pick differently. The counts and bars move, the leading tag follows.
- [ ] **Who's coming, as the host:** everyone by full name, plus pending invites as emails ("Hasn't said yet"). **As Ava:** "First L." names for yes and maybe, "You" for herself, only counts for the others, never an email.
- [ ] **A "Can't" RSVP** (Ben): his ballots become read-only with the message "Your RSVP does not allow voting."; switching back to I'm in restores them.
- [ ] **Phone (Cleo or Ava with `--phone`):** the page is shorter; repeated lines are left out (read it and ask: is anything I need missing?); every button is easy to tap.

## 4. Host: manage, close, confirm

- [ ] **Manage page** (the "Manage brunch" link): headings Locations and Times, add/remove options, the voting deadline field ("Save deadline"), pending suggestions if any.
- [ ] **A guest opening `/brunch/<id>/manage`** (in Ava's window): a 403 page, "That one's the host's.", with "Back to dashboard"; none of the host's controls. A stranger sees the plain 404 instead.
- [ ] **Nudge:** when most people have voted, "Most of the crew has voted — call it now if you're ready." appears; the button is **Call it**.
- [ ] **Lock it in:** choose a place and time, confirm. Everyone's page shows "Brunch on. 💕" with two "Locked in" chips and the plan; ballots are gone or read-only; the status badge reads "Confirmed" once.
- [ ] **Dashboard after confirming:** the brunch is the big "next up" card with a date tile, the roster, and (if a vote is waiting on someone) the "vote waiting" pill; the other brunches are rows (on a phone: a date tile, then the title on one line, then pill and count, stacked).

## 5. Look and feel, everywhere

- [ ] **Dark mode** is a real theme on every screen above: text readable, no white boxes, the avatar initials legible, bars visible but quiet.
- [ ] **Tab through** a screen with the keyboard: focus is always visible, the order matches the page, "Skip to main content" appears first.
- [ ] **Resize the window** from wide to phone width on the brunch page: two columns turn into one without anything overlapping.
- [ ] **Reduced motion** (OS setting): nothing slides or fades.

## 6. Security spot checks (two minutes)

- [ ] **Open redirect:** visit `http://localhost:3000/sign-in?callbackUrl=https://evil.test` while signed out, sign in, and confirm you land on your dashboard, not on evil.test.
- [ ] **Headers:** in DevTools, Network, click the page request: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, a `Referrer-Policy` (it is `no-referrer` on an `/invite/…` page), a `Permissions-Policy`, and no `X-Powered-By`.
- [ ] **Another person's brunch:** paste a brunch address into a window signed in as someone not invited: the 404, with no hint the brunch exists.

## 7. Emails (optional; sends real mail to you only)

Use the `real-send-check` skill (it asks first and sends only to your own addresses). Look for: the subject and emoji ("{Host} wants you at brunch 🥂", "Brunch on. 💕 {title}"), the sender name, heading and body, a working "See the brunch" button, the footer, and how it looks on a phone and in dark mode.

## Already proven by the e2e suite (skip)

Who sees whom on the roster, the 404 and 403 words and that an outsider cannot tell a real brunch from a made-up one, the vote bars and the leading tag, the Past rule, the greeting, the wizard's steps and Cancel, the hydration race on the deadline field, the invite preview's contents, the escaped email text, the security headers, and the sign-in redirect fallback. Run `pnpm test:e2e` if you want that confirmed again.

## Cannot be checked until the app is deployed

A real phone on the signed-in screens (Google rejects an IP address as a redirect), a second real Google account signing in, emails in clients other than Gmail, and a screen reader. These wait for the deployment spec.
