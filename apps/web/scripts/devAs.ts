import path from 'node:path';
import { signInWithProvider } from '@brunchsters/core';
import { createDb } from '@brunchsters/database';
import { normalizeEmail } from '@brunchsters/shared';
import { chromium, devices } from '@playwright/test';
import { encode } from 'next-auth/jwt';

// A developer tool, not part of the app: opens a browser window already signed in as one person,
// so you can be several people at once against your LOCAL app (a host and two friends, say)
// without more Google accounts. It mints the same session cookie a real sign-in ends with (as
// the e2e suite does, ADR 0007), so the app is untouched.
//
//   pnpm dev:as ava              a person called Ava, created as ava@example.com if new
//   pnpm dev:as ava --phone      the same, in a phone-sized window
//   pnpm dev:as you@gmail.com    someone already in your local database (never created)
//   pnpm dev:as ava --check      no window: signs in headless, prints the page it landed on, exits
//
// Each person gets their own browser profile (apps/web/.dev-profiles/<name>), so windows do not
// share a session. Start `pnpm dev` first. It refuses anything that is not a local database and a
// local app address, and it only ever reads AUTH_SECRET from apps/web/.env.local; it never prints it.

const LOCAL_HOSTS: ReadonlySet<string> = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);
const DEV_PROVIDER = 'dev-as';

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function hostOf(url: string): string {
  return new URL(url).hostname;
}

function titleCase(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function parseArguments(argv: readonly string[]): {
  who: string;
  isPhone: boolean;
  isCheck: boolean;
} {
  const words = argv.filter((word) => !word.startsWith('--'));
  const who = words[0]?.trim();
  if (who === undefined || who === '') {
    fail('Usage: pnpm dev:as <name or email> [--phone]');
  }
  return { who, isPhone: argv.includes('--phone'), isCheck: argv.includes('--check') };
}

async function main(): Promise<void> {
  try {
    process.loadEnvFile(path.resolve(__dirname, '../.env.local'));
  } catch {
    fail('No apps/web/.env.local (see docs/SETUP.md).');
  }
  const { who, isPhone, isCheck } = parseArguments(process.argv.slice(2));

  const databaseUrl = process.env.DATABASE_URL;
  const authUrl = process.env.AUTH_URL;
  const authSecret = process.env.AUTH_SECRET;
  if (databaseUrl === undefined || databaseUrl === '') fail('DATABASE_URL is not set.');
  if (authUrl === undefined || authUrl === '') fail('AUTH_URL is not set.');
  if (authSecret === undefined || authSecret === '') fail('AUTH_SECRET is not set.');
  // A Postgres URL can name another server in a ?host= parameter; the hostname alone would not show it.
  if (new URL(databaseUrl).searchParams.has('host')) {
    fail('Refusing to run: DATABASE_URL has a host= parameter.');
  }
  if (!LOCAL_HOSTS.has(hostOf(databaseUrl))) {
    fail(`Refusing to run: the database host is "${hostOf(databaseUrl)}", not a local one.`);
  }
  if (!LOCAL_HOSTS.has(hostOf(authUrl))) {
    fail(`Refusing to run: AUTH_URL is "${authUrl}", not a local address.`);
  }

  const isEmail = who.includes('@');
  const slug = isEmail ? (who.split('@')[0] ?? who) : who;
  const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const email = normalizeEmail(isEmail ? who : `${cleanSlug}@example.com`);

  const db = createDb();
  let user: { readonly id: string; readonly name: string; readonly email: string };
  try {
    const existing = await db.user.findFirst({
      where: { email },
      select: { id: true, name: true, email: true },
    });
    if (existing !== null) {
      user = existing;
    } else if (isEmail) {
      return fail(`No user with the email ${email} in the local database; sign in once first.`);
    } else {
      const created = await signInWithProvider({
        provider: DEV_PROVIDER,
        providerUserId: email,
        email,
        name: titleCase(cleanSlug),
        avatarUrl: undefined,
        db,
      });
      if (created.isErr()) return fail('Could not create the person.');
      user = { id: created.value.userId, name: titleCase(cleanSlug), email };
      console.log(`Created ${user.name} <${email}>.`);
    }
  } finally {
    await db.$disconnect();
  }

  const cookieName = authUrl.startsWith('https://')
    ? '__Secure-authjs.session-token'
    : 'authjs.session-token';
  const cookieValue = await encode({
    token: { sub: user.id, userId: user.id, name: user.name, email: user.email },
    secret: authSecret,
    salt: cookieName,
  });

  const profileDir = path.resolve(
    __dirname,
    '../.dev-profiles',
    cleanSlug + (isPhone ? '-phone' : ''),
  );
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: isCheck,
    ...(isPhone ? devices['Pixel 7'] : { viewport: null }),
  });
  await context.addCookies([{ name: cookieName, value: cookieValue, url: authUrl }]);
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(`${authUrl}/dashboard`);
  if (isCheck) {
    const heading = await page.getByRole('heading', { level: 1 }).first().innerText();
    console.log(`Landed on ${page.url()} with the heading "${heading}".`);
    await context.close();
    return;
  }
  console.log(`Signed in as ${user.name} <${user.email}>. Close the window to finish.`);
  await new Promise<void>((resolve) => context.on('close', () => resolve()));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
