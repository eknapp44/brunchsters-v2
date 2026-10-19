import { getInviteByToken, respondToInvite } from '@brunchsters/core';
import type { InviteToken, UserId } from '@brunchsters/shared';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { LogoMark } from '@/components/art/LogoMark';
import { PopIcon } from '@/components/icons/PopIcon';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Hero } from '@/components/ui/Hero';
import { InlineAlert } from '@/components/ui/InlineAlert';
import { db } from '@/lib/db';
import { eventBus } from '@/lib/services';

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
      <Hero>
        <PopIcon name="clock" size={48} />
        <h1>Invite not found</h1>
        <p>This invite has expired or is invalid. Ask the host to resend it.</p>
      </Hero>
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
      <Hero>
        <h1>Something went wrong</h1>
        <InlineAlert tone="error">
          <p>We couldn&apos;t process this invite. Ask the host to resend it.</p>
        </InlineAlert>
      </Hero>
    );
  }

  return (
    <Hero>
      <LogoMark size={56} />
      <h1>You&apos;re invited to {preview.brunchTitle}</h1>
      <p>Hosted by {preview.hostName}</p>
      <Badge tone="accent">{preview.brunchStatusLabel}</Badge>
      <ButtonLink
        href={`/sign-in?callbackUrl=${encodeURIComponent(`/invite/${token}`)}`}
        variant="primary"
        size="lg"
        block
      >
        Sign in with Google
      </ButtonLink>
    </Hero>
  );
}
