import { PAST_BRUNCHES_SHOWN } from '@brunchsters/shared';

// Past grows without bound for anyone who never hides a brunch, so the dashboard shows the first
// few and offers "Show all" (spec 0013). Keeps the order it is given. `moreCount` is how many are
// left out, for the link's label; it is 0 when everything is shown. Pure.
export function limitPast<T>(
  past: readonly T[],
  params: { readonly showAll: boolean; readonly limit?: number },
): { readonly shown: readonly T[]; readonly moreCount: number } {
  const limit = params.limit ?? PAST_BRUNCHES_SHOWN;
  if (params.showAll || past.length <= limit) return { shown: past, moreCount: 0 };

  return { shown: past.slice(0, limit), moreCount: past.length - limit };
}
