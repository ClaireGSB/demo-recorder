// src/actions/ZoomActions.ts
import { Page, ElementHandle } from 'puppeteer';
import { delay } from '../utils/delay';

export interface ZoomOptions {
  scale: number;
  duration: number;
  easing?: string;
  waitForCompletion?: boolean;
  origin?: 'center' | 'mouse' | { x: number; y: number };
  padding?: number;
}

export class ZoomActions {
  private mouseTrackerInitialized = false;
  
  constructor(private page: Page) {}
  
  /**
   * Initializes mouse position tracking in the browser
   */
  private async initMouseTracker(): Promise<void> {
    if (this.mouseTrackerInitialized) return;
    
    // Add mouse tracking code to the page
    await this.page.evaluate(() => {
      const globalAny = window as any;
      globalAny.demoRecorderMouseX = window.innerWidth / 2;
      globalAny.demoRecorderMouseY = window.innerHeight / 2;
      
      document.addEventListener('mousemove', (e) => {
        globalAny.demoRecorderMouseX = e.clientX;
        globalAny.demoRecorderMouseY = e.clientY;
      }, { passive: true });
    });
    
    this.mouseTrackerInitialized = true;
  }

  /**
   * Zooms to a specific element using CSS transforms
   */
  async zoomToElement(selector: string, options: ZoomOptions): Promise<void> {
    // Initialize mouse tracking if the origin is 'mouse'
    if (options.origin === 'mouse') {
      await this.initMouseTracker();
    }
    
    const element = await this.page.$(selector);
    if (!element) {
      throw new Error(`Element not found: ${selector}`);
    }
    
    const box = await element.boundingBox();
    if (!box) {
      throw new Error(`Could not get bounding box for element: ${selector}`);
    }
    
    // Add padding if specified
    const padding = options.padding || 0;
    const paddedBox = {
      x: box.x - padding,
      y: box.y - padding,
      width: box.width + (padding * 2),
      height: box.height + (padding * 2)
    };
    
    // First, ensure we've scrolled the element into view
    await element.scrollIntoView().catch(e => {
      console.log('Scroll into view failed, but continuing with zoom:', e);
    });
    
    // Allow a moment for the scroll to complete
    await delay(100);
    
    // Apply the zoom effect
    await this.applyZoomEffect(paddedBox, options);
    
    // Wait for animation to complete if needed
    if (options.waitForCompletion !== false) {
      await delay(options.duration);
    }
  }
  
  /**
   * Zooms to a specific coordinate point
   */
  async zoomToPoint(x: number, y: number, options: ZoomOptions): Promise<void> {
    const size = options.padding || 100; // Default size around point
    const box = {
      x: x - (size / 2),
      y: y - (size / 2),
      width: size,
      height: size
    };
    
    await this.applyZoomEffect(box, options);
    
    if (options.waitForCompletion !== false) {
      await delay(options.duration);
    }
  }
  
  /**
   * Executes a sequence of zoom animations with optional overlap
   */
  async zoomSequence(steps: Array<{target: string; scale: number; duration: number}>, 
                     overlap: number = 0,
                     waitForCompletion: boolean = true): Promise<void> {
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      
      // Start this zoom step
      const zoomPromise = this.zoomToElement(step.target, {
        scale: step.scale,
        duration: step.duration,
        waitForCompletion: false
      });
      
      // If this isn't the last step and there's overlap, schedule the next step
      if (i < steps.length - 1 && overlap > 0) {
        // Calculate when to start the next step
        const overlapTime = Math.min(step.duration, overlap);
        const nextStepDelay = step.duration - overlapTime;
        
        // Wait and then start the next step
        await delay(nextStepDelay);
      } else {
        // If no overlap or last step, wait for this step to complete
        await delay(step.duration);
      }
    }
    
    // Reset to normal view if requested
    if (waitForCompletion) {
      await this.resetZoom();
    }
  }
  
  /**
   * Applies zoom effect using CSS transforms
   */
  private async applyZoomEffect(box: {x: number; y: number; width: number; height: number}, 
                               options: ZoomOptions): Promise<void> {
    // Calculate origin point
    let originX = box.x + (box.width / 2);
    let originY = box.y + (box.height / 2);
    
    if (options.origin === 'mouse') {
      // Get current mouse position
      const mousePosition = await this.page.evaluate(() => {
        const globalAny = window as any;
        return {
          x: globalAny.demoRecorderMouseX || window.innerWidth / 2,
          y: globalAny.demoRecorderMouseY || window.innerHeight / 2
        };
      });
      originX = mousePosition.x;
      originY = mousePosition.y;
    } else if (typeof options.origin === 'object' && options.origin.x !== undefined && options.origin.y !== undefined) {
      originX = options.origin.x;
      originY = options.origin.y;
    }
    
    // Apply the scale transform directly to the page
    await this.page.evaluate(
      ({ originX, originY, scale, duration, easing }) => {
        // Create a style element for our zoom effects if it doesn't exist
        if (!document.getElementById('demo-recorder-zoom-styles')) {
          const styleEl = document.createElement('style');
          styleEl.id = 'demo-recorder-zoom-styles';
          styleEl.textContent = `
            body.demo-recorder-zooming {
              transform-origin: var(--zoom-origin-x) var(--zoom-origin-y) !important;
              transition: transform var(--zoom-duration) var(--zoom-easing) !important;
              transform: scale(var(--zoom-scale)) !important;
              height: 100vh !important;
              width: 100vw !important;
              margin: 0 !important;
              overflow: hidden !important;
            }
          `;
          document.head.appendChild(styleEl);
        }
        
        // Calculate the percentage-based origin
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const originXPercent = (originX / viewportWidth) * 100;
        const originYPercent = (originY / viewportHeight) * 100;
        
        // Store the current scroll position
        const scrollX = window.scrollX;
        const scrollY = window.scrollY;
        
        // Apply necessary CSS variables
        document.documentElement.style.setProperty('--zoom-origin-x', `${originXPercent}%`);
        document.documentElement.style.setProperty('--zoom-origin-y', `${originYPercent}%`);
        document.documentElement.style.setProperty('--zoom-duration', `${duration}ms`);
        document.documentElement.style.setProperty('--zoom-easing', easing || 'ease-in-out');
        document.documentElement.style.setProperty('--zoom-scale', scale.toString());
        
        // Add the zooming class to enable the transform
        document.body.classList.add('demo-recorder-zooming');
        
        // Restore the scroll position after a small delay
        setTimeout(() => {
          window.scrollTo(scrollX, scrollY);
        }, 50);
        
        // Debug indicator (can be removed in production)
        if (!document.getElementById('demo-recorder-zoom-indicator')) {
          const indicator = document.createElement('div');
          indicator.id = 'demo-recorder-zoom-indicator';
          indicator.style.position = 'fixed';
          indicator.style.bottom = '10px';
          indicator.style.right = '10px';
          indicator.style.background = 'rgba(0,0,0,0.7)';
          indicator.style.color = 'white';
          indicator.style.padding = '5px 10px';
          indicator.style.borderRadius = '3px';
          indicator.style.fontSize = '12px';
          indicator.style.fontFamily = 'monospace';
          indicator.style.zIndex = '999999';
          indicator.style.display = 'none';
          document.body.appendChild(indicator);
        }
        
        const indicator = document.getElementById('demo-recorder-zoom-indicator');
        if (indicator) {
          indicator.style.display = 'block';
          indicator.textContent = `Zoom: ${scale.toFixed(1)}x`;
          
          // Hide the indicator after the zoom completes
          setTimeout(() => {
            indicator.style.display = 'none';
          }, duration + 500);
        }
      },
      { 
        originX, 
        originY, 
        scale: options.scale, 
        duration: options.duration, 
        easing: options.easing 
      }
    );
  }
  
  /**
   * Resets zoom to the original state
   */
  async resetZoom(): Promise<void> {
    await this.page.evaluate(() => {
      // Return to normal scale with no transition
      document.documentElement.style.setProperty('--zoom-duration', '0ms');
      document.documentElement.style.setProperty('--zoom-scale', '1');
      
      // Remove the zooming class
      document.body.classList.remove('demo-recorder-zooming');
      
      // Hide the indicator if it exists
      const indicator = document.getElementById('demo-recorder-zoom-indicator');
      if (indicator) {
        indicator.style.display = 'none';
      }
    });
    
    // Small delay to ensure the reset is applied
    await delay(50);
  }
}
