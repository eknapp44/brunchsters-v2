import { type Action, combineReducers, configureStore, type Reducer } from '@reduxjs/toolkit';

// What every thunk receives as its third argument. `fetch` is injected so thunks run in node
// tests with a fake instead of module mocking.
export type ThunkExtra = {
  readonly fetch: typeof fetch;
};

// Slices are added here as they are introduced (spec 0010: wizard in M2, ballots in M3).
const rootReducer = combineReducers({});

export type RootState = ReturnType<typeof rootReducer>;

type ConfigureAppStoreParams<S, A extends Action> = {
  readonly reducer: Reducer<S, A>;
  readonly extra: ThunkExtra;
};

// A fresh store on every call, on purpose: the App Router renders on the server, so a
// module-level store would be shared by every visitor's requests (ADR 0011). Exported
// separately from `makeStore` so tests can drive it with a throwaway reducer.
export function configureAppStore<S, A extends Action>(params: ConfigureAppStoreParams<S, A>) {
  return configureStore({
    reducer: params.reducer,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ thunk: { extraArgument: params.extra } }),
    devTools: process.env.NODE_ENV !== 'production',
  });
}

export function makeStore(extra: ThunkExtra) {
  return configureAppStore({ reducer: rootReducer, extra });
}

export type AppStore = ReturnType<typeof makeStore>;
export type AppDispatch = AppStore['dispatch'];
