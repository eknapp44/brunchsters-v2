import { vi } from 'vitest';

// Route handler tests never reach a database, so the part of the rate limits that counts
// (`src/lib/rateLimit.ts`) is stubbed for all of them to "go ahead". A test that cares about a
// refusal says so: `vi.mocked(enforceWriteLimit).mockResolvedValue(rateLimitedResponse(...))`.
// The module's own test turns this off with `vi.unmock`, and the end-to-end journeys use the real
// counters. The pure half (`rateLimitHttp.ts`: the 429 and the address) is not stubbed.
vi.mock('@/lib/rateLimit', () => ({
  enforceLimit: vi.fn(() => Promise.resolve(undefined)),
  enforceWriteLimit: vi.fn(() => Promise.resolve(undefined)),
}));
