'use client';

import { MAX_INVITES_PER_REQUEST } from '@brunchsters/shared';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { PopIcon } from '@/components/icons/PopIcon';
import { Button } from '@/components/ui/Button';
import { Container } from '@/components/ui/Container';
import { Field } from '@/components/ui/Field';
import { InlineAlert } from '@/components/ui/InlineAlert';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  createBrunch,
  descriptionChanged,
  emailAdded,
  emailRemoved,
  locationAdded,
  locationRemoved,
  stepChosen,
  timeAdded,
  timeRemoved,
  titleChanged,
  votingDeadlineChanged,
  wizardReset,
} from '@/store/wizardSlice';
import { PlaceSearchInput } from '../PlaceSearchInput';
import { StepIndicator } from './StepIndicator';
import styles from './wizard.module.css';

const TITLE_MAX_LENGTH = 100;
const DESCRIPTION_MAX_LENGTH = 500;

// For the "Voting closes by" datetime-local input's min attribute — matches
// the server's future-only requirement so the browser blocks past dates too.
function nowAsDatetimeLocalValue(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

function StepOne() {
  const state = useAppSelector((root) => root.wizard);
  const dispatch = useAppDispatch();
  return (
    <section className={styles.step}>
      <Field label="Title">
        <input
          type="text"
          value={state.title}
          maxLength={TITLE_MAX_LENGTH}
          onChange={(event) => dispatch(titleChanged(event.target.value))}
        />
      </Field>
      <Field label="Description">
        <textarea
          value={state.description}
          maxLength={DESCRIPTION_MAX_LENGTH}
          onChange={(event) => dispatch(descriptionChanged(event.target.value))}
        />
      </Field>
      <div className={`${styles.actions} ${styles.actionsEnd}`}>
        <Button
          type="button"
          variant="primary"
          disabled={state.title.trim().length === 0}
          onClick={() => dispatch(stepChosen(2))}
        >
          Next
        </Button>
      </div>
    </section>
  );
}

function StepTwo() {
  const state = useAppSelector((root) => root.wizard);
  const dispatch = useAppDispatch();
  return (
    <section className={styles.step}>
      <PlaceSearchInput onSelect={(location) => dispatch(locationAdded(location))} />

      {state.locations.length > 0 && (
        <ul className={styles.items} role="list">
          {state.locations.map((location) => (
            <li key={location.placeId}>
              <span className={styles.itemText}>
                <PopIcon name="pin" size={22} />
                {location.name}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => dispatch(locationRemoved(location.placeId))}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}

      {state.locations.length > 1 && (
        <InlineAlert>
          <p className={styles.hint}>Multiple locations will be put to a vote</p>
        </InlineAlert>
      )}

      <div className={styles.actions}>
        <Button type="button" onClick={() => dispatch(stepChosen(1))}>
          Back
        </Button>
        <Button type="button" variant="primary" onClick={() => dispatch(stepChosen(3))}>
          Next
        </Button>
      </div>
    </section>
  );
}

function StepThree() {
  const state = useAppSelector((root) => root.wizard);
  const dispatch = useAppDispatch();
  const [timeInput, setTimeInput] = useState('');
  const showVotingDeadline = state.locations.length > 1 || state.times.length > 1;

  function addTime(): void {
    if (timeInput === '') return;
    dispatch(timeAdded(new Date(timeInput).toISOString()));
    setTimeInput('');
  }

  return (
    <section className={styles.step}>
      <div className={styles.addRow}>
        <input
          type="datetime-local"
          aria-label="Date and time"
          value={timeInput}
          onChange={(event) => setTimeInput(event.target.value)}
        />
        <Button type="button" onClick={addTime}>
          Add Time
        </Button>
      </div>

      {state.times.length > 0 && (
        <ul className={styles.items} role="list">
          {state.times.map((time, index) => (
            <li key={time}>
              <span className={styles.itemText}>
                <PopIcon name="clock" size={22} />
                {new Date(time).toLocaleString()}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => dispatch(timeRemoved(index))}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}

      {state.times.length > 1 && (
        <InlineAlert>
          <p className={styles.hint}>Multiple times will be put to a vote</p>
        </InlineAlert>
      )}

      {showVotingDeadline && (
        <Field label="Voting closes by">
          <input
            type="datetime-local"
            value={state.votingDeadline}
            min={nowAsDatetimeLocalValue()}
            onChange={(event) => dispatch(votingDeadlineChanged(event.target.value))}
          />
        </Field>
      )}

      <div className={styles.actions}>
        <Button type="button" onClick={() => dispatch(stepChosen(2))}>
          Back
        </Button>
        <Button type="button" variant="primary" onClick={() => dispatch(stepChosen(4))}>
          Next
        </Button>
      </div>
    </section>
  );
}

function StepFour({ onSubmit }: { readonly onSubmit: () => void }) {
  const state = useAppSelector((root) => root.wizard);
  const dispatch = useAppDispatch();
  const { submitting, submitError } = state;
  const [emailInput, setEmailInput] = useState('');
  const isListFull = state.emails.length >= MAX_INVITES_PER_REQUEST;

  function addEmail(): void {
    const trimmed = emailInput.trim();
    if (trimmed === '' || isListFull) return;
    dispatch(emailAdded(trimmed));
    setEmailInput('');
  }

  return (
    <section className={styles.step}>
      <div className={styles.addRow}>
        <input
          type="email"
          value={emailInput}
          onChange={(event) => setEmailInput(event.target.value)}
          placeholder="Email address"
          disabled={isListFull}
        />
        <Button type="button" onClick={addEmail} disabled={isListFull}>
          Add
        </Button>
      </div>
      {isListFull && (
        <InlineAlert>
          <p className={styles.hint}>
            You can add up to {MAX_INVITES_PER_REQUEST} people here. Invite the rest from the brunch
            page after you create it.
          </p>
        </InlineAlert>
      )}

      {state.emails.length > 0 && (
        <ul className={styles.items} role="list">
          {state.emails.map((email) => (
            <li key={email}>
              <span className={styles.itemText}>
                <PopIcon name="users" size={22} />
                {email}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => dispatch(emailRemoved(email))}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}

      {submitError !== undefined && (
        <InlineAlert tone="error" role="alert">
          <p className={styles.hint}>{submitError}</p>
        </InlineAlert>
      )}

      <div className={styles.actions}>
        <Button type="button" onClick={() => dispatch(stepChosen(3))}>
          Back
        </Button>
        <Button type="button" variant="primary" onClick={onSubmit} disabled={submitting}>
          {submitting ? 'Creating…' : 'Create Brunch'}
        </Button>
      </div>
    </section>
  );
}

export default function NewBrunchPage() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const step = useAppSelector((root) => root.wizard.step);

  // The store lives in the layout and outlives this page, but a half-filled wizard must not.
  useEffect(() => () => void dispatch(wizardReset()), [dispatch]);

  function handleSubmit(): void {
    void dispatch(createBrunch())
      .unwrap()
      .then(({ id }) => router.push(`/brunch/${id}`))
      // The thunk already put the message in the store.
      .catch(() => undefined);
  }

  return (
    <Container as="main" size="narrow">
      <h1>Plan a Brunch</h1>
      <StepIndicator step={step} />
      {step === 1 && <StepOne />}
      {step === 2 && <StepTwo />}
      {step === 3 && <StepThree />}
      {step === 4 && <StepFour onSubmit={handleSubmit} />}
    </Container>
  );
}
