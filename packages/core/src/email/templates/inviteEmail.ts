import { escapeHtml } from './escapeHtml';
import { formatInstantUtc } from './formatBrunchTime';
import { renderEmail, type RenderedEmail } from './layout';
import { safeSubject } from './safeSubject';

export type InviteEmailParams = {
  readonly hostName: string;
  readonly brunchTitle: string;
  readonly description: string | undefined;
  readonly link: string;
  readonly linkExpiresAt: Date;
};

export function renderInviteEmail(params: InviteEmailParams): RenderedEmail {
  const description =
    params.description === undefined || params.description.trim() === ''
      ? ''
      : `<p style="margin:0 0 12px;white-space:pre-line">${escapeHtml(params.description)}</p>`;

  return {
    subject: safeSubject(`${params.hostName} wants you at brunch 🥂`),
    html: renderEmail({
      heading: `${params.hostName} wants you at brunch`,
      bodyHtml: [
        `<p style="margin:0 0 12px">${escapeHtml(params.hostName)} just put a brunch on the table:</p>`,
        `<p style="margin:0 0 12px"><strong>${escapeHtml(params.brunchTitle)}</strong></p>`,
        description,
        '<p style="margin:0">Tap to RSVP, throw in your vote, and we\'ll keep you posted on what wins.</p>',
      ].join(''),
      buttonLabel: 'See the brunch',
      buttonUrl: params.link,
      footerHtml: `P.S. No app to download. Just tap the link. It's personal to you and expires on ${escapeHtml(formatInstantUtc(params.linkExpiresAt))}. If you weren't expecting this, you can ignore the email.`,
    }),
  };
}
