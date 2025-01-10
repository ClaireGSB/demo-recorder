// src/actions/MouseActions.ts
import { Page } from 'puppeteer';
import { delay } from '../utils/delay';
import { MouseHelper } from '../utils/mouse-helper';

declare global {
  interface Window {
    'mouse-helper': () => void;
  }
}

export interface MouseMoveOptions {
  minSteps?: number;
  maxSteps?: number;
  minDelay?: number;
  maxDelay?: number;
  shouldClick?: boolean;
}

export class MouseActions {
  private isMoving: boolean = false;
  
  constructor(private page: Page) {
    // Initialize mouse helper
    MouseHelper.getInstance().ensureInitialized(page).catch(error => {
      console.warn('Failed to initialize mouse helper:', error);
    });
  }

  async click(selector: string): Promise<boolean> {
    if (this.isMoving) {
      await delay(100);
    }
    
    try {
      this.isMoving = true;
      
      // Wait for element to be ready
      const element = await this.page.waitForSelector(selector, { visible: true });
      if (!element) return false;

      // Get element position
      const box = await element.boundingBox();
      if (!box) return false;

      // Simple direct movement to target
      const targetX = box.x + box.width / 2;
      const targetY = box.y + box.height / 2;
      
      // Move and click in one operation
      await this.page.mouse.move(targetX, targetY);
      await this.page.mouse.down();
      await delay(50);
      await this.page.mouse.up();
      
      return true;
    } catch (error) {
      console.error('Click failed:', error);
      return false;
    } finally {
      this.isMoving = false;
    }
  }

  async smoothScroll(pixels: number, duration: number = 1000): Promise<void> {
    if (this.isMoving) {
      await delay(100);
    }
    
    try {
      this.isMoving = true;
      const steps = Math.floor(duration / 16);
      const pixelsPerStep = pixels / steps;
      
      for (let i = 0; i < steps; i++) {
        await this.page.evaluate((y) => {
          window.scrollBy(0, y);
        }, pixelsPerStep);
        await delay(16);
      }
    } finally {
      this.isMoving = false;
    }
  }
}
