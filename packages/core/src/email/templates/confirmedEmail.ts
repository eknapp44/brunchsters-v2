import { escapeHtml, safeHttpUrl } from './escapeHtml';
import { formatBrunchTime } from './formatBrunchTime';
import { fewerEmailsHtml, renderEmail, type RenderedEmail } from './layout';
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
  // Where the footer sends someone who wants fewer emails (see `fewerEmailsHtml`).
  readonly muteUrl?: string | undefined;
  readonly settingsUrl?: string | undefined;
};

export function renderConfirmedEmail(params: ConfirmedEmailParams): RenderedEmail {
  const placeUrl = safeHttpUrl(params.placeUrl);
  const place =
    placeUrl === undefined
      ? escapeHtml(params.placeName)
      : `<a href="${escapeHtml(placeUrl)}">${escapeHtml(params.placeName)}</a>`;
  const greeting =
    params.recipientName === undefined ? 'Hey —' : `Hey ${escapeHtml(params.recipientName)} —`;

  return {
    subject: safeSubject(`Brunch on. 💕 ${params.brunchTitle}`),
    html: renderEmail({
      heading: 'Brunch on.',
      bodyHtml: [
        `<p style="margin:0 0 12px">${greeting}</p>`,
        `<p style="margin:0 0 12px">${escapeHtml(params.hostName)} locked it in. <strong>${escapeHtml(params.brunchTitle)}</strong> is happening:</p>`,
        `<p style="margin:0 0 4px"><strong>Where:</strong> ${place}</p>`,
        `<p style="margin:0 0 12px;color:#6b7280">${escapeHtml(params.placeAddress)}</p>`,
        `<p style="margin:0"><strong>When:</strong> ${escapeHtml(formatBrunchTime({ scheduledAt: params.scheduledAt, timezone: params.timezone }))}</p>`,
      ].join(''),
      buttonLabel: 'See the brunch',
      buttonUrl: params.link,
      footerHtml: `You're getting this because you're in on this brunch.${fewerEmailsHtml(params)}`,
    }),
  };
}
