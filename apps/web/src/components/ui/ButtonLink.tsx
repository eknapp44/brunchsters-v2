import Link from 'next/link';
import type { ComponentProps, ReactElement } from 'react';
import { buttonClassName, type ButtonSize, type ButtonVariant } from './buttonClassName';

type ButtonLinkProps = ComponentProps<typeof Link> & {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly block?: boolean;
};

// A link (role "link", it navigates) that is drawn like a button.
export function ButtonLink({
  variant,
  size,
  block,
  className,
  ...linkProps
}: ButtonLinkProps): ReactElement {
  const own = buttonClassName({
    ...(variant !== undefined ? { variant } : {}),
    ...(size !== undefined ? { size } : {}),
    ...(block !== undefined ? { block } : {}),
  });
  return <Link {...linkProps} className={className === undefined ? own : `${own} ${className}`} />;
}
