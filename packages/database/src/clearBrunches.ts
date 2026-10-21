import fs from 'node:fs';
import path from 'node:path';
import { createDb } from './middleware';

// A developer tool, not part of the app: clears one person's test brunches out of the LOCAL
// database so their dashboard is empty again.
//
//   pnpm db:clear-brunches you@example.com           (shows what it would do; changes nothing)
//   pnpm db:clear-brunches you@example.com --apply   (does it)
//
// It soft-deletes (sets deletedAt, the app's default for major entities), so nothing is lost and
// a row can be brought back by clearing its deletedAt:
//   - every brunch the person HOSTS (it disappears for everyone in it, which is what you want for
//     your own test brunches), and
//   - the person's own place in brunches they only ATTEND (it disappears for them alone).
// It refuses to run against anything but a local database.

const LOCAL_HOSTS: ReadonlySet<string> = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);

// DATABASE_URL from the environment, else from packages/database/.env (where `pnpm db:seed` and
// the integration tests read it from too).
function databaseUrl(): string | undefined {
  const fromEnv = process.env.DATABASE_URL;
  if (fromEnv !== undefined && fromEnv !== '') return fromEnv;
  try {
    const content = fs.readFileSync(path.resolve(__dirname, '../.env'), 'utf-8');
    for (const line of content.split('\n')) {
      const match = /^DATABASE_URL=(.*)$/.exec(line.trim());
      if (match?.[1] !== undefined) return match[1].replace(/^["']|["']$/g, '').trim();
    }
  } catch {
    // no .env file: handled by the caller
  }
  return undefined;
}

function parseArguments(argv: readonly string[]): { email: string | undefined; apply: boolean } {
  const words = argv.filter((word) => !word.startsWith('--'));
  return { email: words[0]?.trim().toLowerCase(), apply: argv.includes('--apply') };
}

async function main(): Promise<void> {
  const { email, apply } = parseArguments(process.argv.slice(2));
  if (email === undefined || email === '') {
    console.error('Usage: pnpm db:clear-brunches <email> [--apply]');
    process.exitCode = 1;
    return;
  }

  const url = databaseUrl();
  if (url === undefined) {
    console.error('No DATABASE_URL (set it, or put it in packages/database/.env).');
    process.exitCode = 1;
    return;
  }
  const host = new URL(url).hostname;
  if (!LOCAL_HOSTS.has(host)) {
    console.error(`Refusing to run: the database host is "${host}", not a local one.`);
    process.exitCode = 1;
    return;
  }
  process.env.DATABASE_URL = url;

  const db = createDb();
  try {
    // findFirst skips soft-deleted users, like every other read of a User.
    const user = await db.user.findFirst({ where: { email }, select: { id: true, name: true } });
    if (user === null) {
      console.error(`No user with the email ${email}.`);
      process.exitCode = 1;
      return;
    }

    const hosted = await db.brunch.findMany({
      where: { hostId: user.id },
      select: { id: true, title: true },
      orderBy: { createdAt: 'desc' },
    });
    const attended = await db.brunchAttendee.findMany({
      where: { userId: user.id, brunch: { deletedAt: null, hostId: { not: user.id } } },
      select: { id: true, brunch: { select: { title: true } } },
    });

    console.log(`${user.name} <${email}>`);
    console.log(`  hosts ${hosted.length} brunch(es)${hosted.length > 0 ? ':' : ''}`);
    for (const brunch of hosted) console.log(`    - ${brunch.title}`);
    console.log(
      `  attends ${attended.length} brunch(es) hosted by others${attended.length > 0 ? ':' : ''}`,
    );
    for (const record of attended) console.log(`    - ${record.brunch.title}`);

    if (hosted.length === 0 && attended.length === 0) {
      console.log('Nothing to clear.');
      return;
    }
    if (!apply) {
      console.log('\nDry run: nothing was changed. Run again with --apply to clear these.');
      return;
    }

    const now = new Date();
    const mark = { deletedAt: now, deletedBy: user.id };
    await db.$transaction([
      db.brunch.updateMany({ where: { id: { in: hosted.map((b) => b.id) } }, data: mark }),
      db.brunchAttendee.updateMany({
        where: { id: { in: attended.map((a) => a.id) } },
        data: mark,
      }),
    ]);
    console.log(
      `\nCleared ${hosted.length} hosted brunch(es) and ${attended.length} attended one(s) (soft-deleted).`,
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
