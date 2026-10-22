'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type InputHTMLAttributes,
  type ReactElement,
  type Ref,
} from 'react';
import styles from './DateTimeInput.module.css';

type DateTimeInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'placeholder'> & {
  // What the empty field says, like a text field's placeholder ("Add a time"). The browser's own
  // blank ("mm/dd/yyyy --:-- --") cannot be replaced, so it is covered while the field is empty
  // and not focused; once a person focuses the field or picks a value, the real one shows.
  readonly placeholderText: string;
  readonly ref?: Ref<HTMLInputElement>;
};

// A datetime-local input that reads like the app's other empty fields. Everything else about it
// (value, min, onChange, the accessible name from aria-label or a wrapping label) is the input's.
export function DateTimeInput(props: DateTimeInputProps): ReactElement {
  const { placeholderText, ref, onChange, ...inputProps } = props;
  const innerRef = useRef<HTMLInputElement | null>(null);
  const isControlled = inputProps.value !== undefined;
  const [hasTypedValue, setHasTypedValue] = useState(false);
  const isEmpty = isControlled ? String(inputProps.value) === '' : !hasTypedValue;

  // A value can arrive before this has hydrated (typed early, or restored by the browser), and no
  // change event will tell us about it afterwards, so read it once on mount.
  useEffect(() => {
    if (!isControlled && innerRef.current !== null) {
      setHasTypedValue(innerRef.current.value !== '');
    }
  }, [isControlled]);

  const setRefs = useCallback(
    (element: HTMLInputElement | null): void => {
      innerRef.current = element;
      if (typeof ref === 'function') ref(element);
      else if (ref !== undefined && ref !== null) ref.current = element;
    },
    [ref],
  );

  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    setHasTypedValue(event.target.value !== '');
    onChange?.(event);
  }

  return (
    <span className={styles.wrap} data-empty={isEmpty ? 'true' : undefined}>
      <input {...inputProps} ref={setRefs} type="datetime-local" onChange={handleChange} />
      <span className={styles.placeholder} aria-hidden="true">
        {placeholderText}
      </span>
    </span>
  );
}
