import type { DbClient } from '@brunchsters/database';
import type { BrunchId } from '@brunchsters/shared';
import { err, ok, type Result } from 'neverthrow';
import type {
  ConfirmationRecipient,
  ConfirmedBrunchSummary,
  ResolveConfirmationRecipientsError,
} from './confirmationTypes';
import { listBrunchRecipients } from './listBrunchRecipients';

// A brunch that has since been cancelled or archived must not announce itself, however late
// a queued run gets to it.
const NO_LONGER_ON_STATUS_CODES: ReadonlySet<string> = new Set(['cancelled', 'archived']);

// Who hears that the brunch is confirmed: the host, and everyone invited who has not
// said no (see listBrunchRecipients). Read from the database at send time, never from
// the event, so a revoked invite cannot receive anything.
export async function resolveConfirmationRecipients(
  input: { readonly brunchId: BrunchId },
  ctx: { readonly db: DbClient },
): Promise<
  Result<
    {
      readonly brunch: ConfirmedBrunchSummary;
      readonly recipients: readonly ConfirmationRecipient[];
    },
    ResolveConfirmationRecipientsError
  >
> {
  const { db } = ctx;

  try {
    const brunch = await db.brunch.findFirst({
      where: { id: input.brunchId },
      include: { host: true, status: true },
    });
    if (brunch === null) return err({ kind: 'brunch_not_found' });
    if (NO_LONGER_ON_STATUS_CODES.has(brunch.status.code)) return err({ kind: 'not_confirmed' });

    const location = await db.brunchLocation.findFirst({
      where: { brunchId: input.brunchId, isConfirmed: true },
    });
    const time = await db.brunchTime.findFirst({
      where: { brunchId: input.brunchId, isConfirmed: true },
    });
    if (location === null || time === null) return err({ kind: 'not_confirmed' });

    const recipients = await listBrunchRecipients(
      {
        brunchId: input.brunchId,
        host: { email: brunch.host.email, name: brunch.host.name },
        includeHost: true,
      },
      ctx,
    );

    return ok({
      brunch: {
        brunchId: input.brunchId,
        title: brunch.title,
        hostName: brunch.host.name,
        placeName: location.placeName,
        placeAddress: location.placeAddress,
        placeUrl: location.placeUrl,
        timezone: location.timezone,
        scheduledAt: time.scheduledAt,
      },
      recipients,
    });
  } catch (cause) {
    return err({ kind: 'db_error', cause });
  }
}
