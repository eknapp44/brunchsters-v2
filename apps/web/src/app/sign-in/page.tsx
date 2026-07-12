import { signIn } from '@/auth';

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
    <main>
      <h1>Sign in to Brunchsters</h1>
      <form action={googleSignIn}>
        <input type="hidden" name="callbackUrl" value={callbackUrl ?? '/dashboard'} />
        <button type="submit">Sign in with Google</button>
      </form>
    </main>
  );
}
