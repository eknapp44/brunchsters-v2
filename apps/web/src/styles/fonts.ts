import { Fraunces, JetBrains_Mono, Nunito } from 'next/font/google';

// next/font downloads these at build time and serves them from our own origin (ADR 0010); the
// variable names are the ones tokens.css reads. If the build ever cannot reach Google, swap
// this file to next/font/local with committed files: nothing else changes.
const nunito = Nunito({ subsets: ['latin'], variable: '--font-nunito', display: 'swap' });

// The Soft axis gives Fraunces its rounded look; opsz tunes it to the size it is drawn at.
const fraunces = Fraunces({
  subsets: ['latin'],
  axes: ['SOFT', 'opsz'],
  variable: '--font-fraunces',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
});

export const fontClassNames: string = [
  nunito.variable,
  fraunces.variable,
  jetbrainsMono.variable,
].join(' ');
