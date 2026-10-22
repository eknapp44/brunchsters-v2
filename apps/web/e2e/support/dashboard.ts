import { expect, type Page } from '@playwright/test';

// The dashboard's headline is a greeting that changes with the time of day ("Morning, Evan"),
// and the server renders a neutral "Hey, Evan" until the browser has filled the time in. Journeys
// therefore wait on its shape, never on one word of it.
const GREETING = /^(Hey|Morning|Afternoon|Evening), /;

export async function expectDashboard(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { level: 1, name: GREETING })).toBeVisible();
}

// What a person with no brunches sees under the greeting.
export const EMPTY_DASHBOARD_HEADLINE = "The table's set. Now invite some people.";
