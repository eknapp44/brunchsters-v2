import { describe, expect, it } from 'vitest';
import {
  buildContentSecurityPolicy,
  CSP_HEADER_NAME,
  generateNonce,
} from './contentSecurityPolicy';

const directive = (policy: string, name: string): string[] | undefined =>
  policy
    .split('; ')
    .map((part) => part.split(' '))
    .find(([first]) => first === name)
    ?.slice(1);

describe('buildContentSecurityPolicy', () => {
  const production = buildContentSecurityPolicy({ nonce: 'abc123', isDevelopment: false });
  const development = buildContentSecurityPolicy({ nonce: 'abc123', isDevelopment: true });

  it("lets scripts run only with this request's nonce, and what a nonced script loads", () => {
    expect(directive(production, 'script-src')).toEqual([
      "'self'",
      "'nonce-abc123'",
      "'strict-dynamic'",
    ]);
  });

  it('never allows eval, inline script or a script from anywhere else in production', () => {
    expect(production).not.toContain('unsafe-eval');
    expect(directive(production, 'script-src')).not.toContain("'unsafe-inline'");
    expect(production).not.toMatch(/https?:\/\/(?!accounts\.google\.com)/);
    expect(production).not.toContain('*');
  });

  it('allows eval and the hot-reload socket only in development', () => {
    expect(directive(development, 'script-src')).toContain("'unsafe-eval'");
    expect(directive(development, 'connect-src')).toEqual(["'self'", 'ws:', 'wss:']);
    expect(directive(production, 'connect-src')).toEqual(["'self'"]);
  });

  it('needs the nonce for style elements in production, and keeps style attributes working', () => {
    expect(directive(production, 'style-src')).toEqual(["'self'", "'nonce-abc123'"]);
    expect(directive(production, 'style-src-attr')).toEqual(["'unsafe-inline'"]);
    // The dev server injects styles without a nonce.
    expect(directive(development, 'style-src')).toEqual(["'self'", "'unsafe-inline'"]);
  });

  it('keeps everything else on this site', () => {
    expect(directive(production, 'default-src')).toEqual(["'self'"]);
    expect(directive(production, 'img-src')).toEqual(["'self'", 'data:']);
    expect(directive(production, 'font-src')).toEqual(["'self'"]);
    expect(directive(production, 'object-src')).toEqual(["'none'"]);
    expect(directive(production, 'base-uri')).toEqual(["'self'"]);
  });

  it('forbids being framed, as X-Frame-Options does', () => {
    expect(directive(production, 'frame-ancestors')).toEqual(["'none'"]);
  });

  it("lets a form send a person to Google's sign-in and nowhere else", () => {
    expect(directive(production, 'form-action')).toEqual(["'self'", 'https://accounts.google.com']);
  });

  it('is one header value: no line breaks, no empty directive, each name once', () => {
    for (const policy of [production, development]) {
      expect(policy).not.toMatch(/[\r\n]/);
      const names = policy.split('; ').map((part) => part.split(' ')[0]);
      expect(names.every((name) => name !== undefined && name !== '')).toBe(true);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it('puts a different nonce in a different policy', () => {
    const other = buildContentSecurityPolicy({ nonce: 'zzz999', isDevelopment: false });

    expect(other).toContain("'nonce-zzz999'");
    expect(other).not.toContain('abc123');
  });
});

describe('generateNonce', () => {
  it('is a different, header-safe value every time', () => {
    const nonces = Array.from({ length: 500 }, () => generateNonce());

    expect(new Set(nonces).size).toBe(500);
    for (const nonce of nonces) {
      // Base64: allowed in a nonce source, and nothing that could end the directive.
      expect(nonce).toMatch(/^[A-Za-z0-9+/]+=*$/);
      expect(nonce.length).toBeGreaterThanOrEqual(32);
    }
  });
});

describe('CSP_HEADER_NAME', () => {
  it('is the enforcing header (M5 shipped the report-only one first)', () => {
    expect(CSP_HEADER_NAME).toBe('Content-Security-Policy');
  });
});
