import type { DbClient } from '@brunchsters/database';
import type { BrunchId } from '@brunchsters/shared';

export type DecisionMode = 'host_decides' | 'group_vote';

export type OptionKind = 'location' | 'time';

type DeriveDecisionModeInput = {
  readonly brunchId: BrunchId;
  readonly kind: OptionKind;
};

// The only place allowed to count BrunchLocation/BrunchTime rows for the
// purpose of deriving a brunch's decision mode (ADR 0006). `count()` is not
// intercepted by the soft-delete extension — only findMany/findFirst are —
// so deletedAt: null must be spelled out here, explicitly, every time.
export async function deriveDecisionMode(
  input: DeriveDecisionModeInput,
  ctx: { readonly db: DbClient },
): Promise<DecisionMode> {
  const where = { brunchId: input.brunchId, deletedAt: null };
  const count =
    input.kind === 'location'
      ? await ctx.db.brunchLocation.count({ where })
      : await ctx.db.brunchTime.count({ where });

  return count > 1 ? 'group_vote' : 'host_decides';
}
