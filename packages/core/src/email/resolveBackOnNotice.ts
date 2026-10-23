import type { DbClient } from '@brunchsters/database';
import type { BrunchId } from '@brunchsters/shared';
import { err, ok, type Result } from 'neverthrow';
import { listBrunchRecipients } from './listBrunchRecipients';
import { loadNoticeBrunch } from './loadNoticeBrunch';
import type { ResolvedNotice, ResolveNoticeError } from './noticeTypes';

// Run when the host brings a called-off brunch back (spec 0013, ADR 0015): tells people it is
// back on ONLY if they were told it was off. A brunch brought back inside the hold was never
// announced (`cancelNoticeSentAt` is empty), so nobody needs correcting and nothing is sent. A
// brunch that is called off again by the time this runs has nothing to be back on about. Stops are
// answers, not errors. The recipients are the same people the called-off notice went to, read now.
export async function resolveBackOnNotice(
  input: { readonly brunchId: BrunchId },
  ctx: { readonly db: DbClient },
): Promise<Result<ResolvedNotice, ResolveNoticeError>> {
  try {
    const loaded = await loadNoticeBrunch(input, ctx);
    if (loaded === undefined) return ok({ kind: 'stop', reason: 'brunch_gone' });

    const { brunch } = loaded;
    if (brunch.status.code === 'cancelled') return ok({ kind: 'stop', reason: 'still_called_off' });
    if (brunch.cancelNoticeSentAt === null || brunch.cancelledAt === null) {
      return ok({ kind: 'stop', reason: 'no_notice_sent' });
    }

    const recipients = await listBrunchRecipients(
      { brunchId: input.brunchId, host: loaded.host, includeHost: false },
      ctx,
    );
    return ok({
      kind: 'send',
      brunch: loaded.summary,
      cancelledAt: brunch.cancelledAt,
      recipients,
    });
  } catch (cause) {
    return err({ kind: 'db_error', cause });
  }
}
