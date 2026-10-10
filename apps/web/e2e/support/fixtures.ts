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
  readonly makeActor: (label: string) => Promise<Actor>;
};

export const test = base.extend<E2eFixtures>({
  makeActor: async ({ browser }, use) => {
    const contexts: BrowserContext[] = [];

    await use(async (label) => {
      const user = await createUser({ label });
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
