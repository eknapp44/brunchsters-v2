import { expect, type Locator, type Page } from '@playwright/test';
import type { fixturePlaces } from './places';
import { daysFromNow, toDatetimeLocalValue } from './time';

type FixturePlace = (typeof fixturePlaces)[keyof typeof fixturePlaces];

// Drives the creation wizard (/brunch/new). Reused by every journey that starts from it.
export class BrunchWizard {
  constructor(private readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.goto('/brunch/new');
    await expect(this.page.getByRole('heading', { name: 'Plan a Brunch' })).toBeVisible();
  }

  async fillWhat(input: { readonly title: string; readonly description?: string }): Promise<void> {
    await this.page.getByLabel('Title').fill(input.title);
    if (input.description !== undefined) {
      await this.page.getByLabel('Description').fill(input.description);
    }
    await this.next();
  }

  searchBox(): Locator {
    return this.page.getByRole('textbox', { name: 'Search for a place' });
  }

  // Search, pick the prediction, and wait for it to land in the list.
  async addPlace(place: FixturePlace): Promise<void> {
    await this.searchBox().fill(place.name);
    await this.page.getByRole('button', { name: `${place.name} — ${place.address}` }).click();
    await expect(this.selectedItem(place.name)).toBeVisible();
  }

  async addTime(daysAhead: number): Promise<void> {
    await this.page.getByLabel('Date and time').fill(toDatetimeLocalValue(daysFromNow(daysAhead)));
    await this.page.getByRole('button', { name: 'Add Time' }).click();
  }

  async addEmail(email: string): Promise<void> {
    await this.page.getByRole('textbox', { name: 'Email address' }).fill(email);
    await this.page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(this.selectedItem(email)).toBeVisible();
  }

  // An entry in the current step's list (place, time or email), found by its text.
  selectedItem(text: string): Locator {
    return this.page.getByRole('listitem').filter({ hasText: text });
  }

  async remove(text: string): Promise<void> {
    await this.selectedItem(text).getByRole('button', { name: 'Remove' }).click();
  }

  // The main button of steps 1 to 3 (the last step's is create()).
  async next(): Promise<void> {
    await this.page.getByRole('button', { name: 'Continue', exact: true }).click();
  }

  async back(): Promise<void> {
    await this.page.getByRole('button', { name: 'Back', exact: true }).click();
  }

  async create(): Promise<void> {
    await this.page.getByRole('button', { name: 'Create Brunch' }).click();
  }
}
