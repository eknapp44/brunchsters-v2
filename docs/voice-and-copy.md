# Voice and copy

The working reference for every string a person reads in Brunchsters (screens, dialogs, emails, errors). Distilled on 2026-10-24 from `design-docs/Brand Voice.html` (the voice) and `design-docs/Copy Pass.html` (the line-by-line rewrites), with examples from copy that shipped. Those two files stay the source art and the place to see the voice in full; **this file is the one to read before writing or changing a string**, and to add to when a new pattern appears.

## The voice in one sentence

We sound like the friend who is already in the group chat, hyping the brunch: wholesomely excited, never overbearing, lightly funny when it earns the moment, and useful first. Always more warm than corporate, more conversational than stoic, more specifically-about-brunch than generic.

## Rules

1. **Verbs over nouns.** The action you would say out loud: "Round up the crew", not "Invite Attendees"; "Call it off", not "Cancel brunch".
2. **Specific beats generic.** "Tartine's up by 2", not "Tartine is leading by 2 votes". Carry the title or the person through.
3. **Friend, not service.** Friends do not say "successfully" or "No further action required". "Brunch on. 💕".
4. **No corporate words.** Avoid: attendees, event, leverage, utilize, reach out, community, engage, action required, touch base, circle back, connect, successfully, and the empty "awesome!" / "amazing!". Reach for: brunch, crew, gang, round up, round two, bringing back, hang, spot, grab, in / out, on the table, brunch on, no stress.
5. **Trust the user.** If the button says "Save it", do not also narrate that they can save. Short, decisive: "Pick a spot", not "Choose a location".
6. **Emoji at moments, not in labels that carry state.** Greetings, celebrations, the empty state. An emoji is always `aria-hidden`, so the accessible name is the words ("I'm in", not "🙌 I'm in").
7. **Do not promise what the app does not do.** No "we'll try again" without a retry, no "we'll let everyone know right away" when the email waits a few minutes. Say the true thing in the friend's voice: "...in a few minutes. Change your mind before then and nobody hears a thing."
8. **Do not leak.** A 404 says "This table's empty." and nothing more: never "brunch", "private", or why. An invite link to a brunch you cannot join shows only the host, the title and the description.
9. **Clarity beats cleverness when an action is destructive or two controls sit side by side.** "Close voting" (not "Call it") beside "Call it off": two names must not be a substring of each other (`getByRole` matches substrings, so a journey could not tell them apart either). "Delete this draft" and "Delete this brunch" say what goes.

## Patterns, with shipped examples

| Moment              | Pattern                                                                                                                | Shipped example                                                                                                                                                                                                                       |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Success             | Short, warm, rewards the moment                                                                                        | "Brunch on. 💕" · "Locked in"                                                                                                                                                                                                         |
| RSVP / question     | A question, two words                                                                                                  | "You in?" · "Where to?" · "When?"                                                                                                                                                                                                     |
| Empty state         | Inviting, not lonely, always a verb out                                                                                | "The table's set. Now invite some people."                                                                                                                                                                                            |
| Confirm dialog      | Title is the action as a question; body says what happens and what is reversible; the safe button is first and says so | `Calling off "{title}"?` · "We'll let the 5 folks who said yes, maybe, or hadn't said yet know, in a few minutes. Change your mind before then and nobody hears a thing." · "Nope, keep it" / "Call it off" · "Keep it" / "Delete it" |
| Called off (member) | Gentle, low-stakes                                                                                                     | "Called off." · "{Host} called this one off. No worries — these things happen."                                                                                                                                                       |
| A wait              | Name the reason, say when, no scolding                                                                                 | "That's a lot of called-off brunches for one day. Try again in {the time left}." · "People are still being told it was called off. Delete comes back in a few minutes."                                                               |
| Nudge               | Friend-tap, specific, easy to ignore                                                                                   | "Most of the crew has voted — close voting now if you're ready."                                                                                                                                                                      |
| Roster / status     | Describe the person or the moment, not the system                                                                      | "Hasn't said yet" · "Open for votes" · "In the works"                                                                                                                                                                                 |
| Email subject       | The friend telling you                                                                                                 | "{Host} wants you at brunch 🥂" · "{Host} called off {title}" · "{title} is back on 🥂"                                                                                                                                               |
| Refusal (403)       | Say whose it is                                                                                                        | "That one's the host's."                                                                                                                                                                                                              |
| Not found (404)     | Say nothing about what was looked for                                                                                  | "This table's empty."                                                                                                                                                                                                                 |

## Where the app departs from the brand voice doc, on purpose

- The voice doc's error line, "Couldn't send that just now. We'll try again — your tap stuck.", promises a retry the app does not make (rule 7). **Error wording is not settled yet**: the controls show generic placeholders ("Failed to call it off") that are not in voice, and the feedback-surfaces spec is where real error and toast copy is written. Add its patterns here when it lands.
- The voice doc's cancellation line carries the host's reason ("said next month for sure"). The app has no reason note yet (`docs/BACKLOG.md`, "Lifecycle deferrals"), so the email does not either.
- "Call it" as the close-voting button was adopted in spec 0011 and replaced by "Close voting" in spec 0013 (rule 9).

## Where strings live

- A feature's user-facing strings go in a pure, unit-tested `apps/web/src/lib/*Copy.ts` module (`lifecycleCopy`, `limitedCopy`, `brunchCopy`), not inline in a component, so a journey names them in one place and a wording change is one edit. Some inline text predates this (labels in a few components); move it when you touch it.
- Email copy is in `packages/core/src/email/templates/`; every interpolated value goes through `escapeHtml`.
- A renamed button, link, label or heading is a journey change and is logged in `docs/accessible-names.md`.
- A copy table per spec (what was adopted, extrapolated, deliberately not adopted) lives in that spec's `plan.md` (see spec 0011's and 0013's).

## Not enforced yet

Visual style is enforced (tokens, a build-failing guard against colour literals, a contrast test). Voice is not: nothing fails on a banned word. A test that scans the copy modules and JSX text for the banned words in rule 4, with a small allowlist, is planned as the first milestone of the feedback-surfaces spec, which writes the most new copy.
