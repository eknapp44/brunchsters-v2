import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// A called-off brunch must take no changes (spec 0013, ADR 0015), and the rule is only as good as
// the services that apply it. Reading the code found four services with no status check at all, so
// this makes forgetting a failing test instead of a thing to remember: every service under brunch/
// and invite/ that writes to the database has to call `assertBrunchOpen` (or `assertBrunchActive`,
// which is stricter: it also refuses a draft and a confirmed brunch), or be listed below with the
// reason it is allowed not to.
//
// Static on purpose, like routeLimits.test.ts and emailBudgets.test.ts: no database, and the
// failure names the file. It proves the call is there, not where; the order (membership first, so
// an outsider is never told a brunch is called off) is proved by each service's own tests and the
// API-authorization journey.

const CORE_SRC = fileURLToPath(new URL('../..', import.meta.url));
const SCANNED_DIRECTORIES = ['brunch', 'invite'];

// A service that writes is not allowed to skip the guard unless it is named here, with a reason.
const EXEMPT: Readonly<Record<string, string>> = {
  'brunch/createBrunch.ts': 'creates the brunch; there is nothing to be called off yet',
  'brunch/reinstateBrunch.ts': 'the one write that is only allowed on a called-off brunch',
  'brunch/deleteBrunch.ts':
    'removing a called-off brunch is the point; it checks the status itself',
  'brunch/setBrunchHidden.ts': 'tidying your own dashboard is allowed in every status',
  'invite/inviteEmailFailure.ts':
    'records what the queue did to a mail already sent, which a call-off does not undo; it is the queue, not a person, writing, and the invite list of a called-off brunch still says so',
};

const GUARD_CALL = /\b(assertBrunchOpen|assertBrunchActive)\(/;
const WRITES = /\.(create|createMany|update|updateMany|delete|deleteMany|upsert)\(|\$transaction/;

function serviceFiles(directory: string): string[] {
  return readdirSync(path.join(CORE_SRC, directory), { withFileTypes: true }).flatMap((entry) => {
    const relative = `${directory}/${entry.name}`;
    // guards/ and presentation/ hold pure rules, not services; tests are not services.
    if (entry.isDirectory()) return [];
    const isSource = /\.ts$/.test(entry.name) && !/\.test\.ts$/.test(entry.name);
    return isSource ? [relative] : [];
  });
}

const files = SCANNED_DIRECTORIES.flatMap(serviceFiles).map((name) => ({
  name,
  text: readFileSync(path.join(CORE_SRC, name), 'utf-8'),
}));
const writers = files.filter((file) => WRITES.test(file.text));

describe('the lifecycle guard scan', () => {
  it('finds the services it is meant to check (not an empty folder by mistake)', () => {
    expect(files.length).toBeGreaterThanOrEqual(25);
    expect(writers.length).toBeGreaterThanOrEqual(15);
  });

  it('exempts only files that exist and still write', () => {
    const writerNames = new Set(writers.map((file) => file.name));
    for (const name of Object.keys(EXEMPT)) {
      expect(writerNames.has(name), `${name} is exempt but is not a writing service`).toBe(true);
    }
  });
});

describe('every service that writes refuses a brunch that is not open', () => {
  it.each(writers.map((file) => [file.name, file] as const))('%s', (name, file) => {
    if (EXEMPT[name] !== undefined) {
      expect(
        GUARD_CALL.test(file.text),
        `${name} is exempt (${EXEMPT[name]}) but calls the guard: drop the exemption`,
      ).toBe(false);
      return;
    }

    expect(
      GUARD_CALL.test(file.text),
      `${name} writes to the database but never calls assertBrunchOpen (or assertBrunchActive). ` +
        'Call it after the membership check so a called-off brunch takes no changes, or add the ' +
        'file to EXEMPT in lifecycleGuards.test.ts with the reason it may skip it.',
    ).toBe(true);
  });
});
