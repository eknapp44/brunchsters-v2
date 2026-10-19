import type { ButtonHTMLAttributes, ReactElement } from 'react';
import { buttonClassName, type ButtonSize, type ButtonVariant } from './buttonClassName';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly block?: boolean;
};

// A real <button>: every native attribute (type, disabled, name, aria-*) passes straight
// through, so swapping a bare button for this one never changes its role or accessible name.
export function Button({
  variant,
  size,
  block,
  className,
  ...buttonProps
}: ButtonProps): ReactElement {
  const own = buttonClassName({
    ...(variant !== undefined ? { variant } : {}),
    ...(size !== undefined ? { size } : {}),
    ...(block !== undefined ? { block } : {}),
  });
  return (
    <button {...buttonProps} className={className === undefined ? own : `${own} ${className}`} />
  );
}
