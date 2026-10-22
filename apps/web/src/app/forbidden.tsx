import { PopIcon } from '@/components/icons/PopIcon';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Hero } from '@/components/ui/Hero';

// The 403 for a person who belongs to a brunch but lacks the privilege (today: a guest opening
// the host's manage page). Only members ever reach it: an outsider gets the 404 a made-up id
// gets, decided before this is considered (root CLAUDE.md, "Outsiders get 404").
export default function Forbidden() {
  return (
    <Hero>
      <PopIcon name="egg" size={48} />
      <h1>That one&apos;s the host&apos;s.</h1>
      <p>You&apos;re in on this brunch, but changing the plan is the host&apos;s job.</p>
      <ButtonLink href="/dashboard" variant="primary" size="lg">
        Back to dashboard
      </ButtonLink>
    </Hero>
  );
}
