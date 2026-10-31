// What the vote-count live region says when counts change (spec 0015 M8, the design-fidelity
// deferral). Pure, so the rules are unit tested; `VoteCountAnnouncer` only holds the previous counts.
//
// A change the person made themselves is silent (they just pressed the box; the page already moved),
// and so is the first render. A change by someone else is announced politely, naming the option and
// the new count, a few at a time, never a wall of text.

export type CountedOption = {
  readonly id: string;
  readonly name: string;
  readonly voteCount: number;
};

const MAX_NAMED = 3;

function votes(count: number): string {
  return `${count} vote${count === 1 ? '' : 's'}`;
}

export function describeVoteChanges(params: {
  readonly before: readonly CountedOption[];
  readonly after: readonly CountedOption[];
}): string | undefined {
  const earlier = new Map(params.before.map((option) => [option.id, option.voteCount]));
  const changed = params.after.filter((option) => {
    const was = earlier.get(option.id);
    return was !== undefined && was !== option.voteCount;
  });
  if (changed.length === 0) return undefined;

  const named = changed
    .slice(0, MAX_NAMED)
    .map((option) => `${option.name}: ${votes(option.voteCount)}`)
    .join('. ');
  const rest = changed.length - MAX_NAMED;
  return rest > 0 ? `Votes changed. ${named}. And ${rest} more.` : `Votes changed. ${named}.`;
}
