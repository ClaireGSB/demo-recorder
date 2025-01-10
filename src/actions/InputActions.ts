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
    this.mouseActions = MouseActions.getInstance(page);
  }

  async typeText(selector: string, text: string, options: TypeOptions = {}) {
    const { 
      delay: typeDelay = 100, 
      isTextarea = false 
    } = options;

    const targetSelector = isTextarea ? `${selector} textarea` : selector;
    
    // Click first
    await this.mouseActions.click(targetSelector);
    
    // Small delay before typing
    await delay(50);
    
    // Type the text
    await this.page.type(targetSelector, text, { delay: typeDelay });
  }

  async clearAndType(selector: string, text: string, options: TypeOptions = {}) {
    const targetSelector = options.isTextarea ? `${selector} textarea` : selector;
    
    await this.mouseActions.click(targetSelector);
    await delay(50);
    
    // Clear existing content
    await this.page.keyboard.down('Control');
    await this.page.keyboard.press('A');
    await this.page.keyboard.up('Control');
    await this.page.keyboard.press('Backspace');
    
    // Type new content
    await this.page.type(targetSelector, text, { delay: options.delay });
  }
}
