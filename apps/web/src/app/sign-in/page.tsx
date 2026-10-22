import { signIn } from '@/auth';
import { LogoMark } from '@/components/art/LogoMark';
import { Button } from '@/components/ui/Button';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { Hero } from '@/components/ui/Hero';
import styles from './signIn.module.css';

async function googleSignIn(formData: FormData) {
  'use server';
  const callbackUrl = formData.get('callbackUrl');
  await signIn('google', {
    redirectTo: typeof callbackUrl === 'string' ? callbackUrl : '/dashboard',
  });
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;

  return (
    <Hero>
      <LogoMark size={56} />
      <Eyebrow>Welcome</Eyebrow>
      <h1>Your friends are hungry. Probably.</h1>
      <p>
        Plan brunch with the gang in 30 seconds. Pick a spot, pick a time, send it. We&apos;ll
        handle the rest.
      </p>
      <form action={googleSignIn}>
        <input type="hidden" name="callbackUrl" value={callbackUrl ?? '/dashboard'} />
        <Button type="submit" variant="primary" size="lg" block>
          Sign in with Google
        </Button>
      </form>
      <small className={styles.note}>We never post for you. Promise.</small>
    </Hero>
  );
}
