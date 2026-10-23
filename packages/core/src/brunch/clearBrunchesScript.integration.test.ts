import { spawnSync } from 'node:child_process';
import { createDb } from '@brunchsters/database';
import { normalizeEmail, type BrunchId, type InviteToken, type UserId } from '@brunchsters/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NoopEventBus } from '../events/NoopEventBus';
import { respondToInvite } from '../invite/respondToInvite';
import { sendInvites } from '../invite/sendInvites';
import { createBrunch } from './createBrunch';
import { getBrunchesForUser } from './getBrunchesForUser';
import { InMemoryRateLimiter } from '../rateLimit/InMemoryRateLimiter';

// The developer script `pnpm db:clear-brunches` (packages/database/src/clearBrunches.ts), run for
// real against the local database with throwaway users. Requires: supabase start + seeded lookups.
const RUN_ID = Date.now();
const ME_EMAIL = normalizeEmail(`integration-clear-me-${RUN_ID}@example.com`);
const FRIEND_EMAIL = normalizeEmail(`integration-clear-friend-${RUN_ID}@example.com`);

const db = createDb();
const eventBus = new NoopEventBus();

let me: UserId;
let friend: UserId;
const createdBrunchIds: string[] = [];

function script(args: readonly string[], env: Record<string, string> = {}) {
  const result = spawnSync(
    'pnpm',
    ['--filter', '@brunchsters/database', 'run', 'clear-brunches', ...args],
    { encoding: 'utf-8', shell: true, env: { ...process.env, ...env } },
  );
  return { status: result.status, output: `${result.stdout}\n${result.stderr}` };
}

async function makeBrunch(title: string, hostId: UserId): Promise<BrunchId> {
  const created = await createBrunch({ title, hostId, locations: [], times: [] }, { db, eventBus });
  const id = created._unsafeUnwrap().id;
  createdBrunchIds.push(id);
  return id;
}

beforeAll(async () => {
  me = (await db.user.create({ data: { name: 'Clear Me', email: ME_EMAIL } })).id as UserId;
  friend = (await db.user.create({ data: { name: 'Clear Friend', email: FRIEND_EMAIL } }))
    .id as UserId;
});

afterAll(async () => {
  const brunchIds = { in: createdBrunchIds };
  await db.brunchAttendee.deleteMany({ where: { brunchId: brunchIds } });
  await db.brunchInvite.deleteMany({ where: { brunchId: brunchIds } });
  await db.brunch.deleteMany({ where: { id: brunchIds } });
  await db.user.deleteMany({ where: { email: { in: [ME_EMAIL, FRIEND_EMAIL] } } });
});

// Two brunches I host, and one my friend hosts that I attend.
async function setUp(): Promise<{ mine: BrunchId[]; theirs: BrunchId }> {
  const mine = [
    await makeBrunch('My Test Brunch One', me),
    await makeBrunch('My Test Brunch Two', me),
  ];
  const theirs = await makeBrunch('Friend Test Brunch', friend);
  await sendInvites(
    { brunchId: theirs, invitedById: friend, emails: [ME_EMAIL] },
    { rateLimiter: new InMemoryRateLimiter(), db, eventBus },
  );
  const invite = await db.brunchInvite.findFirst({
    where: { brunchId: theirs, invitedEmail: ME_EMAIL },
  });
  if (invite === null) throw new Error('invite missing');
  await respondToInvite(
    { token: invite.token as InviteToken, viewerId: me, response: 'yes' },
    { db, eventBus },
  );
  return { mine, theirs };
}

const titlesFor = async (userId: UserId): Promise<string[]> =>
  (await getBrunchesForUser({ userId }, { db })).map((b) => b.title).sort();

describe('pnpm db:clear-brunches (integration — real Postgres)', () => {
  it('a dry run lists what it would clear and changes nothing', async () => {
    await setUp();
    const before = await titlesFor(me);

    const result = script([ME_EMAIL]);

    expect(result.status).toBe(0);
    expect(result.output).toContain('hosts 2 brunch');
    expect(result.output).toContain('My Test Brunch One');
    expect(result.output).toContain('Friend Test Brunch');
    expect(result.output).toContain('Dry run');
    expect(await titlesFor(me)).toEqual(before);
  });

  it('--apply clears the brunches I host for everyone and my place in the ones I attend for me alone', async () => {
    const { theirs } = await setUp();
    expect((await titlesFor(me)).length).toBeGreaterThanOrEqual(3);

    const result = script([ME_EMAIL, '--apply']);

    expect(result.status).toBe(0);
    expect(result.output).toContain('Cleared');
    expect(await titlesFor(me)).toEqual([]);
    // My friend's own brunch is still theirs; only my place in it went.
    expect(await titlesFor(friend)).toContain('Friend Test Brunch');
    const stillThere = await db.brunch.findFirst({ where: { id: theirs } });
    expect(stillThere).not.toBeNull();
  });

  it('says so, and exits with an error, for an email that is nobody', async () => {
    const result = script(['nobody-here@example.com', '--apply']);
    expect(result.status).not.toBe(0);
    expect(result.output).toContain('No user with the email');
  });

  it('refuses to run against a database that is not local, before it connects', async () => {
    const result = script([ME_EMAIL, '--apply'], {
      DATABASE_URL: 'postgresql://postgres:secret@db.example.com:5432/postgres',
    });
    expect(result.status).not.toBe(0);
    expect(result.output).toContain('Refusing to run');
  });

  it('asks for an email when it is given none', async () => {
    const result = script([]);
    expect(result.status).not.toBe(0);
    expect(result.output).toContain('Usage: pnpm db:clear-brunches');
  });
});
