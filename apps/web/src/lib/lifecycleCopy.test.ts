import { describe, expect, it } from 'vitest';
import {
  calledOffInvite,
  calledOffLine,
  callOffDialog,
  DELETE_WAIT_MESSAGE,
  deleteDialog,
} from './lifecycleCopy';

describe('callOffDialog', () => {
  it('names the brunch and how many people will be told, and says it is not instant', () => {
    const dialog = callOffDialog({ title: 'Sunday Funday', audience: 5 });

    expect(dialog.title).toBe('Calling off "Sunday Funday"?');
    expect(dialog.body).toContain("5 folks who said yes, maybe, or hadn't said yet");
    expect(dialog.body).toContain('in a few minutes');
    expect(dialog.body).toContain('nobody hears a thing');
    expect(dialog.confirmLabel).toBe('Call it off');
    expect(dialog.cancelLabel).toBe('Nope, keep it');
  });

  it('says "person" for one, and says so when there is no one to tell', () => {
    expect(callOffDialog({ title: 'A', audience: 1 }).body).toContain('1 person who said yes');
    expect(callOffDialog({ title: 'A', audience: 0 }).body).toBe(
      "Nobody else is in on it yet, so there's no one to tell.",
    );
  });

  it('keeps to the voice: no event, no notification, no "successfully"', () => {
    const all = [
      callOffDialog({ title: 'A', audience: 3 }).body,
      callOffDialog({ title: 'A', audience: 0 }).body,
      deleteDialog({ title: 'A', isDraft: true }).body,
      deleteDialog({ title: 'A', isDraft: false }).body,
      calledOffLine({ isHost: true, hostName: 'Sam' }),
      calledOffLine({ isHost: false, hostName: 'Sam' }),
      DELETE_WAIT_MESSAGE,
    ].join(' ');

    expect(all).not.toMatch(/\bevent\b|notification|successfully|attendee|EVENT/);
  });
});

describe('deleteDialog', () => {
  it('names the brunch, says it cannot be undone, and is lighter for a draft', () => {
    const draft = deleteDialog({ title: 'Sunday', isDraft: true });
    const live = deleteDialog({ title: 'Sunday', isDraft: false });

    expect(draft.title).toBe('Delete "Sunday"?');
    expect(draft.body).toContain('only a draft');
    expect(live.body).not.toContain('only a draft');
    for (const dialog of [draft, live]) {
      expect(dialog.body).toContain("can't be undone");
      expect(dialog.confirmLabel).toBe('Delete it');
      expect(dialog.cancelLabel).toBe('Keep it');
    }
  });
});

describe('calledOffLine and calledOffInvite', () => {
  it('tells the host they can bring it back, and everyone else who called it off', () => {
    expect(calledOffLine({ isHost: true, hostName: 'Sam' })).toContain('Bring it back');
    expect(calledOffLine({ isHost: false, hostName: 'Sam' })).toBe(
      'Sam called this one off. No worries — these things happen.',
    );
  });

  it('gives a link holder the news without offering to join', () => {
    const invite = calledOffInvite({ hostName: 'Sam', title: 'Sunday' });

    expect(invite.heading).toBe('Sam called this one off.');
    expect(invite.line).toContain('nothing to RSVP to');
  });
});
