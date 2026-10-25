import { describe, expect, it } from 'vitest';
import { readApiError } from './readApiError';

function json(body: unknown, status: number, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

describe('readApiError', () => {
  it('reads the code a route sent', async () => {
    const result = await readApiError(
      json({ error: { code: 'brunch_called_off', message: 'This brunch was called off' } }, 409),
    );
    expect(result).toEqual({ code: 'brunch_called_off', rateLimit: undefined });
  });

  it('reads a 429 as its wait, from the body the limiter sends', async () => {
    const result = await readApiError(
      json({ error: 'Too many requests', policy: 'resend-per-invite', retryAfterSeconds: 42 }, 429),
    );
    expect(result).toEqual({
      code: 'rate_limited',
      rateLimit: { policy: 'resend-per-invite', retryAfterSeconds: 42 },
    });
  });

  it('falls back by status for the old shapes, so an unmigrated route still reads right', async () => {
    expect((await readApiError(json({ error: 'Only the host can confirm' }, 403))).code).toBe(
      'forbidden',
    );
    expect((await readApiError(json({ errors: [{ message: 'bad' }] }, 422))).code).toBe('invalid');
    expect((await readApiError(json({ error: 'The brunch changed. Try again.' }, 409))).code).toBe(
      'brunch_changed',
    );
    expect((await readApiError(json({ error: 'Unauthorized' }, 401))).code).toBe('signed_out');
    expect((await readApiError(json({ error: 'Place search unavailable' }, 502))).code).toBe(
      'unavailable',
    );
    expect((await readApiError(json({ error: 'Failed to confirm brunch' }, 500))).code).toBe(
      'internal',
    );
  });

  it('falls back by status for a body that is not JSON or is empty', async () => {
    expect(
      (await readApiError(new Response('<html>Bad gateway</html>', { status: 502 }))).code,
    ).toBe('unavailable');
    expect((await readApiError(new Response(null, { status: 500 }))).code).toBe('internal');
  });

  it('ignores a code this app does not know, or one sent with the wrong status', async () => {
    expect((await readApiError(json({ error: { code: 'made_up', message: 'x' } }, 409))).code).toBe(
      'brunch_changed',
    );
    // `not_found` belongs to 404; sent with a 500 it is not believed.
    expect(
      (await readApiError(json({ error: { code: 'not_found', message: 'x' } }, 500))).code,
    ).toBe('internal');
  });

  it('says not_found for every 404, whatever the body, except a member-only code', async () => {
    const plain = await readApiError(
      json({ error: { code: 'not_found', message: 'Brunch not found' } }, 404),
    );
    const odd = await readApiError(json({ error: 'Suggestion not found' }, 404));
    const empty = await readApiError(new Response(null, { status: 404 }));
    expect(plain).toEqual(odd);
    expect(plain).toEqual(empty);
    expect(plain.code).toBe('not_found');

    const gone = await readApiError(
      json({ error: { code: 'option_gone', message: 'Unknown option' } }, 404),
    );
    expect(gone.code).toBe('option_gone');
  });

  it('never takes its words from the body', async () => {
    const result = await readApiError(
      json({ error: { code: 'forbidden', message: 'Secret: the host is Dana' } }, 403),
    );
    expect(JSON.stringify(result)).not.toContain('Dana');
  });
});
