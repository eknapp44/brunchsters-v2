# Manual testing, spec 0015 — Notifications

For your own sign-off, in your own time. The automated suite proves the behavior; this list is for what it cannot judge: how it **feels**, whether the **words** sound right, a **real phone**, a **real inbox**, and a **screen reader**. Each item is a few minutes. Tick it, or write what you saw. _Draft from the spec's journeys; each milestone keeps it true._

**Setup:** `pnpm dev` (app on :3000 and the queue on :8288; see `docs/SETUP.md`), signed in with your own Google account; a second browser profile (or phone) signed in as someone else for anything with two people. For "make it fail", Chrome DevTools → Network → **Block request URL** or **Offline**. Emails: the outbox folder (`FileEmailService`) unless a real-send recheck is asked for (`/real-send-check`).

## A. The inbox

- [ ] **A1. The bell.** Signed in, the top bar has a bell. With nothing new it reads "Notifications"; with unread it shows a count and a screen reader says "Notifications, N unread". It is easy to hit with a thumb.
- [ ] **A2. Host activity.** As host, have the second person reply and vote. Your bell counts up (within about a minute, or when you return to the tab). `/notifications` shows one row for replies and one for votes, not one per tap. Opening a row takes you to the brunch and clears it.
- [ ] **A3. It comes back.** After reading, have them vote again: the same row is unread again with the new count.
- [ ] **A4. Nothing about the person who acted.** The person who replied or voted gets nothing about their own action.
- [ ] **A5. Empty and long.** A brand-new account sees the empty state and it invites you to do something. With 30+ rows the page still scrolls smoothly on a phone.
- [ ] **A6. Mark all read** clears the count at once and a toast says "All caught up."; with the network blocked it rolls back and a toast says so in plain words.
- [ ] **A7. Keyboard.** Tab to the bell (it comes before Sign out), press Enter. Tab to **Mark all read** and press Enter: the button dims but keeps the focus (the focus ring does not vanish).
- [ ] **A8. Unread without color.** Unread rows have a dot and a butter background. With a screen reader each unread row starts with "Unread."; read rows don't. In dark mode both kinds are easy to tell apart.
- [ ] **A10. Sign out straight away.** Load any page and press **Sign out** at once. You land on the front page, and typing `/dashboard` takes you to sign-in (you do not find yourself signed in again a second later).
- [ ] **A9. Older.** With more than 30 rows the page ends with **Show older**, and it takes you to the next page.

## B. Member notices

- [ ] **B1. Confirmed.** The host locks it in; the second person gets a row and the email. The row says the place and the time **in the place's own zone, with the zone named** ("… · Sunday, December 6 · 10:00 AM PST"), the same as the brunch page does.
- [ ] **B2. Called off, then back on.** Call it off and bring it back inside five minutes: nobody hears anything. Call it off and wait: a row and an email. Bring it back: "back on" row and email.
- [ ] **B3. Invited with an account.** Invite the second person's address: they get a row and the email. Invite an address with no account: only the email.

## C. Preferences and mute

- [ ] **C1. The settings page** lists only things that really happen, grouped in words you recognise; nothing greyed out that does nothing.
- [ ] **C2. Email off** for "confirmed": lock in a brunch; that person gets the row but no email. **In-app off:** the email but no row.
- [ ] **C3. Mute a brunch.** On the brunch page choose **Muted**: no rows or emails for that brunch, others unaffected. **Just big stuff** keeps confirmed / called off / back on and drops the chatter.
- [ ] **C4. The email footer** (open one of the files in `.mail-outbox/`, or a real send via `/real-send-check`): "Want fewer of these?" with **Mute this brunch** (takes you to the brunch's control, scrolled into view) and **notification settings**. The invite email has the settings link only.
- [ ] **C5. Feel.** Flip a few switches and radios on a phone: each reacts at once, nothing jumps, and with the network blocked the switch goes back and a toast says why. Tab to a switch and press Space: it flips and keeps the focus ring.
- [ ] **C6. A silent skip.** Turn off "Someone invites you, by email" for an account, then have the host invite it: the host's invite list shows nothing different (no "didn't go out"), and the in-app row still arrives.

## D. When an email does not go out

- [ ] **D1. A bad address.** Invite `nobody@example.invalid` (or use a recipient Resend rejects in a real-send recheck). You get a row "Your invite to … didn't go through" and the invite line says "That email didn't go through. Try Resend, or copy the link and send it yourself."; **Resend** clears both once it goes. (The line should read as help, not blame, and be easy to see on a phone.)
- [ ] **D2. Silence is silence.** An invitee who switched the invite email off does **not** show you "didn't go out".

## E. Deadlines and "over"

- [ ] **E1. A deadline reminder.** Set a deadline just over 24 hours out and wait for the cron (or invoke it from the Inngest dev UI at :8288): someone who has not voted gets a row and an email; someone who voted does not. Moving the deadline reminds again.
- [ ] **E2. Over.** A confirmed brunch whose time passed by six hours becomes **Over**: the page says so, nothing can change, and **Bring it back** is not offered. Old test brunches flip quietly on the first run (nobody is mailed).

## F. Fresh pages

- [ ] **F1. Focus refresh.** With the brunch page open in one tab, vote from another profile, then switch back: the counts update without a reload. Start ticking a box in your own ballot, switch tabs and back: **your ticks are not replaced.**
- [ ] **F2. Announcements.** With a screen reader, an outside change to a count is announced politely; your own tap is not announced twice.

## G. Words

- [ ] **G1.** Read every row and email aloud: friend in the group chat, warm and specific, no corporate words, nothing promised that doesn't happen ("within a minute", "we'll remind you"). Note changes for `apps/web/src/lib/notificationCopy.ts` and `packages/core/src/email/templates/`.

## H. Phone and screen reader

- [ ] **H1. A real phone** (once deployed, or on your LAN): the bell, inbox, settings and mute control have no sideways scroll, targets are thumb-sized, and the page is clear in dark mode.
- [ ] **H2. VoiceOver / NVDA / TalkBack:** the bell, each row, the switches and the mute options all read as what they are, with their state.

## Sign-off

| Section | Done | Date | Notes |
| ------- | ---- | ---- | ----- |
| A       |      |      |       |
| B       |      |      |       |
| C       |      |      |       |
| D       |      |      |       |
| E       |      |      |       |
| F       |      |      |       |
| G       |      |      |       |
| H       |      |      |       |
