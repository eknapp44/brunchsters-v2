import { escapeHtml } from './escapeHtml';
import { fewerEmailsHtml, renderEmail, type RenderedEmail } from './layout';
import { safeSubject } from './safeSubject';

export type DeadlineReminderEmailParams = {
  readonly recipientName: string | undefined;
  readonly brunchTitle: string;
  // How long until voting closes, in words ("about 5 hours"): a brunch has no single time zone for
  // the deadline, so the email says how long, not what o'clock.
  readonly closesIn: string;
  readonly link: string;
  readonly muteUrl?: string | undefined;
  readonly settingsUrl?: string | undefined;
};

// "Last call to vote" (spec 0015 M7): sent once per deadline to the people who can vote and have not.
export function renderDeadlineReminderEmail(params: DeadlineReminderEmailParams): RenderedEmail {
  const greeting =
    params.recipientName === undefined ? 'Hey —' : `Hey ${escapeHtml(params.recipientName)} —`;

  return {
    subject: safeSubject(`${params.brunchTitle} closes soon — have you voted?`),
    html: renderEmail({
      heading: 'Last call to vote.',
      bodyHtml: [
        `<p style="margin:0 0 12px">${greeting}</p>`,
        `<p style="margin:0 0 12px">Voting on <strong>${escapeHtml(params.brunchTitle)}</strong> closes in ${escapeHtml(params.closesIn)}, and you haven't voted yet. It takes a minute.</p>`,
      ].join(''),
      buttonLabel: 'Cast your vote',
      buttonUrl: params.link,
      footerHtml: `You're getting this because you're in on this brunch.${fewerEmailsHtml(params)}`,
    }),
  };
}
