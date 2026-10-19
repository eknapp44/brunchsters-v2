// How loudly a brunch's status is drawn as a badge. The label text always carries the meaning;
// the tone is only emphasis. Statuses are a lookup table, so an unknown code is just neutral.
export type StatusTone = 'neutral' | 'accent' | 'mint';

export function statusTone(statusCode: string): StatusTone {
  if (statusCode === 'confirmed') return 'mint';
  if (statusCode === 'active') return 'accent';
  return 'neutral';
}
