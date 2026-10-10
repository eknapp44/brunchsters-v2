// Thrown inside a transaction to abort it when a remaining-option count,
// re-checked under a row lock, turns out to be the last one after all —
// see removeLocation.ts / removeTime.ts. Mapped to a typed Err by the caller.
export class LastOptionError extends Error {
  constructor() {
    super('Cannot remove the last remaining option');
  }
}
