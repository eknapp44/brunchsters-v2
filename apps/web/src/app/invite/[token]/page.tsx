import { getInviteByToken, NoopEventBus, respondToInvite } from '@brunchsters/core';
import type { InviteToken, UserId } from '@brunchsters/shared';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { db } from '@/lib/db';

const eventBus = new NoopEventBus();

export default async function InviteLandingPage({
  params,
}: {
  readonly params: Promise<{ readonly token: string }>;
}) {
  const { token: rawToken } = await params;
  const token = rawToken as InviteToken;

  const preview = await getInviteByToken(token, { db });
  if (preview === undefined) {
    return (
      <main>
        <h1>Invite not found</h1>
        <p>This invite has expired or is invalid. Ask the host to resend it.</p>
      </main>
    );
  }

  const session = await auth();

  if (session !== null) {
    const result = await respondToInvite(
      { token, viewerId: session.user.id as UserId, response: 'yes' },
      { db, eventBus },
    );
    if (result.isOk()) {
      redirect(`/brunch/${result.value.brunchId}`);
    }

    return (
      <main>
        <h1>Something went wrong</h1>
        <p>We couldn&apos;t process this invite. Ask the host to resend it.</p>
      </main>
    );
  }

  return (
    <main>
      <h1>You&apos;re invited to {preview.brunchTitle}</h1>
      <p>Hosted by {preview.hostName}</p>
      <p>{preview.brunchStatusLabel}</p>
      <Link href={`/sign-in?callbackUrl=${encodeURIComponent(`/invite/${token}`)}`}>
        Sign in with Google
      </Link>
    </main>
  );
}
