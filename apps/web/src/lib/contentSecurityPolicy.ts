// The Content-Security-Policy (spec 0012, ADR 0014): built per request, with a fresh nonce, by
// `middleware.ts`. Pure, so every directive is testable without a browser.
//
// What it does: only scripts that carry this request's nonce (or were loaded by one that did,
// 'strict-dynamic') run, so an injected inline script does nothing. Everything else is limited to
// this site, with the one outside address a form may send a person to: Google's sign-in.

// Report-only while the policy is proved on every screen (spec 0012 M5): the browser reports what
// it would have blocked and blocks nothing. M6 changes this one constant to the enforcing header.
export const CSP_HEADER_NAME = 'Content-Security-Policy-Report-Only';

// Where the sign-in form sends a person (a form post that redirects is checked against
// `form-action`). Kept only if the real sign-in shows it is needed (spec 0012 open question 3).
const GOOGLE_SIGN_IN = 'https://accounts.google.com';

// A fresh, unguessable value for every request. A nonce that repeats can be copied into an
// injected script, so it is never cached or reused. Runs on the edge, where `crypto` and `btoa`
// exist.
export function generateNonce(): string {
  return btoa(crypto.randomUUID());
}

export function buildContentSecurityPolicy(params: {
  readonly nonce: string;
  // `next dev` needs what a production build does not: eval in the browser's React tooling, inline
  // styles injected by the dev server, and a websocket for hot reload. Never true in production.
  readonly isDevelopment: boolean;
}): string {
  const { nonce, isDevelopment } = params;

  const directives: readonly (readonly [name: string, ...sources: string[]])[] = [
    ['default-src', "'self'"],
    [
      'script-src',
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      ...(isDevelopment ? ["'unsafe-eval'"] : []),
    ],
    // Style elements need the nonce too; a `style=""` attribute cannot carry one, so attributes
    // (two computed bar widths) have their own allowance, which cannot run script (ADR 0014).
    ['style-src', "'self'", ...(isDevelopment ? ["'unsafe-inline'"] : [`'nonce-${nonce}'`])],
    ['style-src-attr', "'unsafe-inline'"],
    ['img-src', "'self'", 'data:'],
    ['font-src', "'self'"],
    ['connect-src', "'self'", ...(isDevelopment ? ['ws:', 'wss:'] : [])],
    ['object-src', "'none'"],
    ['base-uri', "'self'"],
    // The same promise as `X-Frame-Options: DENY`, in the newer header.
    ['frame-ancestors', "'none'"],
    ['form-action', "'self'", GOOGLE_SIGN_IN],
  ];

  return directives.map((directive) => directive.join(' ')).join('; ');
}
