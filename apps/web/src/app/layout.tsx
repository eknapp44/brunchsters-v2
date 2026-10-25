import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { countUnread } from '@brunchsters/core';
import type { UserId } from '@brunchsters/shared';
import { auth, signOut } from '@/auth';
import { MainContent } from '@/components/nav/MainContent';
import { NotificationBell } from '@/components/nav/NotificationBell';
import { TopBar } from '@/components/nav/TopBar';
import { SkipLink } from '@/components/ui/SkipLink';
import { db } from '@/lib/db';
import { StoreProvider } from '@/store/StoreProvider';
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

  // The bell's first number, so it never flashes empty; it keeps itself fresh after that. A count
  // that cannot be read leaves the bell without a number rather than failing the page.
  const unread =
    user === undefined
      ? undefined
      : (await countUnread({ userId: user.id as UserId }, { db })).unwrapOr(undefined);

  return (
    <html lang="en" className={fontClassNames}>
      <body>
        {/* One store per signed-in person: when the person changes (sign-out, a different
            account) the key changes and the store, with every draft and message in it, is dropped. */}
        <StoreProvider key={user?.id ?? 'signed-out'}>
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
            bell={user === undefined ? undefined : <NotificationBell initialCount={unread} />}
            signOutAction={signOutAction}
          />
          <MainContent>{children}</MainContent>
        </StoreProvider>
      </body>
    </html>
  );
}
