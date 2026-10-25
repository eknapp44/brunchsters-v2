# Manual testing, spec 0014 — Feedback surfaces

For your own sign-off, in your own time. The automated suite proves the behavior; this list is for what it cannot judge: how it **feels**, whether the **words** sound right, how it behaves on a **real phone**, and what a **screen reader** says. Each item is a few minutes. Tick it, or write what you saw.

**Setup:** `pnpm dev` (app on :3000 and the queue on :8288; see `docs/SETUP.md`), signed in with your own Google account. For anything with two people use a second browser profile (or a phone) signed in as someone else. For "make it fail", use Chrome DevTools → Network → **Block request URL** (or the **Offline** switch), as noted per item. Unblock before the next item.

## A. Toasts (one-tap results)

- [ ] **A1. RSVP says so.** Open a brunch you were invited to. Tap **I'm in**, **Maybe**, **Can't** in turn. A toast appears at the bottom each time, reads naturally, goes away by itself in about 4 seconds, and the button you tapped keeps keyboard focus.
- [ ] **A2. It gets out of the way.** Hover the toast (or Tab to its **Dismiss** button): it stays while held and goes when you leave or press Dismiss. It never covers the thing you need next.
- [ ] **A3. On a phone** (a real one if you can): the toast sits clear of the browser bar and the home indicator, its **Dismiss** is easy to hit with a thumb, and the text wraps without cutting off.
- [ ] **A4. Dark mode and reduced motion.** With your OS in dark mode the toast is readable. With "reduce motion" on, the toast simply appears (no slide).
- [ ] **A5. A failed tap.** Block `*/rsvp`, then tap an RSVP button: a toast in the app's voice ("Something went sideways on our end."), the buttons are as they were, and tapping again after unblocking works. Then tick **Offline** and tap: "Looks like you're offline."
- [ ] **A6. Hide.** On a brunch page, **Hide from my dashboard** toasts once ("Off your dashboard. Nobody else sees a change."). On the dashboard, hiding a row just moves the row (no toast).

## B. Inline lines (what you typed or chose)

- [ ] **B1. A vote that can't save.** With two people: the host closes voting while the second person has the page open; the second person ticks a box. The box rolls back, the line "Voting's closed on this one." sits beside the ballot, and the page updates to show voting is closed.
- [ ] **B2. An option that vanished.** The host removes a place while the second person has the page open; they tick it. The line says the option came off the table, and the list updates without it.
- [ ] **B3. A failed invite.** Block `*/invites`, type an address on a brunch page, press **Round up the crew**: the line appears beside the field and **your address is still there**. Unblock and send again: it goes.
- [ ] **B4. Add a time that fails.** On the manage page block `*/times`, add a time: the line shows beside the field and the time you picked is still there.
- [ ] **B5. The call-off dialog.** Block `*/cancel`, press **Call it off**, then confirm: the line shows **inside the dialog**, and **Nope, keep it** still works.
- [ ] **B6. Lock it in** with a brunch that changed under you (confirm it in a second tab, then press **Lock it in** in the first): "This one's already locked in." and the page updates.

## C. Waits (unchanged, should still feel right)

- [ ] **C1. Resend too soon.** Press **Resend** twice quickly: the second time the row shows "That one just went out. Give it N minutes." beside its button, with **no toast**.

## D. Things that used to fail without a word

- [ ] **D1. Invites that didn't go out.** In the creation wizard add a guest, block `*/invites` (not the create call), and press **Create Brunch**. You reach the brunch, and the Invites panel says "Your brunch is up, but the invites didn't go out. Add the addresses again below." Send one invite: the note goes.
- [ ] **D2. Place search.** Type in the place search while blocking `*/places/search`: a line says our end hiccuped. Unblock and keep typing: the line goes and results show. Type quickly several different words: you only ever see results for what is typed now.
- [ ] **D3. Copy link.** On the Invites list press **Copy link**: a "Link copied." toast, and the link really is on your clipboard.
- [ ] **D4. Session ends.** Open a brunch in one tab, sign out in another, then tap **I'm in** in the first: you land on sign-in, and the page says it will take you back. Sign in: you are back on that brunch.

## E. Words

- [ ] **E1.** Read the lines you met in A to D aloud. Do they sound like a friend in the group chat (warm, short, specific), with no "failed", "error" or corporate words, and nothing promised that doesn't happen? Note any you would change: `apps/web/src/lib/errorCopy.ts` (failures), `toastCopy.ts` (successes), `noticeCopy.ts`, `signInCopy.ts`.

## F. Screen reader (VoiceOver, NVDA or TalkBack)

- [ ] **F1.** Tap an RSVP button with the screen reader on: the toast text is announced politely **without** moving your focus, and you can reach **Dismiss** by navigating.
- [ ] **F2.** An inline error after a failed vote is announced as an alert; the call-off dialog's error is announced inside the dialog.

## Sign-off

| Tester | Date | Device and browser | Result (all ticked, or what is open) |
| ------ | ---- | ------------------ | ------------------------------------ |
|        |      |                    |                                      |

Anything you want changed goes back as a note on the item: wording changes are one-line edits in the copy files named in E1.

_Not covered by this spec:_ loading skeletons (deferred), live updates for what other people change, a retry button.
