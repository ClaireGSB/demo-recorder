// src/utils/browser.ts
import * as puppeteer from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';

interface BrowserOptions {
  headless?: boolean;
  viewport?: {
    width: number;
    height: number;
  };
  userDataDir?: string;
}

/**
 * Initializes a Puppeteer browser with the specified options
 */
export async function initializeBrowser(options: BrowserOptions = {}) {
  const defaultOptions: BrowserOptions = {
    headless: false,
    viewport: {
      width: 1280,
      height: 800
    }
  };

  const mergedOptions = { ...defaultOptions, ...options };

  try {
    const browser = await puppeteer.launch({
      headless: mergedOptions.headless,
      defaultViewport: mergedOptions.viewport,
      userDataDir: mergedOptions.userDataDir,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu'
      ]
    });

    return browser;
  } catch (error) {
    console.error('Failed to initialize browser:', error);
    throw error;
  }
}

/**
 * Injects mouse helper script into the page for visualizing cursor movements
 */
export async function injectMouseHelper(page: puppeteer.Page) {
  try {
    // Get the path to the mouse-helper script
    const mouseHelperPath = require.resolve('mouse-helper/dist/mouse-helper.js');
    const mouseHelperContent = fs.readFileSync(mouseHelperPath, 'utf8');

    // Inject the mouse-helper script
    await page.evaluateOnNewDocument(`
      window.self = window;
      ${mouseHelperContent}
      if (document.readyState === 'complete') {
        window['mouse-helper']();
      } else {
        document.addEventListener('DOMContentLoaded', () => {
          window['mouse-helper']();
        });
      }
    `);

    // Also inject it immediately in case we're after DOM ready
    await page.evaluate(`
      window.self = window;
      if (typeof window['mouse-helper'] === 'function') {
        window['mouse-helper']();
      }
    `);
  } catch (error) {
    console.error('Failed to inject mouse helper:', error);
    throw error;
  }
}

/**
 * Ensures the output directory exists for video recordings
 */
export async function ensureOutputDirectory(outputPath: string) {
  try {
    const dir = path.dirname(outputPath);
    await fs.promises.mkdir(dir, { recursive: true });
    return dir;
  } catch (error) {
    console.error('Failed to create output directory:', error);
    throw error;
  }
}

/**
 * Waits for network to be idle and page to be fully loaded
 */
export async function waitForPageLoad(page: puppeteer.Page, timeout = 30000) {
  try {
    await Promise.all([
      page.waitForNavigation({ 
        waitUntil: ['networkidle0', 'load', 'domcontentloaded'],
        timeout 
      }),
      page.waitForFunction(
        'document.readyState === "complete"',
        { timeout }
      )
    ]);
  } catch (error) {
    console.warn('Page load timeout or error:', error);
    // Don't throw - sometimes pages are usable before everything is fully loaded
  }
}

/**
 * Checks if an element is visible and clickable
 */
export async function isElementClickable(page: puppeteer.Page, selector: string): Promise<boolean> {
  try {
    const element = await page.$(selector);
    if (!element) return false;

    const isVisible = await page.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return style && 
             style.display !== 'none' && 
             style.visibility !== 'hidden' && 
             style.opacity !== '0';
    }, element);

    if (!isVisible) return false;

    const box = await element.boundingBox();
    return box !== null;
  } catch {
    return false;
  }
}

/**
 * Safely closes a browser instance
 */
export async function closeBrowser(browser: puppeteer.Browser | undefined) {
  try {
    if (browser) {
      const pages = await browser.pages();
      await Promise.all(pages.map(page => page.close()));
      await browser.close();
    }
  } catch (error) {
    console.error('Error closing browser:', error);
    // Don't throw - this is cleanup code
  }
}
