import { createDb } from '@brunchsters/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Requires: supabase start + seeded lookup tables (pnpm db:seed) + the normalize_emails migration.
//
// ADR 0008: application code normalizes addresses at the boundary, and the database refuses
// anything else, so a code path that forgets fails loudly here instead of quietly creating a
// duplicate person. These write mixed-case addresses directly, bypassing normalizeEmail, on purpose.
const RUN_ID = Date.now();
const db = createDb();

let hostId: string;
let brunchId: string;
const cleanup = { userEmails: [`integration-constraints-host-${RUN_ID}@example.com`] };

beforeAll(async () => {
  const host = await db.user.create({
    data: { name: 'Constraint Host', email: cleanup.userEmails[0] ?? '' },
  });
  hostId = host.id;
  const status = await db.brunchStatus.findFirst({ where: { code: 'active' } });
  const brunch = await db.brunch.create({
    data: { title: 'constraints', hostId, statusId: status?.id ?? '' },
  });
  brunchId = brunch.id;
});

afterAll(async () => {
  await db.brunchInviteSuggestion.deleteMany({ where: { brunchId } });
  await db.brunchInvite.deleteMany({ where: { brunchId } });
  await db.brunch.deleteMany({ where: { id: brunchId } });
  await db.userAuthProvider.deleteMany({ where: { userId: hostId } });
  await db.user.deleteMany({ where: { email: { in: cleanup.userEmails } } });
});

describe('email check constraints (integration — real Postgres)', () => {
  it('refuses a mixed-case or padded user address', async () => {
    await expect(
      db.user.create({ data: { name: 'Mixed', email: `Mixed-${RUN_ID}@Example.com` } }),
    ).rejects.toThrow(/User_email_normalized/);
    await expect(
      db.user.create({ data: { name: 'Padded', email: ` padded-${RUN_ID}@example.com` } }),
    ).rejects.toThrow(/User_email_normalized/);
  });

  it('refuses a mixed-case provider address', async () => {
    await expect(
      db.userAuthProvider.create({
        data: {
          userId: hostId,
          provider: 'google',
          providerUserId: `constraint-${RUN_ID}`,
          email: `Mixed-${RUN_ID}@Example.com`,
        },
      }),
    ).rejects.toThrow(/UserAuthProvider_email_normalized/);
  });

  it('refuses a mixed-case invited address', async () => {
    await expect(
      db.brunchInvite.create({
        data: {
          brunchId,
          invitedEmail: `Guest-${RUN_ID}@Example.com`,
          invitedById: hostId,
          token: `constraint-token-${RUN_ID}`,
          tokenExpiresAt: new Date(Date.now() + 86_400_000),
        },
      }),
    ).rejects.toThrow(/BrunchInvite_invitedEmail_normalized/);
  });

  it('refuses a mixed-case suggested address', async () => {
    const pending = await db.brunchInviteSuggestionStatus.findFirst({ where: { code: 'pending' } });
    await expect(
      db.brunchInviteSuggestion.create({
        data: {
          brunchId,
          suggestedById: hostId,
          suggestedEmail: `Friend-${RUN_ID}@Example.com`,
          statusId: pending?.id ?? '',
        },
      }),
    ).rejects.toThrow(/BrunchInviteSuggestion_suggestedEmail_normalized/);
  });

  it('still accepts a canonical address', async () => {
    const canonical = `integration-constraints-ok-${RUN_ID}@example.com`;
    const created = await db.user.create({ data: { name: 'Canonical', email: canonical } });

    expect(created.email).toBe(canonical);
    cleanup.userEmails.push(canonical);
  });
});
