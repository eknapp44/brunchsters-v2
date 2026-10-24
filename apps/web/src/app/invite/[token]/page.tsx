import { getInviteByToken, respondToInvite } from '@brunchsters/core';
import { avatarColorIndex, type InviteToken, type UserId } from '@brunchsters/shared';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { PopIcon } from '@/components/icons/PopIcon';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Hero } from '@/components/ui/Hero';
import { InitialsAvatar } from '@/components/ui/InitialsAvatar';
import { InlineAlert } from '@/components/ui/InlineAlert';
import { db } from '@/lib/db';
import { calledOffInvite } from '@/lib/lifecycleCopy';
import { eventBus } from '@/lib/services';
import styles from './invite.module.css';

// Expired, revoked and unknown tokens all end here with the same words, so a bad token cannot
// say which it was.
const GONE_COLD = "That invite's gone cold.";

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
        <h1>{GONE_COLD}</h1>
        <p>It may have expired. Ask whoever sent it to send a new one.</p>
      </Hero>
    );
  }

  const session = await auth();

  // A link to a brunch the host called off (spec 0013): the news, and nothing to join. This comes
  // before anything is written, so opening the link changes nothing for anyone, signed in or not.
  // The holder already has the title and the host from the same preview; an outsider with no link
  // learns nothing here, because there is no link for them to open.
  if (preview.isCalledOff) {
    const news = calledOffInvite({ hostName: preview.hostName, title: preview.brunchTitle });
    return (
      <Hero>
        <PopIcon name="calendar" size={48} />
        <h1>{news.heading}</h1>
        <p>{news.line}</p>
        {session !== null && (
          <ButtonLink href="/dashboard" variant="secondary">
            Back to your dashboard
          </ButtonLink>
        )}
      </Hero>
    );
  }

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
        <PopIcon name="clock" size={48} />
        <h1>{GONE_COLD}</h1>
        <InlineAlert tone="error">
          <p>We couldn&apos;t use it. Ask whoever sent it for a new one.</p>
        </InlineAlert>
      </Hero>
    );
  }

  return (
    <Hero>
      <div className={styles.card}>
        <InitialsAvatar
          name={preview.hostName}
          colorIndex={avatarColorIndex(preview.hostName)}
          size="lg"
          decorative
        />
        <p className={styles.from}>
          <strong>{preview.hostName}</strong> wants you at brunch{' '}
          <span aria-hidden="true" className={styles.emoji}>
            🥂
          </span>
        </p>
        <h1>{preview.brunchTitle}</h1>
        {preview.description !== undefined && preview.description.trim() !== '' && (
          <p className={styles.quote}>&ldquo;{preview.description}&rdquo;</p>
        )}
      </div>
      <p className={styles.help}>Sign in to RSVP and vote. Takes a second.</p>
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
