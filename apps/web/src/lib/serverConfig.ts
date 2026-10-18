// Which adapters this process runs, decided once from the environment (ADR 0009).
// Pure: takes the environment as a parameter so every combination is testable.

const SANDBOX_FROM = 'Brunchsters <onboarding@resend.dev>';
const DEV_APP_URL = 'http://localhost:3000';
const DEFAULT_OUTBOX_DIR = '.mail-outbox';

export type EmailConfig =
  | { readonly kind: 'resend'; readonly apiKey: string; readonly from: string }
  | { readonly kind: 'file'; readonly outboxDir: string };

export type QueueConfig = { readonly kind: 'inngest' } | { readonly kind: 'none' };

export type ServerConfig = {
  // Absolute base URL used to build links in emails.
  readonly appUrl: string;
  readonly email: EmailConfig;
  readonly queue: QueueConfig;
};

type Environment = Readonly<Record<string, string | undefined>>;

function present(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === '' ? undefined : trimmed;
}

// A deployed production environment must be fully configured. `NODE_ENV` cannot say
// this: CI and the e2e suite serve a production *build* (`next start`) that is not a
// deployment. Vercel sets VERCEL_ENV (ADR 0002 hosting).
export function isProductionDeployment(env: Environment): boolean {
  return env.VERCEL_ENV === 'production';
}

export function resolveServerConfig(env: Environment): ServerConfig {
  const strict = isProductionDeployment(env);
  const missing: string[] = [];

  const authUrl = present(env.AUTH_URL);
  if (strict && authUrl === undefined) missing.push('AUTH_URL');

  const resendApiKey = present(env.RESEND_API_KEY);
  if (strict && resendApiKey === undefined) missing.push('RESEND_API_KEY');
  // Without it Resend's sandbox sender is used, which can only write to the account owner, so
  // every real recipient would be rejected. Required, not defaulted, in a deployment.
  if (strict && present(env.EMAIL_FROM) === undefined) missing.push('EMAIL_FROM');

  const hasInngestEventKey = present(env.INNGEST_EVENT_KEY) !== undefined;
  if (strict && !hasInngestEventKey) missing.push('INNGEST_EVENT_KEY');
  if (strict && present(env.INNGEST_SIGNING_KEY) === undefined) missing.push('INNGEST_SIGNING_KEY');

  // INNGEST_DEV puts the Inngest SDK in dev mode, which does not verify request signatures.
  // On a deployed production site that would leave the public /api/inngest route open to anyone
  // who can reach it, so it is refused outright rather than trusted to be unset.
  if (strict && present(env.INNGEST_DEV) !== undefined) {
    throw new Error(
      'INNGEST_DEV must not be set in a production deployment: it turns off signature checks on /api/inngest. ' +
        'Remove it from the production environment variables.',
    );
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable${missing.length === 1 ? '' : 's'} for a production deployment: ${missing.join(', ')}. ` +
        'A deployment without them would silently send no email, so the server refuses to start.',
    );
  }

  const email: EmailConfig =
    resendApiKey === undefined
      ? { kind: 'file', outboxDir: present(env.EMAIL_OUTBOX_DIR) ?? DEFAULT_OUTBOX_DIR }
      : { kind: 'resend', apiKey: resendApiKey, from: present(env.EMAIL_FROM) ?? SANDBOX_FROM };

  // INNGEST_DEV selects the local dev server; an event key selects Inngest Cloud.
  const queue: QueueConfig =
    present(env.INNGEST_DEV) !== undefined || hasInngestEventKey
      ? { kind: 'inngest' }
      : { kind: 'none' };

  return { appUrl: authUrl ?? DEV_APP_URL, email, queue };
}
