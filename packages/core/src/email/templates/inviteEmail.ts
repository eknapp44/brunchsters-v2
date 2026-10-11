import { escapeHtml } from './escapeHtml';
import { formatCalendarDate } from './formatBrunchTime';
import { renderEmail } from './layout';
import { safeSubject } from './safeSubject';

export type InviteEmailParams = {
  readonly hostName: string;
  readonly brunchTitle: string;
  readonly description: string | undefined;
  readonly link: string;
  readonly linkExpiresAt: Date;
};

export type RenderedEmail = { readonly subject: string; readonly html: string };

export function renderInviteEmail(params: InviteEmailParams): RenderedEmail {
  const description =
    params.description === undefined || params.description.trim() === ''
      ? ''
      : `<p style="margin:0 0 12px;white-space:pre-line">${escapeHtml(params.description)}</p>`;

  return {
    subject: safeSubject(`${params.hostName} invited you to brunch: ${params.brunchTitle}`),
    html: renderEmail({
      heading: `${params.hostName} invited you to brunch`,
      bodyHtml: [
        `<p style="margin:0 0 12px"><strong>${escapeHtml(params.brunchTitle)}</strong></p>`,
        description,
        '<p style="margin:0">Let them know if you can make it, and help pick the place and time.</p>',
      ].join(''),
      buttonLabel: 'View the invite',
      buttonUrl: params.link,
      footerHtml: `This link is personal to you and expires on ${escapeHtml(formatCalendarDate(params.linkExpiresAt))}. If you weren't expecting this, you can ignore the email.`,
    }),
  };
}
