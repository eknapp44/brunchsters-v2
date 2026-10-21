// The option a list of votes is leaning towards: the one with strictly the most votes, and at
// least one. A tie for first, or a list nobody has voted on, has no leader (naming one of two
// equal options would be a false claim). Pure; the page asks, it does not decide.
export function leadingOptionId(
  options: readonly { readonly id: string; readonly voteCount: number }[],
): string | undefined {
  let leader: { readonly id: string; readonly voteCount: number } | undefined;
  let tied = false;
  for (const option of options) {
    if (leader === undefined || option.voteCount > leader.voteCount) {
      leader = option;
      tied = false;
    } else if (option.voteCount === leader.voteCount) {
      tied = true;
    }
  }
  return leader !== undefined && leader.voteCount > 0 && !tied ? leader.id : undefined;
}

// How full a voting row's bar is: its votes as a share of the top option's, 0 to 100. A list with
// no votes has empty bars. Decorative (the vote count carries the number).
export function barPercent(params: {
  readonly voteCount: number;
  readonly topVoteCount: number;
}): number {
  if (params.topVoteCount <= 0) return 0;
  return Math.round((params.voteCount / params.topVoteCount) * 100);
}
