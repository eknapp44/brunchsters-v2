import { describe, expect, it } from 'vitest';
import { signInPathFor } from './signedOut';

describe('signInPathFor', () => {
  it('sends the person to sign in, with this page as the way back', () => {
    expect(signInPathFor('/brunch/abc')).toBe('/sign-in?callbackUrl=%2Fbrunch%2Fabc');
  });

  it('encodes what could break out of the query string', () => {
    expect(signInPathFor('/a?b=c&d=e#f')).toBe('/sign-in?callbackUrl=%2Fa%3Fb%3Dc%26d%3De%23f');
  });
});
