import { createDb } from '@brunchsters/database';
import type { UserId } from '@brunchsters/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NoopEventBus } from '../events/NoopEventBus';
import { createBrunch } from './createBrunch';

// The lifecycle columns of spec 0013 (M1): they exist, start empty, and hold what the services of
// the next milestones will write. Requires: supabase start + seeded lookup tables (pnpm db:seed).
const RUN_ID = Date.now();
const HOST_EMAIL = `integration-lifecycle-host-${RUN_ID}@example.com`;

const db = createDb();

let hostId: UserId;
let brunchId: string;

beforeAll(async () => {
  const host = await db.user.create({ data: { name: 'Lifecycle Host', email: HOST_EMAIL } });
  hostId = host.id as UserId;
  const created = await createBrunch(
    { title: 'Lifecycle columns', locations: [], times: [], hostId },
    { db, eventBus: new NoopEventBus() },
  );
  brunchId = created._unsafeUnwrap().id;
});

afterAll(async () => {
  await db.brunchAttendee.deleteMany({ where: { brunchId } });
  await db.brunchInvite.deleteMany({ where: { brunchId } });
  await db.brunch.deleteMany({ where: { id: brunchId } });
  await db.user.deleteMany({ where: { email: HOST_EMAIL } });
});

describe('brunch lifecycle columns (integration — real Postgres)', () => {
  it('starts a new brunch with no cancellation recorded', async () => {
    const brunch = await db.brunch.findFirst({ where: { id: brunchId } });

    expect(brunch?.cancelledAt).toBeNull();
    expect(brunch?.cancelledBy).toBeNull();
    expect(brunch?.statusBeforeCancelId).toBeNull();
    expect(brunch?.cancelNoticeSentAt).toBeNull();
  });

  it('keeps the status a brunch had before it was called off, as a real status', async () => {
    const [draft, cancelled] = await Promise.all([
      db.brunchStatus.findFirstOrThrow({ where: { code: 'draft' } }),
      db.brunchStatus.findFirstOrThrow({ where: { code: 'cancelled' } }),
    ]);
    const cancelledAt = new Date();

    await db.brunch.update({
      where: { id: brunchId },
      data: {
        statusId: cancelled.id,
        statusBeforeCancelId: draft.id,
        cancelledAt,
        cancelledBy: hostId,
      },
    });
    const brunch = await db.brunch.findFirst({
      where: { id: brunchId },
      include: { status: true, statusBeforeCancel: true },
    });

    expect(brunch?.status.code).toBe('cancelled');
    expect(brunch?.statusBeforeCancel?.code).toBe('draft');
    expect(brunch?.cancelledAt?.getTime()).toBe(cancelledAt.getTime());
    expect(brunch?.cancelledBy).toBe(hostId);

    // Put it back so nothing else this file does depends on the order.
    await db.brunch.update({
      where: { id: brunchId },
      data: {
        statusId: draft.id,
        statusBeforeCancelId: null,
        cancelledAt: null,
        cancelledBy: null,
      },
    });
  });

  it('starts every attendee visible, and hiding is stored on that attendee alone', async () => {
    const attendee = await db.brunchAttendee.findFirstOrThrow({ where: { brunchId } });
    expect(attendee.hiddenAt).toBeNull();

    const hiddenAt = new Date();
    await db.brunchAttendee.update({ where: { id: attendee.id }, data: { hiddenAt } });
    const hidden = await db.brunchAttendee.findFirstOrThrow({ where: { id: attendee.id } });
    const brunch = await db.brunch.findFirst({ where: { id: brunchId } });

    expect(hidden.hiddenAt?.getTime()).toBe(hiddenAt.getTime());
    // Hiding is a fact about a person's dashboard, never about the brunch.
    expect(brunch?.deletedAt).toBeNull();
    expect(brunch?.archivedAt).toBeNull();
  });
});
