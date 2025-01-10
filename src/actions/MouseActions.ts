// src/actions/MouseActions.ts
import { Page } from 'puppeteer';
import { delay } from '../utils/delay';

export interface MouseMoveOptions {
  delayMs?: number;
  shouldClick?: boolean;
  steps?: number;
}

export class MouseActions {
  private currentX: number = 0;
  private currentY: number = 0;

  constructor(private page: Page) { }

  async moveWithDelay(selector: string, options: MouseMoveOptions = {}) {
    const {
      delayMs = 500,
      shouldClick = true,
      steps = 25
    } = options;

    const element = await this.page.$(selector);
    if (!element) {
      console.warn(`Element not found: ${selector}`);
      return false;
    }

    const box = await element.boundingBox();
    if (!box) {
      console.warn(`Could not get bounding box for: ${selector}`);
      return false;
    }

    const startX = this.currentX;
    const startY = this.currentY;
    const endX = box.x + box.width / 2;
    const endY = box.y + box.height / 2;

    // Smooth mouse movement
    for (let i = 0; i <= steps; i++) {
      const x = startX + (endX - startX) * (i / steps);
      const y = startY + (endY - startY) * (i / steps);
      await this.page.mouse.move(x, y);
      this.currentX = x;
      this.currentY = y;
      await delay(delayMs / steps);
    }

    if (shouldClick) {
      await this.page.mouse.down();
      await delay(100);
      await this.page.mouse.up();
      await delay(200);
    }

    return true;
  }

  async click(selector: string) {
    return this.moveWithDelay(selector, { shouldClick: true });
  }

  getPosition() {
    return { x: this.currentX, y: this.currentY };
  }

  async smoothScroll(pixels: number, duration: number = 1000, moveMouse: boolean = false) {
    const steps = Math.floor(duration / 16);  // ~60fps
    const pixelsPerStep = pixels / steps;
    const stepDuration = duration / steps;

    // Get current viewport height
    const viewportHeight = await this.page.evaluate(() => window.innerHeight);

    for (let i = 0; i < steps; i++) {
      // Scroll the page
      await this.page.evaluate((y) => {
        window.scrollBy(0, y);
      }, pixelsPerStep);

      // Move mouse along with scroll if it's in the viewport
      if (moveMouse) {
        const currentPos = this.getPosition();
        if (currentPos.y < viewportHeight) {
          await this.page.mouse.move(
            currentPos.x,
            currentPos.y + pixelsPerStep
          );
          this.currentY += pixelsPerStep;
        }
      }

      await delay(stepDuration);
    }
  }
}
