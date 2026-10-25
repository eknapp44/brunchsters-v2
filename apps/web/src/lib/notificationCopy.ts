import type { NotificationData } from '@brunchsters/shared';
import { formatWhenLong } from './brunchPageFormat';

// The words of the bell and the inbox (spec 0015, ADR 0017). A notification row stores facts (a
// count, a name, an instant), never sentences: this module words them when the page is drawn, so a
// fix to a line reaches rows already written, and a time is said in the right zone. Pure, so every
// line is in one place for a journey to name and a test to read. Voice: `docs/voice-and-copy.md`
// (a friend in the group chat; specific beats generic; nothing promised that the app does not do).

// The bell link's accessible name. The visible number is decorative (it repeats this).
export const MAX_SHOWN_UNREAD = 99;

export function bellLabel(count: number): string {
  if (count <= 0) return 'Notifications';
  if (count > MAX_SHOWN_UNREAD) return `Notifications, more than ${MAX_SHOWN_UNREAD} unread`;
  return `Notifications, ${count} unread`;
}

export function bellBadgeText(count: number): string | undefined {
  if (count <= 0) return undefined;
  return count > MAX_SHOWN_UNREAD ? `${MAX_SHOWN_UNREAD}+` : String(count);
}

export const INBOX_HEADING = 'Notifications';
export const MARK_ALL_READ = 'Mark all read';
export const SHOW_OLDER = 'Show older';
// What a screen reader hears before an unread row's words; sighted people get a dot.
export const UNREAD_PREFIX = 'Unread.';

// The empty inbox: inviting, not lonely, always a verb out (voice-and-copy.md, "Empty state").
export const EMPTY_INBOX_HEADLINE = 'Nothing yet.';
export const EMPTY_INBOX_BODY = "Round up the crew and it'll start talking.";
export const EMPTY_INBOX_ACTION = 'Plan a Brunch';

// What one row says. `when` is a moment in the reader's own zone, which only the browser knows, so
// the row draws it with `LocalDateTime`; anything in a place's own zone is already in the text.
export type NotificationView = {
  readonly headline: string;
  readonly detail: string | undefined;
  readonly when: { readonly label: string; readonly iso: string } | undefined;
  readonly emoji: string | undefined;
};

function plain(headline: string, detail?: string, emoji?: string): NotificationView {
  return { headline, detail, when: undefined, emoji };
}

export function describeNotification(params: {
  readonly data: NotificationData;
  // The live brunch's title; a row about a deleted brunch is not drawn at all.
  readonly brunchTitle: string | undefined;
}): NotificationView {
  const { data } = params;
  const title = params.brunchTitle ?? 'your brunch';

  switch (data.kind) {
    case 'rsvp.received':
      return plain(
        data.count === 1 ? `1 new reply on ${title}` : `${data.count} new replies on ${title}`,
      );
    case 'vote.cast':
      return plain(
        data.count === 1 ? `1 new vote on ${title}` : `${data.count} new votes on ${title}`,
      );
    case 'invite.suggestion':
      return plain(`${data.suggesterName} suggested someone to invite to ${title}`);
    case 'location.suggested':
      return plain(`${data.suggesterName} suggested ${data.placeName} for ${title}`);
    case 'time.suggested':
      return plain(`${data.suggesterName} suggested a time for ${title}`);
    case 'brunch.confirmed':
      return plain(
        `${title} is on`,
        `${data.placeName} · ${formatWhenLong({
          scheduledAt: new Date(data.scheduledAt),
          timeZone: data.timezone,
        })}`,
        '💕',
      );
    case 'brunch.cancelled':
      return plain(`${data.hostName} called off ${title}`, 'No worries — these things happen.');
    case 'brunch.reinstated':
      return plain(`${title} is back on`, `${data.hostName} brought it back.`, '🥂');
    case 'vote.deadline.approaching':
      return {
        headline: `Last call to vote on ${title}`,
        detail: "You haven't voted yet.",
        when: { label: 'Closes', iso: data.deadline },
        emoji: undefined,
      };
    case 'invite.received':
      return plain(`${data.hostName} wants you at ${title}`, undefined, '🥂');
    case 'invite.email.failed':
      return plain(
        `Your invite to ${data.email} didn't go through`,
        'Have a look at your invites.',
      );
  }
}

// Where opening a row goes. A suggestion waits for the host on the manage page; everything else is
// about the brunch itself, which a member (and an invitee who already has an account) can open.
export function notificationHref(params: {
  readonly data: NotificationData;
  readonly brunchId: string | undefined;
}): string {
  if (params.brunchId === undefined) return '/dashboard';
  const brunch = `/brunch/${params.brunchId}`;
  switch (params.data.kind) {
    case 'invite.suggestion':
    case 'location.suggested':
    case 'time.suggested':
      return `${brunch}/manage`;
    case 'rsvp.received':
    case 'vote.cast':
    case 'brunch.confirmed':
    case 'brunch.cancelled':
    case 'brunch.reinstated':
    case 'vote.deadline.approaching':
    case 'invite.received':
    case 'invite.email.failed':
      return brunch;
  }
}

// "Just now", "5 min ago", "3 h ago", "Yesterday", "4 days ago"; undefined from a week on, where
// the row shows the date itself (in the reader's zone, which only the browser knows).
export function relativeAgo(params: {
  readonly then: Date;
  readonly now: Date;
}): string | undefined {
  const seconds = Math.max(0, Math.floor((params.now.getTime() - params.then.getTime()) / 1000));
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return undefined;
}
