// src/utils/mouse-helper.ts
import { Page } from 'puppeteer';
import * as fs from 'fs';
import { delay } from './delay';

export class MouseHelper {
  private static instance: MouseHelper;
  private initialized: boolean = false;
  private initPromise: Promise<void> | null = null;
  private mouseHelperContent: string | null = null;

  private constructor() {}

  static getInstance(): MouseHelper {
    if (!MouseHelper.instance) {
      MouseHelper.instance = new MouseHelper();
    }
    return MouseHelper.instance;
  }

  private async loadMouseHelperContent() {
    if (this.mouseHelperContent) return;

    try {
      const mouseHelperPath = require.resolve('mouse-helper/dist/mouse-helper.js');
      this.mouseHelperContent = fs.readFileSync(mouseHelperPath, 'utf8');
      console.log('Mouse helper content loaded, length:', this.mouseHelperContent.length);
    } catch (error) {
      console.error('Failed to load mouse helper content:', error);
      throw error;
    }
  }

  private async initializePage(page: Page): Promise<void> {
    if (!this.mouseHelperContent) {
      await this.loadMouseHelperContent();
    }

    await page.evaluateOnNewDocument(`
      window.self = window;
      ${this.mouseHelperContent}
      
      function initMouseHelper() {
        console.log('InitMouseHelper called, state:', {
          hasHelper: typeof window['mouse-helper'] === 'function',
          readyState: document.readyState
        });

        if (typeof window['mouse-helper'] === 'function') {
          try {
            window['mouse-helper']();
            console.log('Mouse helper initialized successfully');
          } catch (error) {
            console.error('Mouse helper initialization failed:', error);
          }
        }
      }

      // Initialize on page load
      if (document.readyState === 'complete') {
        console.log('Document ready, initializing immediately');
        initMouseHelper();
      } else {
        console.log('Document not ready, waiting for load');
        window.addEventListener('load', initMouseHelper);
      }

      // Backup initialization after a short delay
      setTimeout(() => {
        console.log('Backup initialization triggered');
        initMouseHelper();
      }, 500);
    `);
  }

  async ensureInitialized(page: Page): Promise<boolean> {
    if (this.initPromise) {
      await this.initPromise;
      return this.initialized;
    }

    this.initPromise = this.initialize(page);
    try {
      await this.initPromise;
      return this.initialized;
    } finally {
      this.initPromise = null;
    }
  }

  private async initialize(page: Page): Promise<void> {
    if (this.initialized) return;

    try {
      await this.loadMouseHelperContent();
      await this.initializePage(page);

      // Try to initialize up to 3 times
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const isHelperPresent = await page.evaluate(() => {
            return typeof window['mouse-helper'] === 'function';
          });

          if (isHelperPresent) {
            await page.evaluate(() => {
              window['mouse-helper']();
            });
            
            const helperElement = await page.$('.mouse-helper');
            if (helperElement) {
              console.log('Mouse helper initialized successfully on attempt', attempt + 1);
              this.initialized = true;
              return;
            }
          }

          if (attempt < 2) {
            await delay(100);
          }
        } catch (error) {
          console.warn(`Mouse helper init attempt ${attempt + 1} failed:`, error);
          if (attempt === 2) throw error;
        }
      }
    } catch (error) {
      console.error('Mouse helper initialization failed:', error);
      throw error;
    }
  }

  async reinitialize(page: Page): Promise<void> {
    this.initialized = false;
    this.initPromise = null;
    await this.ensureInitialized(page);
  }
}
