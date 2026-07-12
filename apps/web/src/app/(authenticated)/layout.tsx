import type { ReactNode } from 'react';

export default function AuthenticatedLayout({ children }: { readonly children: ReactNode }) {
  return <>{children}</>;
}
