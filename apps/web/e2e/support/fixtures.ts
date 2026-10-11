import { test as base, type BrowserContext, type Page } from '@playwright/test';
import { createUser, type TestUser } from './factories';
import { mockPlaces, type PlacesMock } from './places';
import { mintSessionCookie } from './session';

export type Actor = {
  readonly user: TestUser;
  readonly context: BrowserContext;
  readonly page: Page;
  readonly places: PlacesMock;
};

type E2eFixtures = {
  // Creates a brand-new signed-in user with their own browser context, so identities never
  // share cookies. Contexts are closed when the test ends. The built-in `page` fixture stays
  // signed out.
  //
  // `providerEmail` is the address as the identity provider reports it (Google's sometimes has
  // capitals). The account is stored normalized, exactly as a real first sign-in does (ADR 0008).
  readonly makeActor: (
    label: string,
    options?: { readonly providerEmail?: string },
  ) => Promise<Actor>;
};

export const test = base.extend<E2eFixtures>({
  makeActor: async ({ browser }, use) => {
    const contexts: BrowserContext[] = [];

    await use(async (label, options) => {
      const user = await createUser({
        label,
        ...(options?.providerEmail !== undefined ? { email: options.providerEmail } : {}),
      });
      const context = await browser.newContext();
      contexts.push(context);
      await context.addCookies([await mintSessionCookie(user)]);
      const places = await mockPlaces(context);
      const page = await context.newPage();
      return { user, context, page, places };
    });

    await Promise.all(contexts.map((context) => context.close()));
  },
});

export { expect } from '@playwright/test';
