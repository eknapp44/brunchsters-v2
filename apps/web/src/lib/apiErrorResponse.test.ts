import { describe, expect, it } from 'vitest';
import { apiError } from './apiErrorResponse';

describe('apiError', () => {
  it('answers with the status and a body that carries the code and the message', async () => {
    const response = apiError({ code: 'not_found', status: 404, message: 'Brunch not found' });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { code: 'not_found', message: 'Brunch not found' },
    });
  });

  it('accepts every status a code is listed with', () => {
    expect(apiError({ code: 'invalid', status: 400, message: 'x' }).status).toBe(400);
    expect(apiError({ code: 'invalid', status: 422, message: 'x' }).status).toBe(422);
    expect(apiError({ code: 'unavailable', status: 502, message: 'x' }).status).toBe(502);
  });

  it('refuses a code sent with a status it is not listed with', () => {
    expect(() => apiError({ code: 'not_found', status: 403, message: 'x' })).toThrow(
      /"not_found" cannot be sent with 403/,
    );
    expect(() => apiError({ code: 'internal', status: 409, message: 'x' })).toThrow();
  });
});
