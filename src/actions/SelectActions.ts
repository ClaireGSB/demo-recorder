// src/actions/SelectActions.ts
import { Page, ElementHandle } from 'puppeteer';
import { MouseActions } from './MouseActions';
import { delay } from '../utils/delay';

export class SelectActions {
  private mouseActions: MouseActions;

  constructor(private page: Page) {
    this.mouseActions = MouseActions.getInstance(page);
  }

  async select(selectSelector: string, optionSelector: string) {
    // Open the select
    await this.mouseActions.click(selectSelector);

    // Wait for options to be visible
    await delay(500);

    // Select the option
    await this.mouseActions.click(optionSelector);

    // Wait for select to close
    await delay(500);
  }

  async selectByText(selectSelector: string, text: string) {
    await this.mouseActions.click(selectSelector);
    await delay(500);

    try {
      // Use page.$ instead of evaluateHandle for proper typing
      const options = await this.page.$$(`${selectSelector} .v-list-item`);

      for (const option of options) {
        const textContent = await option.evaluate(el => el.textContent);
        if (textContent?.includes(text)) {
          await option.click();
          await delay(500);
          return;
        }
      }

      console.warn(`Option with text "${text}" not found in select ${selectSelector}`);
    } catch (error) {
      console.error(`Error selecting option: ${error}`);
    }
  }

  async selectByTextSimple(selectSelector: string, text: string) {
    try {
      await this.mouseActions.click(selectSelector);
      await delay(500);

      // Use waitForSelector to ensure the list is visible
      const optionSelector = `${selectSelector} .v-list-item`;
      await this.page.waitForSelector(optionSelector, { visible: true });

      // First find all options
      const options = await this.page.$$(optionSelector);

      // Then find the one with matching text
      for (const option of options) {
        const textContent = await this.page.evaluate(el => el.textContent, option);
        if (textContent?.includes(text)) {
          await option.click();
          await delay(500);
          return;
        }
      }

      console.warn(`Option with text "${text}" not found in select ${selectSelector}`);
    } catch (error) {
      console.error(`Error in selectByTextSimple: ${error}`);
    }
  }
}
