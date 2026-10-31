import type { DbClient } from '@brunchsters/database';
import type { BrunchId, Email, NotificationTypeCode, UserId } from '@brunchsters/shared';
import { err, ok, type Result } from 'neverthrow';
import type { NotificationDbError } from '../notification/notificationTypes';
import { decideDelivery, shouldDeliver } from '../notification/shouldDeliver';

// Whether an email may go to this address (spec 0015, ADR 0017): the one question every sender asks
// before it calls the email service, so a person's preference or a muted brunch cannot be honored
// by one email and forgotten by another (`emailBudgets.test.ts` fails a sender that does not ask).
//
// An address with an account is held to that person's saved switch for the type and their level for
// the brunch. An address with none (an invitee who has not signed up) has no preferences and gets
// what the default says. The answer is silent by design: the caller records a skip, never a
// failure, so a host cannot learn who turned a kind of email off.
export async function emailAllowed(
  input: {
    readonly email: Email;
    readonly type: NotificationTypeCode;
    readonly brunchId?: BrunchId;
  },
  ctx: { readonly db: DbClient },
): Promise<Result<boolean, NotificationDbError>> {
  try {
    const user = await ctx.db.user.findFirst({
      where: { email: input.email },
      select: { id: true },
    });
    if (user === null) {
      return ok(
        decideDelivery({
          type: input.type,
          channel: 'email',
          level: 'all',
          preference: undefined,
        }),
      );
    }
    return shouldDeliver(
      {
        userId: user.id as UserId,
        type: input.type,
        channel: 'email',
        ...(input.brunchId === undefined ? {} : { brunchId: input.brunchId }),
      },
      ctx,
    );
  } catch (cause) {
    return err({ kind: 'db_error', cause });
  }
}
