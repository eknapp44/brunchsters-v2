import type { DbClient } from '@brunchsters/database';
import type { BrunchId } from '@brunchsters/shared';
import { err, ok, type Result } from 'neverthrow';
import { listBrunchRecipients } from './listBrunchRecipients';
import { loadNoticeBrunch } from './loadNoticeBrunch';

// How many people calling the brunch off would tell, for the dialog that asks the host to be sure
// ("5 people who said yes, maybe, or haven't said yet will get an email"). It is the same list the
// notice goes to (`listBrunchRecipients`, host left out), so the number in the dialog and the mail
// that goes out cannot disagree. The caller has already established that the viewer is the host
// (the manage page does) or the number would confirm the brunch to a stranger. Zero for a brunch
// that is gone.
export async function getCancelNoticeAudience(
  input: { readonly brunchId: BrunchId },
  ctx: { readonly db: DbClient },
): Promise<Result<number, { readonly kind: 'db_error'; readonly cause: unknown }>> {
  try {
    const loaded = await loadNoticeBrunch(input, ctx);
    if (loaded === undefined) return ok(0);

    const recipients = await listBrunchRecipients(
      { brunchId: input.brunchId, host: loaded.host, includeHost: false },
      ctx,
    );
    return ok(recipients.length);
  } catch (cause) {
    return err({ kind: 'db_error', cause });
  }
}
