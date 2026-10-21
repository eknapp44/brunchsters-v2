import type { ReactNode } from 'react';
import { StoreProvider } from '@/store/StoreProvider';

export default function AuthenticatedLayout({ children }: { readonly children: ReactNode }) {
  return <StoreProvider>{children}</StoreProvider>;
}
