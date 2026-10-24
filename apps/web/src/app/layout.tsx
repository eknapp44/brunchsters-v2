import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { auth, signOut } from '@/auth';
import { MainContent } from '@/components/nav/MainContent';
import { TopBar } from '@/components/nav/TopBar';
import { SkipLink } from '@/components/ui/SkipLink';
import { fontClassNames } from '@/styles/fonts';
import '@/styles/tokens.css';
import '@/styles/global.css';
// Loaded here, not only by the Hero component: a page-level notFound() is sent as an empty error
// shell that the browser rebuilds, and the rebuild hung when the Hero stylesheet was still arriving
// (aborted mid-request, so it never finished). With it in the shell, the 404 needs no extra request.
import '@/components/ui/Hero.module.css';

export const metadata: Metadata = {
  title: 'Brunchsters',
  description: 'Plan brunch with friends.',
};

async function signOutAction() {
  'use server';
  await signOut({ redirectTo: '/' });
}

export default async function RootLayout({ children }: { readonly children: ReactNode }) {
  const session = await auth();
  const user = session?.user;

  return (
    <html lang="en" className={fontClassNames}>
      <body>
        <SkipLink />
        <TopBar
          user={
            user === undefined
              ? undefined
              : {
                  name: user.name ?? undefined,
                  email: user.email ?? undefined,
                }
          }
          signOutAction={signOutAction}
        />
        <MainContent>{children}</MainContent>
      </body>
    </html>
  );
}
