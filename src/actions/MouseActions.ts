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

// Make MouseActions a singleton to ensure position state is maintained
export class MouseActions {
  private static instance: MouseActions | null = null;
  private isMoving: boolean = false;
  private lastKnownPosition: { x: number, y: number } = { x: 0, y: 0 };
  private scrollOffset: number = 0;
  private mouseColor: string | null = null;

  private constructor(private page: Page) {
    console.log('MouseActions initialized with position:', this.lastKnownPosition);
    // Initialize mouse helper
    MouseHelper.getInstance().ensureInitialized(page).catch(error => {
      console.warn('Failed to initialize mouse helper:', error);
    });
  }

  static getInstance(page: Page, mouseColor?: string): MouseActions {
    if (!MouseActions.instance) {
      MouseActions.instance = new MouseActions(page);
    }
    
    // Set mouse color if provided
    if (mouseColor) {
      MouseActions.instance.setMouseColor(mouseColor);
    }
    
    return MouseActions.instance;
  }
  
  setMouseColor(color: string): void {
    this.mouseColor = color;
    
    // Apply the color to the page
    this.applyMouseColor();
  }
  
  private applyMouseColor(): void {
    if (!this.mouseColor || !this.page) return;
    
    // Add a function to the page that will modify the mouse helper elements when they appear
    this.page.evaluateOnNewDocument((colorToApply) => {
      // Function that attempts to modify the mouse helper elements
      function modifyMouseHelper() {
        const container = document.querySelector('.mouse-helper-container');
        if (!container) return false;
        
        // Modify the images with our custom color using CSS
        const styleEl = document.createElement('style');
        styleEl.textContent = `
          .mouse-helper-container img {
            filter: hue-rotate(194deg) saturate(1.5) !important;
          }
        `;
        document.head.appendChild(styleEl);
        return true;
      }
      
      // Try immediately
      if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(modifyMouseHelper, 500);
      }
      
      // Also try when the DOM is loaded
      document.addEventListener('DOMContentLoaded', () => {
        setTimeout(modifyMouseHelper, 500);
      });
      
      // Set up a MutationObserver to watch for the mouse helper being added to the DOM
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.addedNodes.length) {
            if (modifyMouseHelper()) {
              observer.disconnect();
              break;
            }
          }
        }
      });
      
      // Start observing
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    }, this.mouseColor);
  }

  async moveTo(targetX: number, targetY: number, options: MouseMoveOptions = {}): Promise<void> {
    const {
      minSteps = 35,  // Increased for smoother movement
      maxSteps = 50,
      minDelay = 10,
      maxDelay = 15,
    } = options;

    // NEW Adjust target position by scroll offset for distance calculation
    const effectiveStartY = this.lastKnownPosition.y - this.scrollOffset;
    const effectiveTargetY = targetY - this.scrollOffset;


    // Calculate total distance
    const distance = Math.sqrt(
      Math.pow(targetX - this.lastKnownPosition.x, 2) +
      Math.pow(effectiveTargetY - effectiveStartY, 2)
    );

    // Calculate steps based on distance, but ensure smooth movement
    const steps = Math.min(maxSteps, Math.max(minSteps, Math.floor(distance / 10)));

    // Bezier curve control points
    const p0 = { x: this.lastKnownPosition.x, y: effectiveStartY }; // start
    const p3 = { x: targetX, y: effectiveTargetY }; // end

    // Create control points for smooth curve
    // Randomize control points slightly for more natural movement
    const randomizeOffset = () => (Math.random() - 0.5) * distance * 0.2;

    const p1 = {
      x: p0.x + (p3.x - p0.x) * 0.4 + randomizeOffset(),
      y: p0.y + (p3.y - p0.y) * 0.2 + randomizeOffset()
    };

    const p2 = {
      x: p0.x + (p3.x - p0.x) * 0.6 + randomizeOffset(),
      y: p3.y + (p0.y - p3.y) * 0.2 + randomizeOffset()
    };

    // Cubic bezier function
    const bezier = (t: number) => {
      const oneMinusT = 1 - t;
      const oneMinusTSquared = oneMinusT * oneMinusT;
      const oneMinusTCubed = oneMinusTSquared * oneMinusT;
      const tSquared = t * t;
      const tCubed = tSquared * t;

      const point = {
        x: oneMinusTCubed * p0.x +
          3 * oneMinusTSquared * t * p1.x +
          3 * oneMinusT * tSquared * p2.x +
          tCubed * p3.x,
        y: oneMinusTCubed * p0.y +
          3 * oneMinusTSquared * t * p1.y +
          3 * oneMinusT * tSquared * p2.y +
          tCubed * p3.y
      };


      // Add scroll offset back for actual mouse movement
      return {
        x: point.x,
        y: point.y + this.scrollOffset
      };

    };

    // Easing function for acceleration/deceleration
    const easeInOutQuad = (t: number) => {
      return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    };

    // Perform the movement
    console.log('Beginning movement to:', { targetX, targetY });
    for (let step = 0; step <= steps; step++) {
      const t = easeInOutQuad(step / steps); // Apply easing
      const point = bezier(t);

      await this.page.mouse.move(point.x, point.y);
      this.lastKnownPosition = { x: point.x, y: point.y };

      // Variable delay based on acceleration curve
      const progress = step / steps;
      const speedFactor = 1 - Math.abs(2 * progress - 1); // Slower at start/end
      const delay = minDelay + (maxDelay - minDelay) * speedFactor;

      await new Promise(resolve => setTimeout(resolve, delay));
    }

    // Ensure we end exactly at target
    await this.page.mouse.move(targetX, targetY);
    this.lastKnownPosition = { x: targetX, y: targetY };
    console.log('Movement completed; final position:', this.lastKnownPosition);
  }

  async click(selector: string): Promise<boolean> {
    if (this.isMoving) {
      await delay(100);
    }

    try {
      this.isMoving = true;

      // Wait for element to be ready
      const element = await this.page.waitForSelector(selector, { visible: true, timeout: 3000 });
      if (!element) {
        console.log('Element not found');
        return false;
      }
      console.log('Element found:', selector);

      // Get element position
      const box = await element.boundingBox();
      if (!box) {
        console.log('Could not get element bounding box');
        return false;
      }

      console.log('Element bounding box:', box);

      const targetX = box.x + box.width / 2;
      const targetY = box.y + box.height / 2;

      // Move with steps
      await this.moveTo(targetX, targetY);

      console.log('Performing click action on element: ', selector);
      await this.page.mouse.down();
      await delay(50);
      await this.page.mouse.up();
      console.log('Click completed on element:', selector);

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
      console.log(`Starting smooth scroll: ${pixels}px over ${duration}ms`);
      const steps = Math.floor(duration / 16);
      // pixels per step need to be integer. round down to avoid scrolling too far
      const pixelsPerStep = Math.floor(pixels / steps);
      // the remainder pixels to scroll
      const remainder = pixels % steps;

      // Track scroll offset, but don't adjust mouse position
      this.scrollOffset += pixels;

      for (let i = 0; i < steps; i++) {
        await this.page.evaluate((y) => {
          window.scrollBy(0, y);
        }, pixelsPerStep);
        await delay(16);
      }
      // Scroll the remainder pixels
      await this.page.evaluate((y) => {
        window.scrollBy(0, y);
      }, remainder);

      console.log('Scroll completed. New offset:', this.scrollOffset);
    } finally {

      this.isMoving = false;
    }
  }
}