'use client';

import { useEffect } from 'react';
import { PopIcon } from '@/components/icons/PopIcon';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Hero } from '@/components/ui/Hero';

// The page an unexpected error lands on (Next's error boundary for everything under the root
// layout). `reset` asks the framework to render the page again; nothing is promised beyond that.
export default function ErrorPage(props: {
  readonly error: Error & { readonly digest?: string };
  readonly reset: () => void;
}) {
  useEffect(() => {
    console.error(props.error);
  }, [props.error]);

  return (
    <Hero>
      <PopIcon name="egg" size={48} />
      <h1>Cracked the egg.</h1>
      <p>Something went wrong on our end. Try again?</p>
      <Button type="button" variant="primary" size="lg" onClick={props.reset}>
        Try again
      </Button>
      <ButtonLink href="/" size="lg">
        Back home
      </ButtonLink>
    </Hero>
  );
}
