import { expect, type APIResponse } from '@playwright/test';

// For the limit journeys (spec 0012): keep asking until the server says 429.
//
// - A window is fixed on the clock, so a run of requests can straddle a minute boundary and the
//   refusal come later than the limit says. It keeps going until the first refusal (the most a
//   straddle can add is one more window's worth) instead of asserting an exact request number, and
//   asserts that the refusal did not come early: at least `limit` requests (counting any the
//   caller made before) were answered first.
// - The requests go out in parallel batches. The counter is atomic, so order does not matter, and
//   sixty or a hundred and thirty sequential requests through a busy dev server run past a test's
//   time limit.
export async function untilRefused(params: {
  readonly limit: number;
  readonly attempt: (index: number) => Promise<APIResponse>;
  // What an answered (not refused) request must look like.
  readonly expectedUntilThen: (response: APIResponse) => void;
  readonly batchSize?: number;
  // Requests the same caller already made in this window before the loop (a contrast check, say).
  readonly alreadySpent?: number;
}): Promise<{ readonly refused: APIResponse; readonly answered: number }> {
  const batchSize = params.batchSize ?? 5;
  const most = params.limit * 2 + batchSize;
  let sent = 0;
  let answered = 0;
  let refused: APIResponse | undefined;

  while (sent < most && refused === undefined) {
    const batch = await Promise.all(
      Array.from({ length: batchSize }, (_, offset) => params.attempt(sent + offset)),
    );
    sent += batchSize;
    for (const response of batch) {
      if (response.status() === 429) {
        refused ??= response;
      } else {
        params.expectedUntilThen(response);
        answered += 1;
      }
    }
  }

  expect(refused, `never refused after ${sent} requests`).toBeDefined();
  expect(
    answered + (params.alreadySpent ?? 0),
    'the refusal came before the limit was reached',
  ).toBeGreaterThanOrEqual(params.limit);
  if (refused === undefined) throw new Error('unreachable: asserted above');
  return { refused, answered };
}

// The server's windows are fixed on the clock (epoch-aligned, so a one-minute window ends at the
// start of a wall-clock minute). A journey that exhausts a budget and then checks that the person
// is *still* refused would fail if the minute rolled over in between. Call this first: it waits
// for the next window when too little of the current one is left, so the whole segment (the loop
// and what follows it) runs inside one window. It waits on a clock boundary, not on a condition,
// which is the one place a fixed wait is the right tool. On average it costs a few seconds.
export async function alignToWindow(params: {
  readonly windowSeconds: number;
  readonly needSeconds: number;
}): Promise<void> {
  const windowMs = params.windowSeconds * 1000;
  const leftMs = windowMs - (Date.now() % windowMs);
  if (leftMs < params.needSeconds * 1000) {
    await new Promise((resolve) => setTimeout(resolve, leftMs + 250));
  }
}
