import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// A guard for the other half of the rate limits (spec 0012, ADR 0013). A new *route* cannot ship
// without its write budget (routeLimits.test.ts), but mail can be sent by code that is not a route:
// a service that emits an event, or a handler that sends. The approval path was missed in the first
// draft of the spec for exactly that reason. This makes the omission a failing test instead of a
// thing to remember:
//
//  1. every event that causes an email must have a recorded decision here (a new one fails until
//     someone says whether it is budgeted or why it is bounded);
//  2. every core file that emits a *budgeted* event spends the budget, and before it emits;
//  3. nothing sends mail directly except the handlers those events trigger (the confirmation,
//     called-off and back-on emails share one sender, so a fourth caller of it is flagged too).
//
// Static on purpose: no database, no server, and the failure names the file.

const CORE_SRC = fileURLToPath(new URL('../../../../packages/core/src', import.meta.url));
const EVENTS_FILE = fileURLToPath(new URL('./events.ts', import.meta.url));

type Decision =
  | { readonly kind: 'budgeted' }
  | { readonly kind: 'bounded'; readonly reason: string };

// Every event in INVITE_EMAIL_EVENTS and CONFIRMED_EMAIL_EVENTS (events.ts), and what limits it.
const DECISIONS: Readonly<Record<string, Decision>> = {
  'invite/sent': { kind: 'budgeted' },
  'invite/resent': { kind: 'budgeted' },
  'brunch/confirmed': {
    kind: 'bounded',
    reason:
      'host-only, once per brunch, to people who are already in it: the fan-out is the size of the brunch, which no one outside it can choose',
  },
  // Spec 0013: each cancellation is one unit of the host's day (cancelNoticesPerHost), spent in
  // core after the host and state checks and before the event is emitted.
  'brunch/cancelled': { kind: 'budgeted' },
  'brunch/reinstated': {
    kind: 'bounded',
    reason:
      'only ever follows a cancel, whose notice already spent the host budget; it mails the same people the called-off notice reached, and nobody at all if that notice never went out',
  },
};

// The only files that may call `emailService.send(`: the invite handler and the one sender the
// three brunch emails share. Who may call that shared sender is checked separately below.
const SENDERS = ['email/sendInviteEmail.ts', 'email/sendToRecipient.ts'];
const SHARED_SENDER_CALLERS = [
  'email/sendBackOnEmail.ts',
  'email/sendCancelledEmail.ts',
  'email/sendConfirmationEmail.ts',
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : sourceFiles(full);
    const isSource = /\.ts$/.test(entry.name) && !/\.test\.ts$/.test(entry.name);
    return isSource ? [full] : [];
  });
}

const files = sourceFiles(CORE_SRC).map((file) => ({
  name: path.relative(CORE_SRC, file).replaceAll(path.sep, '/'),
  text: readFileSync(file, 'utf-8'),
}));

// The event names listed as email events in events.ts.
function emailEventsInEventsFile(): string[] {
  const text = readFileSync(EVENTS_FILE, 'utf-8');
  const lists = [...text.matchAll(/export const (\w+_EMAIL_EVENTS) = \[([^\]]*)\]/g)];
  return lists.flatMap((list) =>
    [...(list[2] ?? '').matchAll(/'([a-z.]+\/[a-z.]+)'/g)].map((match) => match[1] ?? ''),
  );
}

describe('the scan itself', () => {
  it('finds the files and the event lists it is meant to read (not nothing by mistake)', () => {
    expect(files.length).toBeGreaterThan(40);
    expect(emailEventsInEventsFile().length).toBeGreaterThanOrEqual(3);
  });
});

describe('every event that causes an email has a recorded decision', () => {
  it('has no email event without one, and no decision for an event that is gone', () => {
    const events = emailEventsInEventsFile().sort();

    expect(
      events,
      'an event in events.ts (INVITE_EMAIL_EVENTS or CONFIRMED_EMAIL_EVENTS) has no decision in DECISIONS: say whether it is budgeted or why its fan-out is bounded',
    ).toEqual(Object.keys(DECISIONS).sort());
  });

  it('explains every bounded event', () => {
    for (const [event, decision] of Object.entries(DECISIONS)) {
      if (decision.kind === 'bounded') {
        expect(decision.reason.length, `${event} needs a real reason`).toBeGreaterThan(40);
      }
    }
  });
});

describe('every core file that emits a budgeted event spends the budget first', () => {
  const budgeted = Object.entries(DECISIONS)
    .filter(([, decision]) => decision.kind === 'budgeted')
    .map(([event]) => event);

  it.each(budgeted)('%s', (event) => {
    const emitters = files.filter((file) => file.text.includes(`emit('${event}'`));
    expect(emitters.length, `nothing emits ${event} any more: update this guard`).toBeGreaterThan(
      0,
    );

    for (const file of emitters) {
      const spend = file.text.indexOf('consumeBudgets(');
      const emit = file.text.indexOf(`emit('${event}'`);
      expect(spend, `${file.name} emits ${event} without spending a budget`).toBeGreaterThan(-1);
      expect(spend, `${file.name} spends the budget after it emits ${event}`).toBeLessThan(emit);
    }
  });
});

describe('nothing sends mail except the handlers an event triggers', () => {
  it('calls emailService.send only from the invite handler and the shared sender', () => {
    const senders = files
      .filter((file) => /\bemailService\.send\(/.test(file.text))
      .map((file) => file.name)
      .sort();

    expect(
      senders,
      'new code sends mail directly: send it from an event handler, give the event a decision above, or add the file here on purpose',
    ).toEqual([...SENDERS].sort());
  });

  it('reaches the shared sender only from the three email handlers', () => {
    const callers = files
      .filter((file) => /\bsendToRecipient\(/.test(file.text))
      .map((file) => file.name)
      .filter((name) => name !== 'email/sendToRecipient.ts')
      .sort();

    expect(
      callers,
      'new code calls sendToRecipient: a new email needs an event decision above and a line here',
    ).toEqual([...SHARED_SENDER_CALLERS].sort());
  });
});
