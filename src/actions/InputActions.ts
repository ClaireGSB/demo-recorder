// src/actions/InputActions.ts
import { Page } from 'puppeteer';
import { MouseActions } from './MouseActions';
import { delay } from '../utils/delay';

export interface TypeOptions {
  delay?: number;
  isTextarea?: boolean;
}

export class InputActions {
  private mouseActions: MouseActions;

  constructor(private page: Page) {
    this.mouseActions = new MouseActions(page);
  }

  async typeText(selector: string, text: string, options: TypeOptions = {}) {
    const { 
      delay: typeDelay = 100, 
      isTextarea = false 
    } = options;

    // Use mouse movement for more natural interaction
    const targetSelector = isTextarea ? `${selector} textarea` : selector;
    await this.mouseActions.click(targetSelector);
    
    // Ensure element is focused
    await this.page.focus(targetSelector);
    
    // Type with delay for natural appearance
    await this.page.type(targetSelector, text, { delay: typeDelay });
    
    // Small pause after typing
    await delay(500);
  }

  async clearAndType(selector: string, text: string, options: TypeOptions = {}) {
    const targetSelector = options.isTextarea ? `${selector} textarea` : selector;
    
    await this.mouseActions.click(targetSelector);
    await this.page.focus(targetSelector);
    
    // Clear existing content
    await this.page.keyboard.down('Control');
    await this.page.keyboard.press('A');
    await this.page.keyboard.up('Control');
    await this.page.keyboard.press('Backspace');
    
    // Type new content
    await this.typeText(selector, text, options);
  }
}
