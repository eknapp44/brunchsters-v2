import type { Brunch, DbClient } from '@brunchsters/database';
import type { BrunchId } from '@brunchsters/shared';
import type { NoticeBrunchSummary } from './noticeTypes';

export type LoadedNoticeBrunch = {
  readonly brunch: Brunch & { readonly status: { readonly code: string } };
  readonly summary: NoticeBrunchSummary;
  readonly host: { readonly email: string; readonly name: string };
};

// The brunch a called-off or back-on email is about, as it is in the database now: its status and
// cancellation record (to decide whether to say anything) and the confirmed place and time, if it
// had them (to say which brunch it was). Undefined for a deleted brunch or a made-up id, because
// the soft-delete extension filters this lookup. Throws on a database failure; callers wrap it.
export async function loadNoticeBrunch(
  input: { readonly brunchId: BrunchId },
  ctx: { readonly db: DbClient },
): Promise<LoadedNoticeBrunch | undefined> {
  const { db } = ctx;

  const brunch = await db.brunch.findFirst({
    where: { id: input.brunchId },
    include: { host: true, status: true },
  });
  if (brunch === null) return undefined;

  const [location, time] = await Promise.all([
    db.brunchLocation.findFirst({ where: { brunchId: input.brunchId, isConfirmed: true } }),
    db.brunchTime.findFirst({ where: { brunchId: input.brunchId, isConfirmed: true } }),
  ]);

  return {
    brunch,
    host: { email: brunch.host.email, name: brunch.host.name },
    summary: {
      brunchId: input.brunchId,
      title: brunch.title,
      hostName: brunch.host.name,
      plan:
        location === null || time === null
          ? undefined
          : {
              placeName: location.placeName,
              scheduledAt: time.scheduledAt,
              timezone: location.timezone,
            },
    },
  };
}
