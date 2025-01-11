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
        minSteps = 10,
        maxSteps = 20,
        minDelay = 5,
        maxDelay = 15,
    } = options;

    console.log('Movement Coordinate Debug:', {
      startPosition: {
          x: this.lastKnownPosition.x,
          y: this.lastKnownPosition.y,
          scrollOffset: this.scrollOffset
      },
      targetPosition: {
          x: targetX,
          y: targetY,
          adjustedY: targetY - this.scrollOffset
      },
      viewport: await this.page.evaluate(() => ({
          scrollY: window.scrollY,
          clientHeight: window.innerHeight
      }))
  });
  
    console.log('Starting mouse movement:');
    console.log('Current stored position:', this.lastKnownPosition);
    console.log('Current scroll offset:', this.scrollOffset);
    console.log('Target position:', { x: targetX, y: targetY });
    
  
    const distance = Math.sqrt(
      Math.pow(targetX - this.lastKnownPosition.x, 2) + 
      Math.pow(targetY - this.lastKnownPosition.y, 2)
    );
    const steps = Math.min(maxSteps, Math.max(minSteps, Math.floor(distance / 5)));
  
    const stepX = (targetX - this.lastKnownPosition.x) / steps;
    const stepY = (targetY - this.lastKnownPosition.y) / steps;

    let currentX = this.lastKnownPosition.x;
    let currentY = this.lastKnownPosition.y;
  
    for (let i = 0; i < steps; i++) {
        currentX += stepX;
        currentY += stepY;
  
        console.log(`Step ${i + 1}/${steps}:`, { currentX, currentY });
        await this.page.mouse.move(currentX, currentY);
        this.lastKnownPosition = { x: currentX, y: currentY };
        
        const stepDelay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
        await delay(stepDelay);
    }
    
    // Ensure we end up exactly at the target
    await this.page.mouse.move(targetX, targetY);
    this.lastKnownPosition = { x: targetX, y: targetY };
    console.log('Final position stored as:', this.lastKnownPosition);

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