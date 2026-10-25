import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRODUCED_NOTIFICATION_TYPES, type NotificationTypeCode } from '@brunchsters/shared';
import { describe, expect, it } from 'vitest';
import {
  BACK_ON_EMAIL_EVENTS,
  CANCELLED_EMAIL_EVENTS,
  CONFIRMED_NOTIFICATION_EVENTS,
  HOST_NOTIFICATION_EVENTS,
  INVITED_NOTIFICATION_EVENTS,
} from './events';

// A guard for the inbox (spec 0015, ADR 0017), in the spirit of emailBudgets.test.ts: a new event
// that writes notification rows, or a notification type something is meant to produce, cannot ship
// without someone saying who is told and from where. Static on purpose: no database, no server,
// and the failure names what to do.
//
//  1. every event a notification handler subscribes to has a decision here, and no decision is for
//     an event nothing handles;
//  2. every type something produces is covered by a decision, or is listed as not yet produced
//     with the milestone that adds it (that list shrinks to nothing as the spec lands);
//  3. every event a decision names is really emitted by a core service (a handler for an event
//     nobody sends would be dead code that looks alive).

const CORE_SRC = fileURLToPath(new URL('../../../../packages/core/src', import.meta.url));

// The event, and the types it writes rows for. The called-off and back-on rows are written inside
// the two email functions (after their hold-and-recheck), so those events are named here too.
const DECISIONS: Readonly<Record<string, readonly NotificationTypeCode[]>> = {
  'attendee/rsvp.received': ['rsvp.received'],
  'attendee/rsvp.changed': ['rsvp.received'],
  'vote/cast': ['vote.cast'],
  'vote/changed': ['vote.cast'],
  'suggestion/invite': ['invite.suggestion'],
  'suggestion/location': ['location.suggested'],
  'suggestion/time': ['time.suggested'],
  'brunch/confirmed': ['brunch.confirmed'],
  'brunch/cancelled': ['brunch.cancelled'],
  'brunch/reinstated': ['brunch.reinstated'],
  'invite/sent': ['invite.received'],
};

const HANDLED_EVENTS = [
  ...HOST_NOTIFICATION_EVENTS,
  ...CONFIRMED_NOTIFICATION_EVENTS,
  ...INVITED_NOTIFICATION_EVENTS,
  ...CANCELLED_EMAIL_EVENTS,
  ...BACK_ON_EMAIL_EVENTS,
];

// Types something is meant to produce that no event writes yet, and where that is planned.
const NOT_YET_PRODUCED: Readonly<Record<string, string>> = {
  'vote.deadline.approaching': 'the scheduler, spec 0015 M7 (it runs on a clock, not an event)',
  'invite.email.failed': 'the invite email handler, spec 0015 M6',
};

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : sourceFiles(full);
    return /\.ts$/.test(entry.name) && !/\.test\.ts$/.test(entry.name) ? [full] : [];
  });
}

// The event map in EventBus.ts names every event, emitted or not, so it is not evidence of an emit.
const coreText = sourceFiles(CORE_SRC)
  .filter((file) => !file.endsWith(path.join('events', 'EventBus.ts')))
  .map((file) => readFileSync(file, 'utf-8'));

describe('every event that writes notification rows has a decision', () => {
  it('has no handled event without one, and no decision for an event nothing handles', () => {
    expect(
      [...new Set(HANDLED_EVENTS)].sort(),
      'an event a notification handler subscribes to (events.ts) has no entry in DECISIONS: say which types it writes and for whom',
    ).toEqual(Object.keys(DECISIONS).sort());
  });

  it('is emitted by a core service', () => {
    for (const event of Object.keys(DECISIONS)) {
      const emitted = coreText.some((text) => text.includes(`'${event}'`));
      expect(emitted, `nothing in packages/core emits ${event}`).toBe(true);
    }
  });
});

describe('every produced type has a producer', () => {
  it('is written by a decision, or listed as not yet produced', () => {
    const written = new Set(Object.values(DECISIONS).flat());
    const covered = new Set<string>([...written, ...Object.keys(NOT_YET_PRODUCED)]);

    const missing = PRODUCED_NOTIFICATION_TYPES.filter((type) => !covered.has(type));
    expect(
      missing,
      'a type something is meant to produce has no event that writes it: add a decision, or list it in NOT_YET_PRODUCED with where it comes from',
    ).toEqual([]);
  });

  it('does not list a type as not yet produced once an event writes it', () => {
    const written = new Set<string>(Object.values(DECISIONS).flat());
    for (const type of Object.keys(NOT_YET_PRODUCED)) {
      expect(written.has(type), `${type} is produced now: remove it from NOT_YET_PRODUCED`).toBe(
        false,
      );
    }
  });
});
