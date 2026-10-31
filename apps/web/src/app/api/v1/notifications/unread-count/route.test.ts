import { err, ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as BrunchstersCore from '@brunchsters/core';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@brunchsters/core', async (importOriginal) => {
  const actual = await importOriginal<typeof BrunchstersCore>();
  return { ...actual, countUnread: vi.fn() };
});

import { countUnread } from '@brunchsters/core';
import { auth } from '@/auth';
import { GET } from './route';

const mockAuth = vi.mocked(auth as unknown as () => Promise<unknown>);
const mockCountUnread = vi.mocked(countUnread);

beforeEach(() => {
  vi.resetAllMocks();
});

describe('GET /api/v1/notifications/unread-count', () => {
  it('answers 401 with a code when signed out', async () => {
    mockAuth.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe('signed_out');
    expect(mockCountUnread).not.toHaveBeenCalled();
  });

  it("counts the signed-in person's unread notifications and is never cached", async () => {
    mockAuth.mockResolvedValue({ user: { id: 'signed-in-user-uuid' } });
    mockCountUnread.mockResolvedValue(ok(3));

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ count: 3 });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(mockCountUnread).toHaveBeenCalledWith(
      { userId: 'signed-in-user-uuid' },
      expect.anything(),
    );
  });

  it('answers 500 with a code when the database fails', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'signed-in-user-uuid' } });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockCountUnread.mockResolvedValue(err({ kind: 'db_error', cause: new Error('down') }));

    const response = await GET();

    expect(response.status).toBe(500);
    expect((await response.json()).error.code).toBe('internal');
  });
});
