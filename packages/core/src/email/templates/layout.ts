import { escapeHtml } from './escapeHtml';

export type RenderedEmail = { readonly subject: string; readonly html: string };

// Shared frame for every email. Inline styles only: mail clients ignore <style>.
export function renderEmail(params: {
  readonly heading: string;
  readonly bodyHtml: string;
  readonly buttonLabel: string;
  readonly buttonUrl: string;
  readonly footerHtml: string;
}): string {
  return [
    '<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1f2937">',
    `<h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(params.heading)}</h1>`,
    params.bodyHtml,
    `<p style="margin:24px 0"><a href="${escapeHtml(params.buttonUrl)}" style="background:#d97706;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block">${escapeHtml(params.buttonLabel)}</a></p>`,
    `<p style="font-size:13px;color:#6b7280;margin:0">${params.footerHtml}</p>`,
    '</div>',
  ].join('');
}
