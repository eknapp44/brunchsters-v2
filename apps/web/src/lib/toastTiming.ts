// How long a toast stays (spec 0014, ADR 0016). A failure stays longer: it carries something to act
// on, and it is read slower than a "you're in". A refusal that tells how long to wait (the "info"
// tone) is read like a success. Hover or focus holds any of them, so nothing is time-only.
export const SUCCESS_TOAST_MS = 4000;
export const ERROR_TOAST_MS = 8000;

export function toastDurationMs(tone: 'success' | 'error' | 'info'): number {
  return tone === 'error' ? ERROR_TOAST_MS : SUCCESS_TOAST_MS;
}
