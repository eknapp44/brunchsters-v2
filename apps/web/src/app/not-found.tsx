import { PopIcon } from '@/components/icons/PopIcon';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Hero } from '@/components/ui/Hero';

// Every 404 in the app ends here: a made-up address, a brunch that does not exist, and a brunch
// the visitor is not part of all get exactly these words (the 404-vs-403 rule: an outsider must
// not be able to tell them apart). So nothing here says "brunch", "private" or "not yours".
export default function NotFound() {
  return (
    <Hero>
      <PopIcon name="egg" size={48} />
      <h1>This table&apos;s empty.</h1>
      <p>There&apos;s nothing at this address.</p>
      <ButtonLink href="/" variant="primary" size="lg">
        Back home
      </ButtonLink>
    </Hero>
  );
}
