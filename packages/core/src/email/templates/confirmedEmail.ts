import { escapeHtml, safeHttpUrl } from './escapeHtml';
import { formatBrunchTime } from './formatBrunchTime';
import type { RenderedEmail } from './inviteEmail';
import { renderEmail } from './layout';
import { safeSubject } from './safeSubject';

export type ConfirmedEmailParams = {
  readonly recipientName: string | undefined;
  readonly hostName: string;
  readonly brunchTitle: string;
  readonly placeName: string;
  readonly placeAddress: string;
  readonly placeUrl: string;
  readonly scheduledAt: Date;
  readonly timezone: string;
  readonly link: string;
};

export function renderConfirmedEmail(params: ConfirmedEmailParams): RenderedEmail {
  const placeUrl = safeHttpUrl(params.placeUrl);
  const place =
    placeUrl === undefined
      ? escapeHtml(params.placeName)
      : `<a href="${escapeHtml(placeUrl)}">${escapeHtml(params.placeName)}</a>`;
  const greeting =
    params.recipientName === undefined ? 'Hi,' : `Hi ${escapeHtml(params.recipientName)},`;

  return {
    subject: safeSubject(`It's on: ${params.brunchTitle}`),
    html: renderEmail({
      heading: `${params.brunchTitle} is confirmed`,
      bodyHtml: [
        `<p style="margin:0 0 12px">${greeting}</p>`,
        `<p style="margin:0 0 12px">${escapeHtml(params.hostName)} locked in the plan.</p>`,
        `<p style="margin:0 0 4px"><strong>Where:</strong> ${place}</p>`,
        `<p style="margin:0 0 12px;color:#6b7280">${escapeHtml(params.placeAddress)}</p>`,
        `<p style="margin:0"><strong>When:</strong> ${escapeHtml(formatBrunchTime({ scheduledAt: params.scheduledAt, timezone: params.timezone }))}</p>`,
      ].join(''),
      buttonLabel: 'View the brunch',
      buttonUrl: params.link,
      footerHtml: 'You are getting this because you are part of this brunch.',
    }),
  };
}
