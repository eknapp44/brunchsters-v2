// The words of the brunch lifecycle screens (spec 0013): calling a brunch off, bringing it back,
// deleting it. In the Brand Voice (`design-docs/Brand Voice.html`, the Copy Pass: "Calling off
// ...?", "Nope, keep it / Call it off", "We'll let the 5 folks who said yes, maybe, or hadn't said
// yet know"): what a friend would say, with nothing the app does not do. In particular the called-off
// email is not instant (it waits a few minutes so the host can change their mind), and the dialog
// says so. Pure functions, so the strings are unit-tested and a journey names them in one place.

export type Dialog = {
  readonly title: string;
  readonly body: string;
  readonly confirmLabel: string;
  readonly cancelLabel: string;
};

export function callOffDialog(params: {
  readonly title: string;
  // how many people the called-off email will reach (the host is not one of them)
  readonly audience: number;
}): Dialog {
  const { audience } = params;
  const body =
    audience === 0
      ? "Nobody else is in on it yet, so there's no one to tell."
      : `We'll let the ${audience} ${audience === 1 ? 'person' : 'folks'} who said yes, maybe, or hadn't said yet know, in a few minutes. Change your mind before then and nobody hears a thing.`;
  return {
    title: `Calling off "${params.title}"?`,
    body,
    confirmLabel: 'Call it off',
    cancelLabel: 'Nope, keep it',
  };
}

export function deleteDialog(params: {
  readonly title: string;
  readonly isDraft: boolean;
}): Dialog {
  return {
    title: `Delete "${params.title}"?`,
    body: params.isDraft
      ? "It was only a draft, so nobody will miss it. This can't be undone from here."
      : "It leaves everyone's dashboard for good. This can't be undone from here.",
    confirmLabel: 'Delete it',
    cancelLabel: 'Keep it',
  };
}

// While a called-off brunch's guests have not been told yet, Delete waits (spec 0013, ADR 0015).
export const DELETE_WAIT_MESSAGE =
  'People are still being told it was called off. Delete comes back in a few minutes.';

// The policy name a Delete wait carries; it is not a rate limit, only a label for `useWait`.
export const DELETE_WAIT_POLICY = 'delete-after-notice';

export const CALLED_OFF_HEADING = 'Called off.';

export function calledOffLine(params: {
  readonly isHost: boolean;
  readonly hostName: string;
}): string {
  return params.isHost
    ? 'You called this one off. Bring it back from Manage brunch and everything is just as you left it.'
    : `${params.hostName} called this one off. No worries — these things happen.`;
}

// The invite page, for a link to a brunch that was called off. The holder already knows the title
// and the host (the preview shows both); this is only the news.
export function calledOffInvite(params: { readonly hostName: string; readonly title: string }): {
  readonly heading: string;
  readonly line: string;
} {
  return {
    heading: `${params.hostName} called this one off.`,
    line: `${params.title} is off, so there's nothing to RSVP to.`,
  };
}

export const OVER_HEADING = 'Over.';

export function overLine(params: { readonly isHost: boolean }): string {
  return params.isHost
    ? 'This one has come and gone, so there is nothing left to change. Thanks for hosting.'
    : 'This one has come and gone. Hope it was a good one.';
}

// The invite page, for a link to a brunch that already happened.
export function overInvite(params: { readonly hostName: string; readonly title: string }): {
  readonly heading: string;
  readonly line: string;
} {
  return {
    heading: `${params.title} already happened.`,
    line: `Catch ${params.hostName} for the next one.`,
  };
}

export const HIDE_LABEL = 'Hide from my dashboard';
export const UNHIDE_LABEL = 'Unhide';
export const HIDDEN_LINE = 'Hidden from your dashboard. Nobody else sees a change.';
export const HIDE_LINE = 'Takes it off your dashboard. Nobody else sees a change.';
