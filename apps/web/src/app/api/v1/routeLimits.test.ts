import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The rate limits (spec 0012, ADR 0013) are only as good as the routes that call them, so this
// reads every route handler under app/api/v1 and fails when one that can change something does
// not spend the caller's write budget, in the right place. A new endpoint cannot ship unlimited.
//
// A static check on purpose: it needs no database and no server, and it names the route that is
// missing the call. The behavior itself is proved by the journeys (L3 to L6) and the limiter's
// own tests.

const ROOT = fileURLToPath(new URL('.', import.meta.url));

function routeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(full);
    return entry.name === 'route.ts' ? [full] : [];
  });
}

type Route = {
  readonly name: string;
  readonly source: string;
  readonly methods: readonly string[];
};

const routes: readonly Route[] = routeFiles(ROOT).map((file) => {
  const source = readFileSync(file, 'utf-8');
  return {
    name: path.relative(ROOT, path.dirname(file)).replaceAll(path.sep, '/'),
    source,
    methods: [...source.matchAll(/export async function (GET|POST|PUT|PATCH|DELETE)\b/g)].map(
      (match) => match[1] ?? '',
    ),
  };
});

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const mutating = routes.filter((route) => route.methods.some((method) => MUTATING.has(method)));

// What a handler does with the request before it may touch anything: read the body, the address
// parameters or the query.
const FIRST_USE = /await params|request\.json\(\)|new URL\(request\.url\)/;

describe('the route scan', () => {
  it('finds the routes it is meant to check (not an empty folder by mistake)', () => {
    expect(routes.length).toBeGreaterThanOrEqual(24);
    expect(mutating.length).toBeGreaterThanOrEqual(21);
  });
});

describe('every route that can change something spends the caller write budget', () => {
  it.each(mutating.map((route) => [route.name, route] as const))('%s', (_name, route) => {
    const { source } = route;

    // The call and what is done with its answer.
    expect(source).toContain('const limited = await enforceWriteLimit(session.user.id);');
    expect(source).toContain('if (limited !== undefined) return limited;');

    // The order: session, then limit, then anything that reads the request. A limit before the
    // session would be keyed by nobody; after the parsing it would not stop the work.
    const session = source.indexOf('await auth()');
    const limit = source.indexOf('enforceWriteLimit(session.user.id)');
    const firstUse = source.search(FIRST_USE);
    expect(session).toBeGreaterThan(-1);
    expect(limit).toBeGreaterThan(session);
    if (firstUse !== -1) expect(limit).toBeLessThan(firstUse);
  });
});

describe('the routes a signed-out visitor can reach spend the address budget first', () => {
  it.each([
    ['invites/token/[token]', 'invite preview'],
    ['invites/token/[token]/respond', 'invite response'],
  ])('%s', (name, label) => {
    const route = routes.find((candidate) => candidate.name === name);
    expect(route, `no route at ${name}`).toBeDefined();
    const source = route?.source ?? '';

    expect(source).toContain('policy: RATE_LIMIT_POLICIES.inviteTokenPerIp');
    expect(source).toContain('subject: clientIp(request.headers)');
    expect(source).toContain(`route: '${label}'`);
    // Before the lookup, and (for the response) before the session is even read.
    const limit = source.indexOf('policy: RATE_LIMIT_POLICIES.inviteTokenPerIp');
    expect(limit).toBeLessThan(source.search(/getInviteByToken\(|await auth\(\)/));
  });
});

describe('the Places routes spend the signed-in person budget before Google is called', () => {
  it.each([
    ['places/search', 'placeSearchPerUser'],
    ['places/[placeId]', 'placeDetailsPerUser'],
  ])('%s', (name, policy) => {
    const route = routes.find((candidate) => candidate.name === name);
    expect(route, `no route at ${name}`).toBeDefined();
    const source = route?.source ?? '';

    expect(source).toContain(`policy: RATE_LIMIT_POLICIES.${policy}`);
    expect(source).toContain('subject: session.user.id');
    const session = source.indexOf('await auth()');
    const limit = source.indexOf(`policy: RATE_LIMIT_POLICIES.${policy}`);
    const google = source.indexOf('new GooglePlacesProvider');
    expect(session).toBeGreaterThan(-1);
    expect(limit).toBeGreaterThan(session);
    expect(limit).toBeLessThan(google);
  });
});

describe('no budget is keyed by something that names a brunch, an invite or a suggestion', () => {
  it('every enforceLimit subject is the caller (a person or an address)', () => {
    for (const route of routes) {
      for (const match of route.source.matchAll(/subject:\s*([^,\n]+)/g)) {
        const subject = (match[1] ?? '').trim();
        expect(
          ['session.user.id', 'clientIp(request.headers)'],
          `${route.name} spends a budget keyed by "${subject}"`,
        ).toContain(subject);
      }
    }
  });
});
