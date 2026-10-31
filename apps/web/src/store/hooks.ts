import { createAsyncThunk } from '@reduxjs/toolkit';
import { useDispatch, useSelector, useStore } from 'react-redux';
import type { AppDispatch, AppStore, RootState, ThunkExtra } from './makeStore';

// The only way components touch the store: typed once here, so nothing imports the bare hooks.
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
// For reading the state at the moment of an event, without subscribing a component to it.
export const useAppStore = useStore.withTypes<AppStore>();

// `rejectValue` is the message a component shows, so `unwrap()` errors are typed.
export const createAppAsyncThunk = createAsyncThunk.withTypes<{
  state: RootState;
  dispatch: AppDispatch;
  extra: ThunkExtra;
  rejectValue: string;
}>();
