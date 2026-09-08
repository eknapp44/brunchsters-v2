// Thrown inside a transaction to abort it when a lookup-table row a service
// depends on is missing (e.g. a bad seed). Mapped to a typed Err by the caller.
export class LookupNotFoundError extends Error {
  constructor(readonly code: string) {
    super(`Lookup row not found: ${code}`);
  }
}
