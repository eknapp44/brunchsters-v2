import { describe, expect, it, vi } from 'vitest';
import { configureAppStore, type ThunkExtra } from './makeStore';

type CounterAction = { readonly type: 'incremented' };

function counterReducer(state: number = 0, action: CounterAction): number {
  return action.type === 'incremented' ? state + 1 : state;
}

const fakeFetch = vi.fn<ThunkExtra['fetch']>();
const extra: ThunkExtra = { fetch: fakeFetch };

describe('configureAppStore', () => {
  it('builds a fresh store on every call, so two requests never share state', () => {
    const first = configureAppStore({ reducer: counterReducer, extra });
    const second = configureAppStore({ reducer: counterReducer, extra });

    first.dispatch({ type: 'incremented' });
    first.dispatch({ type: 'incremented' });

    expect(first.getState()).toBe(2);
    expect(second.getState()).toBe(0);
  });

  it('hands thunks the fetch it was given, not the global one', () => {
    const store = configureAppStore({ reducer: counterReducer, extra });

    const received = store.dispatch((_dispatch, _getState, thunkExtra: ThunkExtra) => thunkExtra);

    expect(received.fetch).toBe(fakeFetch);
  });
});
