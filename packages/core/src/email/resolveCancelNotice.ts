import type { DbClient } from '@brunchsters/database';
import type { BrunchId } from '@brunchsters/shared';
import { err, ok, type Result } from 'neverthrow';
import { listBrunchRecipients } from './listBrunchRecipients';
import { loadNoticeBrunch } from './loadNoticeBrunch';
import type { ResolvedNotice, ResolveNoticeError } from './noticeTypes';

// Run when the hold on a called-off notice is over (spec 0013, ADR 0015): reads the brunch again
// and says whether to tell anyone. It tells people only if THIS cancellation still stands: the
// brunch is still called off, `cancelledAt` is the one the event carries (a bring-back followed by
// a second cancel has its own run), and it has not been announced yet. Anything else is a stop,
// never an error, so the queue does not retry it. Recipients are everyone invited who has not said
// no, read now, not the host (they did it).
export async function resolveCancelNotice(
  input: { readonly brunchId: BrunchId; readonly cancelledAt: Date },
  ctx: { readonly db: DbClient },
): Promise<Result<ResolvedNotice, ResolveNoticeError>> {
  try {
    const loaded = await loadNoticeBrunch(input, ctx);
    if (loaded === undefined) return ok({ kind: 'stop', reason: 'brunch_gone' });

    const { brunch } = loaded;
    if (brunch.status.code !== 'cancelled') return ok({ kind: 'stop', reason: 'not_called_off' });
    if (brunch.cancelledAt?.getTime() !== input.cancelledAt.getTime()) {
      return ok({ kind: 'stop', reason: 'superseded' });
    }
    if (brunch.cancelNoticeSentAt !== null) return ok({ kind: 'stop', reason: 'already_sent' });

    const recipients = await listBrunchRecipients(
      { brunchId: input.brunchId, host: loaded.host, includeHost: false },
      ctx,
    );
    return ok({
      kind: 'send',
      brunch: loaded.summary,
      cancelledAt: input.cancelledAt,
      recipients,
    });
  } catch (cause) {
    return err({ kind: 'db_error', cause });
  }
}
