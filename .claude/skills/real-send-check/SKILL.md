---
name: real-send-check
description: Send a real Brunchsters email (invite, confirmation, or any new template) through Resend to the owner's own inbox, to check the subject, emoji, rendering and links in a real mail client. Use after changing an email template or the sending path, or when the owner asks for a real-send recheck. Always asks before sending.
---

# real-send-check

Unit tests and the e2e suite write emails to files; nothing in CI proves a message survives Resend and lands well in an inbox. This is the manual check. It sends **real email**, so it is outward-facing: ask the owner first, send only to the owner's own addresses, and never anywhere else.

## Before sending

1. **Ask.** Say which emails you will send and to which address. Default recipient: an alias of the owner's own inbox (the dev notes use `pnkme45+<tag>@gmail.com`, which lands in the same inbox). A yes in one session does not cover the next.
2. Check `apps/web/.env.local` has `RESEND_API_KEY` and `EMAIL_FROM` (never print, log or echo the key; just test that the variables exist). The sender domain is verified (SPF, DKIM and DMARC pass in Gmail); see `docs/SETUP.md`, "Email and the job queue".

## Template check (the common case: copy or layout changed)

Write a throwaway script in `apps/web/` (not in the scratchpad: it must resolve `resend` and the workspace packages) named like `_send-check.mts`. Use `.mts` (top-level `await` needs ES modules) and import the TypeScript files with their `.ts` extension:

- build a `ResendEmailService` from `./src/adapters/ResendEmailService.ts` with `new Resend(process.env.RESEND_API_KEY)` and `process.env.EMAIL_FROM` (fail loudly if either is empty);
- render the templates from `../../packages/core/src/email/templates/` (`renderInviteEmail`, `renderConfirmedEmail`, or the new one) with realistic sample data, dummy links (`http://localhost:3000/invite/not-a-real-token`), and a title that exercises escaping if relevant;
- send each with `service.send({ to, subject, html })` (use `normalizeEmail` from `@brunchsters/shared` for the address, not a cast) and print only the subject and the result.

Run it from `apps/web`: `node --env-file=.env.local --import tsx _send-check.mts`. **Delete the script afterwards** (`rm`, and confirm `git status` is clean), so nothing with a send in it is ever committed.

## Full-flow check (the sending path itself changed)

Use the recipe in `docs/SETUP.md` ("Email and the job queue") and the notes in memory (`email-notifications-setup`): run `next dev` and the Inngest dev server, drive the real core services with `InngestEventBus` from a throwaway script, check the run statuses in the dev server, and read the inboxes. Emailed links point at `AUTH_URL`, so they open only while the app runs locally. Stop the servers and delete the script afterwards.

## Report

Say what was sent and what Resend answered (the message ids are fine to show; the key never is). Ask the owner to check the inbox for: the subject and emoji intact, the sender name, the heading and body, the button and its link, the footer, and how it looks on a phone and in dark mode. Record "sent for real, owner checked" in the milestone's testing note only after they have.

## Do not

- Send to anyone but the owner's own addresses, or to a list.
- Print the API key, or put it anywhere but `apps/web/.env.local`.
- Leave the throwaway script, or any sending code, in the repo.
- Treat a Resend "accepted" as proof of delivery or rendering: it only means the message was taken.
