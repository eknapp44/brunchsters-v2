import { escapeHtml } from './escapeHtml';
import { formatBrunchTime } from './formatBrunchTime';
import { fewerEmailsHtml, renderEmail, type RenderedEmail } from './layout';
import { safeSubject } from './safeSubject';

export type BackOnEmailParams = {
  readonly recipientName: string | undefined;
  readonly hostName: string;
  readonly brunchTitle: string;
  readonly plan:
    | { readonly placeName: string; readonly scheduledAt: Date; readonly timezone: string }
    | undefined;
  readonly link: string;
  // Where the footer sends someone who wants fewer emails (see `fewerEmailsHtml`).
  readonly muteUrl?: string | undefined;
  readonly settingsUrl?: string | undefined;
};

// Sent only to people who were told it was off (spec 0013, ADR 0015). Everything is as it was:
// their answer and their votes were kept.
export function renderBackOnEmail(params: BackOnEmailParams): RenderedEmail {
  const greeting =
    params.recipientName === undefined ? 'Hey —' : `Hey ${escapeHtml(params.recipientName)} —`;
  const plan =
    params.plan === undefined
      ? ''
      : `<p style="margin:0 0 12px;color:#6b7280">Same plan: ${escapeHtml(formatBrunchTime({ scheduledAt: params.plan.scheduledAt, timezone: params.plan.timezone }))} at ${escapeHtml(params.plan.placeName)}.</p>`;

  return {
    subject: safeSubject(`${params.brunchTitle} is back on 🥂`),
    html: renderEmail({
      heading: 'Back on.',
      bodyHtml: [
        `<p style="margin:0 0 12px">${greeting}</p>`,
        `<p style="margin:0 0 12px">Good news — ${escapeHtml(params.hostName)} brought <strong>${escapeHtml(params.brunchTitle)}</strong> back. Everything is just as it was, and your answer still counts.</p>`,
        plan,
      ].join(''),
      buttonLabel: 'See the brunch',
      buttonUrl: params.link,
      footerHtml: `You're getting this because you were in on this brunch.${fewerEmailsHtml(params)}`,
    }),
  };
}
