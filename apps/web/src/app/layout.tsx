import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { auth, signOut } from '@/auth';
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
        <nav>
          {user !== undefined && (
            <div>
              {user.image != null && (
                <img src={user.image} alt={user.name ?? 'User avatar'} width={32} height={32} />
              )}
              <span>{user.name ?? user.email}</span>
              <form action={signOutAction}>
                <button type="submit">Sign out</button>
              </form>
            </div>
          )}
        </nav>
        {children}
      </body>
    </html>
  );
}
