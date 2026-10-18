import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

// Shared by Button and ButtonLink so a link that acts as a button looks exactly like one.
export function buttonClassName(params: {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly block?: boolean;
}): string {
  const variant = params.variant ?? 'secondary';
  const size = params.size ?? 'md';
  return [
    styles.button,
    variant === 'secondary' ? undefined : styles[variant],
    size === 'md' ? undefined : styles[size],
    params.block === true ? styles.block : undefined,
  ]
    .filter((name): name is string => name !== undefined)
    .join(' ');
}
