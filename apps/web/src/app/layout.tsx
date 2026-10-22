import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { auth, signOut } from '@/auth';
import { MainContent } from '@/components/nav/MainContent';
import { TopBar } from '@/components/nav/TopBar';
import { SkipLink } from '@/components/ui/SkipLink';
import { fontClassNames } from '@/styles/fonts';
import '@/styles/tokens.css';
import '@/styles/global.css';

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
