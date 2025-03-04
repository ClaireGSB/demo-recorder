// src/recorder/screenshot/ScreenshotCapture.ts
import * as puppeteer from 'puppeteer';
import * as path from 'path';
import * as fs from 'fs';
import { MetricsLogger } from '../metrics/MetricsLogger';

export interface ScreenshotOptions {
  outputName: string;
  target?: string | 'fullPage';
  viewport?: {
    width: number;
    height: number;
  };
  padding?: number;
  omitBackground?: boolean;
  baseOutputDir?: string;
}

export class ScreenshotCapture {
  constructor(private page: puppeteer.Page) { }

  async capture(options: ScreenshotOptions): Promise<string> {
    const {
      outputName,
      target = 'fullPage',
      padding = 0,
      omitBackground = false,
      baseOutputDir = 'screenshots'
    } = options;

    MetricsLogger.logInfo(`Taking screenshot: ${outputName}, target: ${target}`);

    try {
      // Ensure the output directory exists
      const screenshotDir = path.resolve(process.cwd(), baseOutputDir);
      await fs.promises.mkdir(screenshotDir, { recursive: true });
      const outputPath = path.join(screenshotDir, outputName);

      // Handle screenshot capture based on target
      if (target === 'fullPage') {
        await this.page.screenshot({
          path: outputPath,
          fullPage: true,
          omitBackground
        });
      } else if (target === 'viewport') {
        await this.page.screenshot({
          path: outputPath,
          fullPage: false,
          omitBackground
        });
      } else {
        // Wait for the target element
        const element = await this.page.waitForSelector(target, {
          visible: true,
          timeout: 5000
        });

        if (!element) {
          throw new Error(`Element ${target} not found`);
        }

        // Make background transparent if needed
        if (omitBackground) {
          await this.makeBackgroundTransparent(target);
        }

        // Get element bounds
        const box = await element.boundingBox();
        if (!box) {
          throw new Error('Could not get element bounds');
        }

        // IMPORTANT: Fix for Puppeteer issue #7514
        // https://github.com/puppeteer/puppeteer/issues/7514
        //
        // There's a known discrepancy between how element coordinates work in Puppeteer:
        // 1. The documentation claims boundingBox() returns coordinates "relative to the main frame"
        // 2. In headless mode, coordinates behave as expected without scroll adjustment
        // 3. In non-headless mode, coordinates are viewport-relative and need scroll position added
        //
        // This issue affects screenshot capture when the page is scrolled:
        // - Without adding scroll position: screenshots capture the wrong area (offset by scroll amount)
        // - With adding scroll position: screenshots correctly capture the target element
        //
        // Our fix: Add scroll position to the boundingBox coordinates to ensure consistent
        // behavior in both headless and non-headless modes.
        // NOTE: if addding a headless mode, then test removing the scroll position adjustment

        // Get scroll position
        const scrollPosition = await this.page.evaluate(() => ({
          x: window.scrollX || window.pageXOffset,
          y: window.scrollY || window.pageYOffset
        }));

        // Log scroll position and element bounds for debugging
        MetricsLogger.logInfo(`Scroll position: X=${scrollPosition.x}, Y=${scrollPosition.y}`);
        MetricsLogger.logInfo(`Element bounds: x=${box.x}, y=${box.y}, width=${box.width}, height=${box.height}`);

        // Calculate element's position relative to the document (not viewport)
        // boundingBox() returns position relative to viewport, so add scroll position
        await this.page.screenshot({
          path: outputPath,
          omitBackground,
          captureBeyondViewport: true,
          clip: {
            x: box.x + scrollPosition.x, // Add scroll X offset
            y: box.y + scrollPosition.y, // Add scroll Y offset
            width: box.width + (padding * 2),
            height: box.height + (padding * 2)
          }
        });

        // Restore background if we made it transparent
        if (omitBackground) {
          await this.restoreBackground();
        }
      }

      MetricsLogger.logInfo(`Screenshot saved to: ${outputPath}`);
      return outputPath;
    } catch (error) {
      MetricsLogger.logError(error as Error, 'Screenshot capture');
      throw error;
    }
  }

  private async makeBackgroundTransparent(selector?: string): Promise<void> {
    // First inject a style tag with a class that makes elements transparent
    await this.page.evaluate(() => {
      if (!document.getElementById('screenshot-transparent-style')) {
        const style = document.createElement('style');
        style.id = 'screenshot-transparent-style';
        style.textContent = `
          .screenshot-transparent-bg {
            background: transparent !important;
          }
        `;
        document.head.appendChild(style);
      }
    });

    // Apply the class to elements
    await this.page.evaluate((targetSelector) => {
      // Add transparent class to html and body
      document.documentElement.classList.add('screenshot-transparent-bg');
      document.body.classList.add('screenshot-transparent-bg');

      if (!targetSelector) return;

      const targetElement = document.querySelector(targetSelector);
      if (targetElement instanceof HTMLElement) {
        targetElement.classList.add('screenshot-transparent-bg');

        // Walk up the DOM tree
        let currentElement = targetElement.parentElement;
        while (currentElement && currentElement !== document.documentElement) {
          if (currentElement instanceof HTMLElement) {
            currentElement.classList.add('screenshot-transparent-bg');
          }
          currentElement = currentElement.parentElement;
        }
      }
    }, selector);
  }

  private async restoreBackground(): Promise<void> {
    // Remove the transparent class from all elements
    await this.page.evaluate(() => {
      const elements = document.querySelectorAll('.screenshot-transparent-bg');
      elements.forEach(el => el.classList.remove('screenshot-transparent-bg'));
    });
  }
}
