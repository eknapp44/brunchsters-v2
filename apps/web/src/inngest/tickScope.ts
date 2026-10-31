import { NonRetriableError } from 'inngest';
import { z } from 'zod';

const tickScopeSchema = z.object({ brunchId: z.uuid().optional() });

// Which brunch a scheduler run is about (spec 0015 M7). A cron run carries no data and covers every
// brunch; a `scheduler/tick` event may name one. A payload that is not understood is refused, never
// read as "no brunch named": a tick meant for one brunch must not quietly become a run over all of
// them (the journeys rely on a tick not touching anyone else's brunch).
export function readTickScope(data: unknown): { readonly brunchId: string | undefined } {
  const parsed = tickScopeSchema.safeParse(data ?? {});
  if (!parsed.success) {
    throw new NonRetriableError(`Malformed scheduler tick: ${parsed.error.message}`);
  }
  return { brunchId: parsed.data.brunchId };
}
