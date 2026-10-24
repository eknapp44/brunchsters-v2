import type { ReactNode } from 'react';
import { ToastHost } from '@/components/ui/ToastHost';
import { StoreProvider } from '@/store/StoreProvider';

// The store and the toast region live here together (ADR 0011, ADR 0016): leaving the signed-in
// area (sign-out) unmounts both, so no draft and no message one person saw can reach the next.
export default function AuthenticatedLayout({ children }: { readonly children: ReactNode }) {
  return (
    <StoreProvider>
      {children}
      <ToastHost />
    </StoreProvider>
  );
}
