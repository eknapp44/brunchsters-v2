// Fixed windows aligned to the Unix epoch, so every process agrees on where a window starts and
// two requests in the same window always meet in the same counter row.
type WindowParams = { readonly now: Date; readonly windowSeconds: number };

export function windowStartFor(params: WindowParams): Date {
  const windowMs = params.windowSeconds * 1000;
  return new Date(Math.floor(params.now.getTime() / windowMs) * windowMs);
}

// Whole seconds until the counter starts again, rounded up and never less than 1, so a caller
// told to wait is never told to wait zero.
export function secondsUntilWindowEnd(params: WindowParams): number {
  const windowEndMs = windowStartFor(params).getTime() + params.windowSeconds * 1000;
  return Math.max(1, Math.ceil((windowEndMs - params.now.getTime()) / 1000));
}
