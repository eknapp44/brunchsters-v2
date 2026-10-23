// The Content-Security-Policy (spec 0012, ADR 0014): built per request, with a fresh nonce, by
// `middleware.ts`. Pure, so every directive is testable without a browser.
//
// What it does: only scripts that carry this request's nonce (or were loaded by one that did,
// 'strict-dynamic') run, so an injected inline script does nothing. Everything else is limited to
// this site, with the one outside address a form may send a person to: Google's sign-in.

// Enforcing since spec 0012 M6: the browser blocks what the policy does not allow. M5 shipped it as
// `Content-Security-Policy-Report-Only` (report and block nothing) while journey S3 proved every
// screen clean; going back to that for a while is this one constant, if a real deployment finds a
// screen the suite could not.
export const CSP_HEADER_NAME = 'Content-Security-Policy';

// Where the sign-in form sends a person (a form post that redirects is checked against
// `form-action`). Needed: an experiment with two local origins (spec 0012) showed Chromium blocks
// a form post's redirect to an origin that is not listed here, and reports `form-action`. One
// origin, forms only.
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
    // Avatars are initials, not photos (ADR 0012), and no stylesheet uses a data: URI, so there is
    // no `data:` here (found unnecessary in the pre-merge review of spec 0012). A photo opt-in will
    // have to add its origin, deliberately.
    ['img-src', "'self'"],
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
