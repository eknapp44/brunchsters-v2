import { escapeHtml } from './escapeHtml';
import { formatBrunchTime } from './formatBrunchTime';
import { renderEmail, type RenderedEmail } from './layout';
import { safeSubject } from './safeSubject';

export type CancelledEmailParams = {
  readonly recipientName: string | undefined;
  readonly hostName: string;
  readonly brunchTitle: string;
  // The confirmed place and time, when the brunch had them: says which brunch it was.
  readonly plan:
    | { readonly placeName: string; readonly scheduledAt: Date; readonly timezone: string }
    | undefined;
  readonly link: string;
};

// "Sam called it off. No worries - these things happen." (Brand Voice: gentle, low-stakes, warm.)
// No reason line yet: the host cannot write one (spec 0013 does not cover it).
export function renderCancelledEmail(params: CancelledEmailParams): RenderedEmail {
  const greeting =
    params.recipientName === undefined ? 'Hey —' : `Hey ${escapeHtml(params.recipientName)} —`;
  const plan =
    params.plan === undefined
      ? ''
      : `<p style="margin:0 0 12px;color:#6b7280">It was set for ${escapeHtml(formatBrunchTime({ scheduledAt: params.plan.scheduledAt, timezone: params.plan.timezone }))} at ${escapeHtml(params.plan.placeName)}.</p>`;

  return {
    subject: safeSubject(`${params.hostName} called off ${params.brunchTitle}`),
    html: renderEmail({
      heading: 'Called off.',
      bodyHtml: [
        `<p style="margin:0 0 12px">${greeting}</p>`,
        `<p style="margin:0 0 12px">${escapeHtml(params.hostName)} called off <strong>${escapeHtml(params.brunchTitle)}</strong>. No worries — these things happen.</p>`,
        plan,
      ].join(''),
      buttonLabel: 'See the brunch',
      buttonUrl: params.link,
      footerHtml: "You're getting this because you were in on this brunch.",
    }),
  };
}
