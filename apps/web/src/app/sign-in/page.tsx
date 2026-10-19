import { signIn } from '@/auth';
import { LogoMark } from '@/components/art/LogoMark';
import { Button } from '@/components/ui/Button';
import { Hero } from '@/components/ui/Hero';

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
      <h1>Sign in to Brunchsters</h1>
      <form action={googleSignIn}>
        <input type="hidden" name="callbackUrl" value={callbackUrl ?? '/dashboard'} />
        <Button type="submit" variant="primary" size="lg" block>
          Sign in with Google
        </Button>
      </form>
    </Hero>
  );
}
