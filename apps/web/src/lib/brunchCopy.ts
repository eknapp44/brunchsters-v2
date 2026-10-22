// The words a brunch's status goes by on the dashboard (the Copy Pass: "Open for votes", "In the
// works"). A display mapping, not a change to the status lookup table: the brunch page keeps the
// lookup label, which the e2e suite and the exact-text rule depend on (ADR 0012).
//
// Every seeded status code needs an entry, either the wording or `lookup` (the lookup label is
// the wording on purpose); brunchCopy.test.ts fails when a new code is seeded without a decision.

type Wording = { readonly kind: 'copy'; readonly text: string } | { readonly kind: 'lookup' };

const copy = (text: string): Wording => ({ kind: 'copy', text });
const LOOKUP: Wording = { kind: 'lookup' };

export const DASHBOARD_STATUS_WORDING: Readonly<Record<string, Wording>> = {
  draft: copy('In the works'),
  active: copy('Open for votes'),
  confirmed: copy('Confirmed'),
  brunching: LOOKUP,
  paying: LOOKUP,
  completed: LOOKUP,
  cancelled: LOOKUP,
  archived: LOOKUP,
};

export function dashboardStatusLabel(params: {
  readonly code: string;
  readonly lookupLabel: string;
}): string {
  const wording = DASHBOARD_STATUS_WORDING[params.code];
  return wording?.kind === 'copy' ? wording.text : params.lookupLabel;
}
