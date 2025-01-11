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
  
  private constructor(private page: Page) {
    console.log('MouseActions initialized with position:', this.lastKnownPosition);
    // Initialize mouse helper
    MouseHelper.getInstance().ensureInitialized(page).catch(error => {
      console.warn('Failed to initialize mouse helper:', error);
    });
  }

  static getInstance(page: Page): MouseActions {
    if (!MouseActions.instance) {
      MouseActions.instance = new MouseActions(page);
    }
    return MouseActions.instance;
  }

  private async moveTo(targetX: number, targetY: number, options: MouseMoveOptions = {}): Promise<void> {
    const {
        minSteps = 25,  // Increased for smoother movement
        maxSteps = 40,
        minDelay = 5,
        maxDelay = 15,
    } = options;
  
    // Calculate total distance
    const distance = Math.sqrt(
        Math.pow(targetX - this.lastKnownPosition.x, 2) + 
        Math.pow(targetY - this.lastKnownPosition.y, 2)
    );
  
    // Calculate steps based on distance, but ensure smooth movement
    const steps = Math.min(maxSteps, Math.max(minSteps, Math.floor(distance / 10)));
    
    // Bezier curve control points
    const p0 = { x: this.lastKnownPosition.x, y: this.lastKnownPosition.y }; // start
    const p3 = { x: targetX, y: targetY }; // end
    
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
  
        return {
            x: oneMinusTCubed * p0.x +
               3 * oneMinusTSquared * t * p1.x +
               3 * oneMinusT * tSquared * p2.x +
               tCubed * p3.x,
            y: oneMinusTCubed * p0.y +
               3 * oneMinusTSquared * t * p1.y +
               3 * oneMinusT * tSquared * p2.y +
               tCubed * p3.y
        };
    };
  
    // Easing function for acceleration/deceleration
    const easeInOutQuad = (t: number) => {
        return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    };
  
    // Perform the movement
    console.log('Beginning movement to:', { targetX, targetY });
    for (let step = 0; step <= steps; step++) {
      console.log('Step:', step);
      console.log('Current position:', this.lastKnownPosition);
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
      console.log('Already moving, waiting 100ms');
      await delay(100);
    }
    
    try {
      console.log(`Pre-movement Coordinates Debug:`, {
        viewport: await this.page.evaluate(() => ({
            scrollY: window.scrollY,
            clientHeight: window.innerHeight
        })),
        elementBox: await this.page.evaluate((sel) => {
            const el = document.querySelector(sel);
            if (!el) return null;
            const rect = el.getBoundingClientRect();
            return {
                viewport: { top: rect.top, bottom: rect.bottom },
                // Cast to HTMLElement to access offsetTop
                offset: el instanceof HTMLElement ? {
                    top: el.offsetTop,
                    bottom: el.offsetTop + el.offsetHeight
                } : null
            };
        }, selector),
        currentMousePosition: this.lastKnownPosition,
        scrollOffset: this.scrollOffset
    });
      this.isMoving = true;
      console.log(`Attempting to click selector: ${selector}`);
      console.log('Current stored position:', this.lastKnownPosition);
      
      // Wait for element to be ready
      const element = await this.page.waitForSelector(selector, { visible: true });
      if (!element) {
        console.log('Element not found');
        return false;
      }

      // Get element position
      const box = await element.boundingBox();
      if (!box) {
        console.log('Could not get element bounding box');
        return false;
      }

      const targetX = box.x + box.width / 2;
      const targetY = box.y + box.height / 2;

      console.log('Element bounding box:', box);
      console.log('Beginning movement to element center:', { targetX, targetY });
      
      // Move with steps
      await this.moveTo(targetX, targetY);
      
      console.log('Performing click action');
      await this.page.mouse.down();
      await delay(50);
      await this.page.mouse.up();
      console.log('Click completed');
      
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
      console.log('Already moving, waiting 100ms before scroll');
      await delay(100);
    }

    const helperStateBefore = await this.page.evaluate(() => {
      const helper = document.querySelector('.mouse-helper');
      if (helper) {
        const rect = helper.getBoundingClientRect();
        return {
          top: rect.top,
          left: rect.left,
          style: helper.getAttribute('style')
        };
      }
      return null;
    });
    console.log('Mouse helper state before scroll:', helperStateBefore);
  
    
    try {
      this.isMoving = true;
      console.log(`Starting smooth scroll: ${pixels}px over ${duration}ms`);
      const steps = Math.floor(duration / 16);
      // pixels per step need to be integer. round down to avoid scrolling too far
      const pixelsPerStep = Math.floor(pixels / steps);
      // the remainder pixels to scroll
      const remainder = pixels % steps;      

      const viewportSize = await this.page.evaluate(() => ({
        scrollY: window.scrollY,
        clientHeight: document.documentElement.clientHeight,
        scrollHeight: document.documentElement.scrollHeight
      }));
      console.log('Viewport state before scroll:', viewportSize);
      console.log('Scroll Debug:', {
        beforeScroll: Date.now(),
        viewport: await this.page.evaluate(() => ({
          scrollY: window.scrollY,
          ready: document.readyState
        }))
      });
      
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

      
      const viewportSize2 = await this.page.evaluate(() => ({
        scrollY: window.scrollY,
        clientHeight: document.documentElement.clientHeight,
        scrollHeight: document.documentElement.scrollHeight
      }));
      console.log('Viewport state before scroll:', viewportSize2);
      
      console.log('Scroll completed. New offset:', this.scrollOffset);
    } finally {
      
      this.isMoving = false;
      const helperStateAfter = await this.page.evaluate(() => {
        const helper = document.querySelector('.mouse-helper');
        if (helper) {
          const rect = helper.getBoundingClientRect();
          return {
            top: rect.top,
            left: rect.left,
            style: helper.getAttribute('style')
          };
        }
        return null;
      });
      console.log('Mouse helper state after scroll:', helperStateAfter);
      console.log('Scroll Debug:', {
        beforeScroll: Date.now(),
        viewport: await this.page.evaluate(() => ({
          scrollY: window.scrollY,
          ready: document.readyState
        }))
      });
      const helperPosition = await this.page.evaluate(() => {
        const helper = document.querySelector('.mouse-helper');
        if (!helper) return null;
        const rect = helper.getBoundingClientRect();
        return {
          visual: { top: rect.top, left: rect.left },
          style: helper.getAttribute('style'),
          scroll: window.scrollY
        };
      });
      console.log('Mouse Helper State:', helperPosition);
    }
  }
}