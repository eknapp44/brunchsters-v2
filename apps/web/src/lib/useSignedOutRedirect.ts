'use client';

import { usePathname, useRouter } from 'next/navigation';
import { signInPathFor } from './signedOut';

// One answer to "the session ended" for every place a page sends a request (the shared mutation
// hook, the ballots, the wizard's create, the place search): give it a failure's code and it
// sends the person to sign in when that code is `signed_out`. Returns whether it did.
export function useSignedOutRedirect(): (code: unknown) => boolean {
  const router = useRouter();
  const pathname = usePathname();
  return (code) => {
    if (code !== 'signed_out') return false;
    router.replace(signInPathFor(pathname));
    return true;
  };
}
