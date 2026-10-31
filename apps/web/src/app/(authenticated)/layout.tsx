import type { ReactNode } from 'react';
import { ToastHost } from '@/components/ui/ToastHost';

// The toast region lives with the signed-in screens. The store it reads is provided by the root
// layout, one per signed-in person (ADR 0011, ADR 0017): the top bar's bell shares the unread count
// with the inbox page, and the bell is in the root layout, above this one.
export default function AuthenticatedLayout({ children }: { readonly children: ReactNode }) {
  return (
    <>
      {children}
      <ToastHost />
    </>
  );
}
