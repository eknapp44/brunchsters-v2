import { auth } from '@/auth';
import { LogoMark } from '@/components/art/LogoMark';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Hero } from '@/components/ui/Hero';

export default async function Home() {
  const session = await auth();

  return (
    <Hero>
      <LogoMark size={64} />
      <h1>Brunchsters</h1>
      <p>Coming soon.</p>
      {session === null ? (
        <ButtonLink href="/sign-in" variant="primary" size="lg">
          Sign in
        </ButtonLink>
      ) : (
        <ButtonLink href="/dashboard" variant="primary" size="lg">
          Go to dashboard
        </ButtonLink>
      )}
    </Hero>
  );
}
