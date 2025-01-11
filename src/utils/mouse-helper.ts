// src/utils/mouse-helper.ts
import { Page } from 'puppeteer';
import * as fs from 'fs';
import { delay } from './delay';


interface MouseHelperState {
  initialized: boolean;
  attempts: number;
}

declare global {
  interface Window {
    __mouseHelperState: MouseHelperState;
    __initializeMouseHelper: () => Promise<boolean>;
    'mouse-helper': () => void;
  }
}

export class MouseHelper {
  private static instance: MouseHelper;
  private initialized: boolean = false;
  private initPromise: Promise<void> | null = null;
  private mouseHelperContent: string | null = null;

  private constructor() { }

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

    // Setup the helper code but don't initialize yet
    await page.evaluateOnNewDocument(`
      window.self = window;
      ${this.mouseHelperContent}
      
      // Store initialization state
      window.__mouseHelperState = {
        initialized: false,
        attempts: 0
      };
  
      function initMouseHelper() {
        // Prevent multiple successful initializations
        if (window.__mouseHelperState.initialized) return true;
        
        console.log('InitMouseHelper called, state:', {
          hasHelper: typeof window['mouse-helper'] === 'function',
          readyState: document.readyState,
          attempts: window.__mouseHelperState.attempts
        });
  
        if (typeof window['mouse-helper'] === 'function' && document.readyState === 'complete') {
          try {
            window['mouse-helper']();
            const helperElement = document.querySelector('.mouse-helper');
            if (helperElement) {
              window.__mouseHelperState.initialized = true;
              console.log('Mouse helper initialized successfully');
              return true;
            }
          } catch (error) {
            console.error('Mouse helper initialization attempt failed:', error);
          }
        }
        return false;
      }
  
      // Wait for network idle and document ready
      window.__initializeMouseHelper = async () => {
        // Only attempt if not already initialized
        if (window.__mouseHelperState.initialized) return true;
        
        // Wait for document ready
        if (document.readyState !== 'complete') {
          await new Promise(resolve => window.addEventListener('load', resolve, { once: true }));
        }
  
        // Small delay to ensure DOM is stable
        await new Promise(resolve => setTimeout(resolve, 100));
        
        return initMouseHelper();
      };
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

      // NEW: Wait for navigation to complete and page to be stable
      await page.waitForNavigation({
        waitUntil: ['networkidle0', 'domcontentloaded'],
        timeout: 30000
      }).catch(() => { }); // Ignore timeout, page might already be loaded

      // Try to initialize up to 3 times with increasing delays
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          // NEW: Use the window.__initializeMouseHelper method we defined earlier
          const success = await page.evaluate(async () => {
            return await window.__initializeMouseHelper();
          });

          if (success) {
            console.log('Mouse helper initialized successfully');
            this.initialized = true;
            return;
          }

          // NEW: Exponential backoff between attempts
          if (attempt < 2) {
            await delay(Math.pow(2, attempt) * 100); // 100ms, 200ms, 400ms
          }
        } catch (error) {
          // NEW: Only log warning if it's not a navigation error
          if (error instanceof Error && !error.message.includes('Execution context was destroyed')) {
            console.warn(`Mouse helper init attempt ${attempt + 1} failed:`, error);
          }
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
