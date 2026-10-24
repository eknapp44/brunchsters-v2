// Thrown inside a transaction when a brunch's status is no longer the one the caller read, so a
// conditional status update matched no row (another request changed it first). It rolls the
// transaction back and the service turns it into an `invalid_transition` result.
export class StaleStatusError extends Error {
  constructor() {
    super('The brunch changed status while this request was running');
    this.name = 'StaleStatusError';
  }
}
