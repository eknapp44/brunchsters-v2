import { describe, expect, it } from 'vitest';
import { isProductionDeployment, resolveServerConfig } from './serverConfig';

const FULL_PRODUCTION = {
  VERCEL_ENV: 'production',
  AUTH_URL: 'https://brunchsters.example.com',
  RESEND_API_KEY: 're_key',
  EMAIL_FROM: 'Brunchsters <invites@mail.example.com>',
  INNGEST_EVENT_KEY: 'event-key',
  INNGEST_SIGNING_KEY: 'signing-key',
};

describe('resolveServerConfig — local development', () => {
  it('falls back to the file outbox, no queue and localhost when nothing is set', () => {
    expect(resolveServerConfig({})).toEqual({
      appUrl: 'http://localhost:3000',
      email: { kind: 'file', outboxDir: '.mail-outbox' },
      queue: { kind: 'none' },
    });
  });

  it('uses the Inngest bus when INNGEST_DEV is set', () => {
    expect(resolveServerConfig({ INNGEST_DEV: '1' }).queue).toEqual({ kind: 'inngest' });
  });

  it('uses the Inngest bus when an event key is set', () => {
    expect(resolveServerConfig({ INNGEST_EVENT_KEY: 'k' }).queue).toEqual({ kind: 'inngest' });
  });

  it('honors a custom outbox directory', () => {
    expect(resolveServerConfig({ EMAIL_OUTBOX_DIR: '/tmp/mail' }).email).toEqual({
      kind: 'file',
      outboxDir: '/tmp/mail',
    });
  });

  it('uses Resend with the sandbox sender when only the key is set', () => {
    expect(resolveServerConfig({ RESEND_API_KEY: 're_key' }).email).toEqual({
      kind: 'resend',
      apiKey: 're_key',
      from: 'Brunchsters <onboarding@resend.dev>',
    });
  });

  it('treats blank values as unset', () => {
    const config = resolveServerConfig({
      RESEND_API_KEY: '  ',
      INNGEST_EVENT_KEY: '',
      AUTH_URL: '',
    });

    expect(config.email.kind).toBe('file');
    expect(config.queue.kind).toBe('none');
    expect(config.appUrl).toBe('http://localhost:3000');
  });

  it('takes the app URL from AUTH_URL', () => {
    expect(resolveServerConfig({ AUTH_URL: 'http://localhost:3100' }).appUrl).toBe(
      'http://localhost:3100',
    );
  });

  it('does not require production variables for a production build that is not a deployment', () => {
    // CI and the e2e suite run `next start` with NODE_ENV=production and no VERCEL_ENV.
    expect(() => resolveServerConfig({ NODE_ENV: 'production' })).not.toThrow();
  });

  it('does not require production variables on a preview deployment', () => {
    expect(() => resolveServerConfig({ VERCEL_ENV: 'preview' })).not.toThrow();
  });
});

describe('resolveServerConfig — production deployment', () => {
  it('accepts a fully configured deployment', () => {
    expect(resolveServerConfig(FULL_PRODUCTION)).toEqual({
      appUrl: 'https://brunchsters.example.com',
      email: {
        kind: 'resend',
        apiKey: 're_key',
        from: 'Brunchsters <invites@mail.example.com>',
      },
      queue: { kind: 'inngest' },
    });
  });

  it.each(['AUTH_URL', 'RESEND_API_KEY', 'EMAIL_FROM', 'INNGEST_EVENT_KEY', 'INNGEST_SIGNING_KEY'])(
    'refuses to start without %s and names it',
    (name) => {
      const env: Record<string, string | undefined> = { ...FULL_PRODUCTION, [name]: undefined };

      expect(() => resolveServerConfig(env)).toThrow(name);
    },
  );

  it('names every missing variable at once', () => {
    expect(() => resolveServerConfig({ VERCEL_ENV: 'production' })).toThrow(
      /AUTH_URL, RESEND_API_KEY, EMAIL_FROM, INNGEST_EVENT_KEY, INNGEST_SIGNING_KEY/,
    );
  });

  it('refuses INNGEST_DEV, which would turn off signature checks on the public queue route', () => {
    expect(() => resolveServerConfig({ ...FULL_PRODUCTION, INNGEST_DEV: '1' })).toThrow(
      /INNGEST_DEV must not be set in a production deployment/,
    );
  });

  it('accepts a blank INNGEST_DEV, which counts as unset', () => {
    expect(() => resolveServerConfig({ ...FULL_PRODUCTION, INNGEST_DEV: '' })).not.toThrow();
  });

  it('counts a blank value as missing', () => {
    expect(() => resolveServerConfig({ ...FULL_PRODUCTION, RESEND_API_KEY: '   ' })).toThrow(
      'RESEND_API_KEY',
    );
  });
});

describe('isProductionDeployment', () => {
  it('is true only for VERCEL_ENV=production', () => {
    expect(isProductionDeployment({ VERCEL_ENV: 'production' })).toBe(true);
    expect(isProductionDeployment({ VERCEL_ENV: 'preview' })).toBe(false);
    expect(isProductionDeployment({ NODE_ENV: 'production' })).toBe(false);
  });
});
