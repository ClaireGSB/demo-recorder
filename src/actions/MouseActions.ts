// src/actions/MouseActions.ts
import { Page } from 'puppeteer';
import { delay } from '../utils/delay';

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
  private currentX: number = 0;
  private currentY: number = 0;
  private isMoving: boolean = false;
  private isInitialized: boolean = false;
  private lastKnownGoodPosition: { x: number, y: number } | null = null;
  private readonly defaultPosition: { x: number, y: number };
  
  constructor(private page: Page) {
    const viewport = page.viewport();
    this.defaultPosition = {
      x: viewport ? viewport.width / 2 : 640,
      y: viewport ? viewport.height / 2 : 400
    };
    this.currentX = this.defaultPosition.x;
    this.currentY = this.defaultPosition.y;
    this.lastKnownGoodPosition = { ...this.defaultPosition };

    // Preserve position across navigation
    page.on('framenavigated', async (frame) => {
      if (frame === page.mainFrame()) {
        if (this.lastKnownGoodPosition) {
          await this.restorePosition();
        }
        // Don't reset isInitialized here
        await this.ensureMouseHelper();
      }
    });
  }

  
  private async ensureMouseHelper() {
    try {
      await this.page.evaluate(() => {
        if (typeof window['mouse-helper'] === 'function') {
          window['mouse-helper']();
        }
      });
    } catch (error) {
      console.warn('Mouse helper reinit failed:', error);
    }
  }
  

  private easeInOutQuad(t: number): number {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  }

  private calculateStepsCount(distance: number): number {
    // More granular steps for smoother movement
    const baseSteps = Math.floor(Math.sqrt(distance) * 2);
    return Math.max(20, Math.min(50, baseSteps));
  }

  private calculateDelay(progress: number, distance: number): number {
    const speedFactor = this.easeInOutQuad(1 - progress);
    // Adjusted for smoother movement
    const baseDelay = Math.max(8, Math.min(16, distance / 1000)); 
    return baseDelay + speedFactor * 4;
  }

  private getRandomOffset(distance: number): number {
    // Scaled random movement based on distance
    const maxOffset = Math.min(2, distance * 0.01);
    return (Math.random() - 0.5) * maxOffset;
  }

  private async waitForMovementComplete(): Promise<void> {
    let attempts = 0;
    const maxAttempts = 100;
    while (this.isMoving && attempts < maxAttempts) {
      await delay(50);
      attempts++;
    }
    if (attempts >= maxAttempts) {
      console.warn('Movement lock timeout - forcing release');
      this.isMoving = false;
    }
  }

  async ensureInitialized() {
    if (!this.isInitialized) {
      try {
        await this.restorePosition();
        this.isInitialized = true;
        console.log(`Mouse position initialized to: ${this.currentX}, ${this.currentY}`);
      } catch (error) {
        console.warn('Failed to initialize mouse position:', error);
        // Don't throw, use default position
        await this.setMousePosition(this.defaultPosition.x, this.defaultPosition.y);
      }
    }
  }

  private async setMousePosition(x: number, y: number) {
    try {
      await this.page.mouse.move(x, y);
      this.currentX = x;
      this.currentY = y;
      this.lastKnownGoodPosition = { x, y };
      console.log(`Mouse position set to: ${x}, ${y}`);
    } catch (error) {
      console.error('Error setting mouse position:', error);
    }
  }

  async moveWithDelay(selector: string, options: MouseMoveOptions = {}) {
    if (this.isMoving) {
      await this.waitForMovementComplete();
    }
    
    this.isMoving = true;

    try {
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

      // Store this as a known good position before movement
      this.lastKnownGoodPosition = { x: startX, y: startY };

      // Calculate distance and determine number of steps
      const distance = Math.sqrt(
        Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2)
      );
      const steps = this.calculateStepsCount(distance);

      // Bezier control point for curved movement
      const controlX = startX + (endX - startX) / 2 + (Math.random() - 0.5) * Math.min(40, distance / 4);
      const controlY = startY + (endY - startY) / 2 + (Math.random() - 0.5) * Math.min(40, distance / 4);

      for (let i = 0; i <= steps; i++) {
        const progress = i / steps;
        const t = this.easeInOutQuad(progress);

        // Quadratic Bezier curve calculation
        const x = Math.pow(1 - t, 2) * startX + 
                  2 * (1 - t) * t * controlX + 
                  Math.pow(t, 2) * endX;
        const y = Math.pow(1 - t, 2) * startY + 
                  2 * (1 - t) * t * controlY + 
                  Math.pow(t, 2) * endY;

        // Add subtle random movement based on distance
        const offset = this.getRandomOffset(distance);
        await this.setMousePosition(
          x + offset,
          y + offset
        );

        this.currentX = x;
        this.currentY = y;

        await delay(this.calculateDelay(progress, distance));
      }

      if (options.shouldClick) {
        // Move exactly to target for click
        await this.setMousePosition(endX, endY);
        this.currentX = endX;
        this.currentY = endY;
        
        await this.page.mouse.down();
        await delay(50 + Math.random() * 50); // Random delay for natural click
        await this.page.mouse.up();
      }

      // Update last known good position after successful movement
      this.lastKnownGoodPosition = { x: endX, y: endY };
      this.currentX = endX;
      this.currentY = endY;

      return true;
    } catch (error) {
      console.error('Error during mouse movement:', error);
      return false;
    } finally {
      this.isMoving = false;
    }
  }

  async click(selector: string) {
    return this.moveWithDelay(selector, { shouldClick: true });
  }

  getPosition() {
    return { x: this.currentX, y: this.currentY };
  }

  async restorePosition() {
    const position = this.lastKnownGoodPosition || this.defaultPosition;
    await this.setMousePosition(position.x, position.y);
  }


  async smoothScroll(pixels: number, duration: number = 1000, moveMouse: boolean = false) {
    if (this.isMoving) {
      await this.waitForMovementComplete();
    }
    
    this.isMoving = true;

    try {
      // Don't reinitialize here
      const startY = this.currentY;
      const steps = Math.floor(duration / 16);
      const pixelsPerStep = pixels / steps;
      const stepDuration = duration / steps;

      for (let i = 0; i < steps; i++) {
        await this.page.evaluate((y) => {
          window.scrollBy(0, y);
        }, pixelsPerStep);

        if (moveMouse) {
          const newY = startY + (i * pixelsPerStep);
          await this.setMousePosition(this.currentX, newY);
        }

        await delay(stepDuration);
      }

      // Update position after scroll
      this.lastKnownGoodPosition = {
        x: this.currentX,
        y: this.currentY + pixels
      };
    } finally {
      this.isMoving = false;
    }
  }
}