import { describe, expect, it } from 'vitest';
import { renderConfirmedEmail } from './confirmedEmail';
import { renderInviteEmail } from './inviteEmail';

const HOSTILE = '<script>alert(1)</script> "quoted" & more';
const CRLF = String.fromCharCode(13, 10);

describe('renderInviteEmail', () => {
  const base = {
    hostName: 'Evan',
    brunchTitle: 'Sunday Funday',
    description: 'Bring an appetite',
    link: 'https://app.example.com/invite/abc',
    linkExpiresAt: new Date('2026-11-23T12:00:00Z'),
  };

  it('says who invited whom to what, with the link and its expiry', () => {
    const { subject, html } = renderInviteEmail(base);

    expect(subject).toBe('Evan wants you at brunch 🥂');
    expect(html).toContain('Evan wants you at brunch');
    expect(html).toContain('Evan just put a brunch on the table');
    expect(html).toContain('Sunday Funday');
    expect(html).toContain('>See the brunch<');
    expect(html).toContain('Bring an appetite');
    expect(html).toContain('href="https://app.example.com/invite/abc"');
    expect(html).toContain('November 23, 2026 at 12:00 PM UTC');
  });

  it('omits the description paragraph when there is none', () => {
    const { html } = renderInviteEmail({ ...base, description: undefined });

    expect(html).not.toContain('white-space:pre-line');
  });

  it('escapes hostile text in the title, host name and description', () => {
    const { html } = renderInviteEmail({
      ...base,
      hostName: HOSTILE,
      brunchTitle: HOSTILE,
      description: HOSTILE,
    });

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&quot;quoted&quot; &amp; more');
  });

  it('keeps a smuggled newline out of the subject', () => {
    const { subject } = renderInviteEmail({
      ...base,
      brunchTitle: `Brunch${CRLF}Bcc: attacker@example.com`,
    });

    expect(subject).not.toContain(String.fromCharCode(10));
    expect(subject).not.toContain(String.fromCharCode(13));
  });

  it('escapes a link so it cannot break out of the attribute', () => {
    const { html } = renderInviteEmail({ ...base, link: 'https://x.test/"><script>1</script>' });

    expect(html).not.toContain('<script>');
  });
});

describe('renderConfirmedEmail', () => {
  const base = {
    recipientName: 'Sam',
    hostName: 'Evan',
    brunchTitle: 'Sunday Funday',
    placeName: 'Cafe A',
    placeAddress: '1 Main St, Chicago',
    placeUrl: 'https://maps.google.com/?cid=a',
    scheduledAt: new Date('2026-10-24T15:30:00Z'),
    timezone: 'America/Chicago',
    link: 'https://app.example.com/brunch/b1',
  };

  it('names the place and shows the time in the brunch’s timezone', () => {
    const { subject, html } = renderConfirmedEmail(base);

    expect(subject).toBe('Brunch on. 💕 Sunday Funday');
    expect(html).toContain('>Brunch on.<');
    expect(html).toContain('Hey Sam —');
    expect(html).toContain('Evan locked it in.');
    expect(html).toContain('<strong>Sunday Funday</strong> is happening');
    expect(html).toContain('<a href="https://maps.google.com/?cid=a">Cafe A</a>');
    expect(html).toContain('1 Main St, Chicago');
    expect(html).toContain('Saturday, October 24, 2026 at 10:30 AM CDT');
    expect(html).toContain('href="https://app.example.com/brunch/b1"');
  });

  it('greets without a name when the recipient has none', () => {
    expect(renderConfirmedEmail({ ...base, recipientName: undefined }).html).toContain('Hey —');
  });

  it('does not link a place URL that is not http(s)', () => {
    const { html } = renderConfirmedEmail({ ...base, placeUrl: 'javascript:alert(1)' });

    expect(html).not.toContain('javascript:');
    expect(html).toContain('Cafe A');
  });

  it('escapes hostile text in every user-supplied field', () => {
    const { html } = renderConfirmedEmail({
      ...base,
      recipientName: HOSTILE,
      hostName: HOSTILE,
      brunchTitle: HOSTILE,
      placeName: HOSTILE,
      placeAddress: HOSTILE,
    });

    expect(html).not.toContain('<script>');
  });
});

describe('the way to want fewer emails (spec 0015)', () => {
  const brunch = {
    recipientName: 'Sam',
    hostName: 'Evan',
    brunchTitle: 'Sunday Funday',
    placeName: 'Tartine',
    placeAddress: '600 Guerrero St',
    placeUrl: '',
    scheduledAt: new Date('2026-12-06T18:00:00Z'),
    timezone: 'America/Los_Angeles',
    link: 'https://app.example.com/brunch/b1',
  };

  it('offers muting this brunch and the settings to someone who is in, with both links escaped', () => {
    const { html } = renderConfirmedEmail({
      ...brunch,
      muteUrl: 'https://app.example.com/brunch/b1#notifications',
      settingsUrl: 'https://app.example.com/settings/notifications?a=1&b="2"',
    });

    expect(html).toContain('Want fewer of these?');
    expect(html).toContain('href="https://app.example.com/brunch/b1#notifications"');
    expect(html).toContain('Mute this brunch');
    expect(html).toContain(
      'href="https://app.example.com/settings/notifications?a=1&amp;b=&quot;2&quot;"',
    );
  });

  it('offers only the settings when there is no brunch to mute yet, and nothing when it is given neither', () => {
    const onlySettings = renderConfirmedEmail({
      ...brunch,
      settingsUrl: 'https://app.example.com/settings/notifications',
    }).html;
    expect(onlySettings).toContain('notification settings');
    expect(onlySettings).not.toContain('Mute this brunch');

    expect(renderConfirmedEmail(brunch).html).not.toContain('Want fewer of these?');
  });

  it('puts the settings link in the invite email', () => {
    const { html } = renderInviteEmail({
      hostName: 'Evan',
      brunchTitle: 'Sunday Funday',
      description: undefined,
      link: 'https://app.example.com/invite/abc',
      linkExpiresAt: new Date('2026-11-23T12:00:00Z'),
      settingsUrl: 'https://app.example.com/settings/notifications',
    });

    expect(html).toContain('href="https://app.example.com/settings/notifications"');
    expect(html).not.toContain('Mute this brunch');
  });
});
