// Where to send a person after they sign in. It comes from a URL or a form field, so it is
// untrusted: only a path on this site is allowed ("/invite/abc", "/brunch/1?x=2"). Anything that
// could leave the site (an absolute URL, "//evil.test", "/\evil.test", a "javascript:" string) or
// carries a control character falls back to the dashboard. Auth.js also refuses other origins;
// this makes the rule explicit and tested instead of relying on a library default.
export const DEFAULT_CALLBACK_PATH = '/dashboard';

export function safeCallbackPath(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_CALLBACK_PATH;
  const path = value.trim();
  if (!path.startsWith('/')) return DEFAULT_CALLBACK_PATH;
  // "//host" and "/\host" are read by browsers as another site.
  if (path.startsWith('//') || path.startsWith('/\\')) return DEFAULT_CALLBACK_PATH;
  // Any control character (a newline or tab can smuggle a different target past a parser).
  for (const character of path) {
    if (character.charCodeAt(0) < 0x20 || character.charCodeAt(0) === 0x7f) {
      return DEFAULT_CALLBACK_PATH;
    }
  }
  return path;
}
