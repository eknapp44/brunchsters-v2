import { assertCanTransition } from '../guards/brunchTransitions';
import { isPastBrunch } from './isPastBrunch';

// Whether the host is offered "Call it off" (spec 0013, ADR 0015): the status table lets the brunch
// move to `cancelled` (an active or confirmed brunch; a draft is only deleted, and one already
// called off cannot be called off again) and it has not already happened (a confirmed brunch whose
// time has passed). The same two checks `cancelBrunch` makes, written once for the screen so a
// component never decides this itself (ADR 0012). Pure: `now` is a parameter.
export function canCallOff(params: {
  readonly statusCode: string;
  // the confirmed time; undefined until the host confirms
  readonly scheduledAt: Date | undefined;
  readonly now: Date;
}): boolean {
  return (
    assertCanTransition({ from: params.statusCode, to: 'cancelled' }).isOk() &&
    !isPastBrunch({ statusCode: params.statusCode, scheduledAt: params.scheduledAt }, params.now)
  );
}
