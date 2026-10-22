'use client';

import { MAX_INVITES_PER_REQUEST } from '@brunchsters/shared';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/icons/Icon';
import { PopIcon } from '@/components/icons/PopIcon';
import { Button } from '@/components/ui/Button';
import { DateTimeInput } from '@/components/ui/DateTimeInput';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Container } from '@/components/ui/Container';
import { Eyebrow } from '@/components/ui/Eyebrow';
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
  selectWizard,
  selectWizardStep,
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

type Step = 1 | 2 | 3 | 4;

// What each step says about itself: the prototype's wording (Brand Voice, Copy Pass), minus its
// "pick from past brunches", which the app does not have.
const STEP_COPY: Readonly<
  Record<Step, { readonly eyebrow: string; readonly title: string; readonly help: string }>
> = {
  1: {
    eyebrow: 'A name everyone will see',
    title: 'Give it a name',
    help: 'Keep it casual — "Sunday catch-up" works just fine.',
  },
  2: {
    eyebrow: 'Pick one — or a few to vote on',
    title: 'Pick a spot',
    help: "Lock in one place, or toss in a few and we'll put it to a vote.",
  },
  3: {
    eyebrow: 'Same logic — one or several',
    title: 'Pick a time',
    help: 'Lock in a time, or float a few and the gang picks.',
  },
  4: {
    eyebrow: 'Last step!',
    title: 'Round up the crew',
    help: 'Add them by email. You can invite more from the brunch page once it exists.',
  },
};

// The top of a step: where you are, what this step is, and one line of help. It is the step's
// heading, so each step's section has one.
function StepHeader(props: { readonly step: Step }) {
  const copy = STEP_COPY[props.step];
  return (
    <div className={styles.stepHeader}>
      <Eyebrow>
        Step {props.step} of 4 · {copy.eyebrow}
      </Eyebrow>
      <h2 className={styles.stepTitle}>{copy.title}</h2>
      <p className={styles.stepHelp}>{copy.help}</p>
    </div>
  );
}

function StepOne() {
  const state = useAppSelector(selectWizard);
  const dispatch = useAppDispatch();
  return (
    <section className={styles.step}>
      <StepHeader step={1} />
      <Field label="Title">
        <input
          type="text"
          value={state.title}
          placeholder="e.g. Sunday catch-up"
          maxLength={TITLE_MAX_LENGTH}
          onChange={(event) => dispatch(titleChanged(event.target.value))}
        />
      </Field>
      <Field label="Description" optional>
        <textarea
          value={state.description}
          placeholder="Anything you want guests to know — the vibe, the occasion, dress code…"
          maxLength={DESCRIPTION_MAX_LENGTH}
          onChange={(event) => dispatch(descriptionChanged(event.target.value))}
        />
      </Field>
      <div className={styles.actions}>
        {/* the first step has nothing to go back to, so its footer leaves instead */}
        <ButtonLink href="/dashboard">
          <Icon name="arrowLeft" size={16} />
          Cancel
        </ButtonLink>
        <Button
          type="button"
          variant="primary"
          disabled={state.title.trim().length === 0}
          onClick={() => dispatch(stepChosen(2))}
        >
          Continue
          <Icon name="arrowRight" size={16} />
        </Button>
      </div>
    </section>
  );
}

function StepTwo() {
  const state = useAppSelector(selectWizard);
  const dispatch = useAppDispatch();
  return (
    <section className={styles.step}>
      <StepHeader step={2} />
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
          <Icon name="arrowLeft" size={16} />
          Back
        </Button>
        <Button type="button" variant="primary" onClick={() => dispatch(stepChosen(3))}>
          Continue
          <Icon name="arrowRight" size={16} />
        </Button>
      </div>
    </section>
  );
}

function StepThree() {
  const state = useAppSelector(selectWizard);
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
      <StepHeader step={3} />
      <div className={styles.addRow}>
        <DateTimeInput
          placeholderText="Add a time"
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
                {/* The list only holds times typed in this browser, never rendered on the server. */}
                {/* eslint-disable-next-line no-restricted-syntax */}
                {new Date(time).toLocaleString(undefined, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
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
          <DateTimeInput
            placeholderText="Pick a deadline"
            value={state.votingDeadline}
            min={nowAsDatetimeLocalValue()}
            onChange={(event) => dispatch(votingDeadlineChanged(event.target.value))}
          />
        </Field>
      )}

      <div className={styles.actions}>
        <Button type="button" onClick={() => dispatch(stepChosen(2))}>
          <Icon name="arrowLeft" size={16} />
          Back
        </Button>
        <Button type="button" variant="primary" onClick={() => dispatch(stepChosen(4))}>
          Continue
          <Icon name="arrowRight" size={16} />
        </Button>
      </div>
    </section>
  );
}

function StepFour({ onSubmit }: { readonly onSubmit: () => void }) {
  const state = useAppSelector(selectWizard);
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
      <StepHeader step={4} />
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
          <Icon name="arrowLeft" size={16} />
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
  const step = useAppSelector(selectWizardStep);

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
      <div className={styles.top}>
        <h1 className={styles.pageTitle}>Plan a Brunch</h1>
        {/* the footer has a way out too; a phone leaves this one out to save the room */}
        <span className={styles.topCancel}>
          <ButtonLink href="/dashboard" variant="ghost" size="sm">
            <Icon name="close" size={16} />
            Cancel
          </ButtonLink>
        </span>
      </div>
      <StepIndicator step={step} />
      {step === 1 && <StepOne />}
      {step === 2 && <StepTwo />}
      {step === 3 && <StepThree />}
      {step === 4 && <StepFour onSubmit={handleSubmit} />}
    </Container>
  );
}
