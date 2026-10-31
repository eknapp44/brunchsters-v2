import { NonRetriableError } from 'inngest';
import { describe, expect, it } from 'vitest';
import { readTickScope } from './tickScope';

const ID = '11111111-1111-4111-8111-111111111111';

describe('readTickScope', () => {
  it('covers every brunch when no data arrives (the cron) or none is named', () => {
    expect(readTickScope(undefined)).toEqual({ brunchId: undefined });
    expect(readTickScope({})).toEqual({ brunchId: undefined });
  });

  it('narrows to the brunch it names', () => {
    expect(readTickScope({ brunchId: ID })).toEqual({ brunchId: ID });
  });

  it('refuses a brunch id that is not one, instead of running over every brunch', () => {
    for (const bad of [{ brunchId: 'nope' }, { brunchId: 42 }, { brunchId: '' }, 'oops']) {
      expect(() => readTickScope(bad)).toThrow(NonRetriableError);
    }
  });
});
