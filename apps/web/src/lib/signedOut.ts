// Where a person goes when a request is refused because their session ended while a page was open
// (spec 0014 M5, ADR 0016): the sign-in page, with a way back to the page they were on (the same
// callback the middleware gives a page request). The path is the page's own, so it is always a path
// on this site (`safeCallbackPath` checks it again on the other side).
export function signInPathFor(pathname: string): string {
  return `/sign-in?callbackUrl=${encodeURIComponent(pathname)}`;
}
