import { describe, expect, it } from 'vitest';
import { renderBackOnEmail } from './backOnEmail';
import { renderCancelledEmail } from './cancelledEmail';

const HOSTILE = '<script>alert(1)</script> "quoted" & more';
const CRLF = String.fromCharCode(13, 10);

const plan = {
  placeName: 'Cafe A',
  scheduledAt: new Date('2026-10-24T15:30:00Z'),
  timezone: 'America/Chicago',
};

describe('renderCancelledEmail', () => {
  const base = {
    recipientName: 'Sam',
    hostName: 'Evan',
    brunchTitle: 'Sunday Funday',
    plan: undefined,
    link: 'https://app.example.com/brunch/b1',
  };

  it('says who called off what, gently, with a way back to the brunch', () => {
    const { subject, html } = renderCancelledEmail(base);

    expect(subject).toBe('Evan called off Sunday Funday');
    expect(html).toContain('>Called off.<');
    expect(html).toContain('Hey Sam —');
    expect(html).toContain('Evan called off <strong>Sunday Funday</strong>. No worries');
    expect(html).toContain('>See the brunch<');
    expect(html).toContain('href="https://app.example.com/brunch/b1"');
  });

  it('says which brunch it was by its place and time when it had them, in the place’s own zone', () => {
    const { html } = renderCancelledEmail({ ...base, plan });

    expect(html).toContain('It was set for Saturday, October 24, 2026 at 10:30 AM CDT at Cafe A.');
  });

  it('has no "it was set for" line for a brunch that was never confirmed', () => {
    expect(renderCancelledEmail(base).html).not.toContain('It was set for');
  });

  it('greets without a name when the recipient has none', () => {
    expect(renderCancelledEmail({ ...base, recipientName: undefined }).html).toContain('Hey —');
  });

  it('does not promise a reason it does not have', () => {
    expect(renderCancelledEmail(base).html).not.toMatch(/reason|\bsaid\b|next month/i);
  });

  it('escapes hostile text in every user-supplied field and the link', () => {
    const { html } = renderCancelledEmail({
      recipientName: HOSTILE,
      hostName: HOSTILE,
      brunchTitle: HOSTILE,
      plan: { ...plan, placeName: HOSTILE },
      link: 'https://x.test/"><script>1</script>',
    });

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('keeps a smuggled newline out of the subject', () => {
    const { subject } = renderCancelledEmail({
      ...base,
      brunchTitle: `Brunch${CRLF}Bcc: attacker@example.com`,
    });

    expect(subject).not.toContain(String.fromCharCode(10));
    expect(subject).not.toContain(String.fromCharCode(13));
  });
});

describe('renderBackOnEmail', () => {
  const base = {
    recipientName: 'Sam',
    hostName: 'Evan',
    brunchTitle: 'Sunday Funday',
    plan: undefined,
    link: 'https://app.example.com/brunch/b1',
  };

  it('says it is back on and that their answer still counts', () => {
    const { subject, html } = renderBackOnEmail(base);

    expect(subject).toBe('Sunday Funday is back on 🥂');
    expect(html).toContain('>Back on.<');
    expect(html).toContain('Evan brought <strong>Sunday Funday</strong> back.');
    expect(html).toContain('your answer still counts');
    expect(html).toContain('href="https://app.example.com/brunch/b1"');
  });

  it('repeats the plan when there was one', () => {
    expect(renderBackOnEmail({ ...base, plan }).html).toContain(
      'Same plan: Saturday, October 24, 2026 at 10:30 AM CDT at Cafe A.',
    );
    expect(renderBackOnEmail(base).html).not.toContain('Same plan');
  });

  it('escapes hostile text and keeps newlines out of the subject', () => {
    const { subject, html } = renderBackOnEmail({
      ...base,
      recipientName: HOSTILE,
      hostName: HOSTILE,
      brunchTitle: `${HOSTILE}${CRLF}Bcc: attacker@example.com`,
    });

    expect(html).not.toContain('<script>');
    expect(subject).not.toContain(String.fromCharCode(10));
  });
});
