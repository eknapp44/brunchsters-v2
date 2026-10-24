// What a toast says when something worked (spec 0014). Short, warm, and only where the page change
// is subtle: the RSVP buttons change their look, which a screen reader hears nothing of. In the
// Brand Voice (`docs/voice-and-copy.md`): friend, not service, so no "successfully" and no "saved
// your RSVP". Failures are in `errorCopy.ts`.

export type RsvpAnswer = 'yes' | 'maybe' | 'no';

const RSVP_TOASTS: Readonly<Record<RsvpAnswer, string>> = {
  yes: "You're in. See you there.",
  maybe: 'Maybe it is. You can change it any time.',
  no: "Got it, you can't make it.",
};

export function rsvpToast(answer: RsvpAnswer): string {
  return RSVP_TOASTS[answer];
}
