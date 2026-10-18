// Runs once when the server starts. Resolving the config here makes a misconfigured
// production deployment fail at startup, with the missing variable named, instead of
// quietly sending no email until the first invite (ADR 0009).
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { resolveServerConfig } = await import('@/lib/serverConfig');
  resolveServerConfig(process.env);
}
