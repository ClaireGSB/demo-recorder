// src/utils/frame-trigger.ts
/**
 * FrameTrigger solves a specific Chrome/Puppeteer screen recording issue where no frames
 * are sent by Chrome during static UI states. FrameTrigger works by creating invisible DOM elements that
 * perform constant subtle animations, forcing Chrome to generate frames even when the UI
 * is completely still.
 * 
 * The trigger creates 4 tiny (2x2px) invisible elements in the corners of the viewport,
 * each with different subtle animations (opacity, scale, rotation, etc). These animations
 * run at specific intervals matching the target frame rate.
 * 
 * This level of complexity seems required (?) - Various attempts with simpler triggers have failed.
 * 
 * Why it's needed:
 * - Chrome's Page.screencastFrame only captures frames when it detects visual changes
 * - During static UI states (no user interaction/animations), Chrome may not send any frames
 * - This causes recording gaps or frozen frames in the final video
 * 
 * Frame Rate Control:
 * - Chrome can sometimes send too many frames (>60fps), causing slow-motion video
 * - The trigger uses requestAnimationFrame with a time-based throttle
 * - It only updates animations when enough time has passed (1000ms/targetFps)
 * - This ensures Chrome only detects visual changes at the desired interval
 * - Even if Chrome captures more often, frames will be identical between updates
 * 
 * Note: this may not work perfectly? not sure if we get exactly 60 FPS. Will need to dig deeper...
 * 
 * The animations are designed to be:
 * - Invisible to users (tiny size, nearly transparent)
 * - Performance efficient (using transforms, minimal reflows)
 * - Reliable (multiple triggers with different patterns)
 */


import { Page } from 'puppeteer';
import { MetricsLogger } from '../recorder/metrics/MetricsLogger';

export class FrameTrigger {
  private static instance: FrameTrigger | null = null;
  private isInitialized: boolean = false;
  private page: Page | null = null;
  private targetFps: number = 60;

  private constructor() {}

  static getInstance(): FrameTrigger {
    if (!FrameTrigger.instance) {
      FrameTrigger.instance = new FrameTrigger();
    }
    return FrameTrigger.instance;
  }

  async initialize(page: Page, fps: number = 60): Promise<void> {
    this.targetFps = fps;
    this.page = page;
    
    // Set up navigation listener
    page.on('framenavigated', async frame => {
      if (frame === page.mainFrame()) {
        MetricsLogger.logInfo('Main frame navigated, reinitializing frame trigger');
        this.isInitialized = false;
        await this.initializeTriggers();
      }
    });

    await this.initializeTriggers();
  }

  private async initializeTriggers(): Promise<void> {
    if (!this.page || this.isInitialized) return;

    try {
      // Pass targetFps into the evaluate function
      await this.page.evaluate((fps) => {
        console.log('Initializing frame trigger with FPS:', fps);
        // Create multiple triggers with different animation characteristics
        const createTrigger = (id: string, config: any) => {
          const trigger = document.createElement('div');
          trigger.id = `frame-trigger-${id}`;
          trigger.style.cssText = `
            position: fixed;
            background: transparent;
            mix-blend-mode: difference;
            backdrop-filter: none;
            width: 2px;
            height: 2px;
            opacity: 0.01;
            pointer-events: none;
            transform: translateZ(0);
            will-change: transform, opacity;
            z-index: 2147483647;
          `;
          
          // Position each trigger in a different corner
          switch(id) {
            case 'top-left':
              trigger.style.top = '0px';
              trigger.style.left = '0px';
              break;
            case 'top-right':
              trigger.style.top = '0px';
              trigger.style.right = '0px';
              break;
            case 'bottom-left':
              trigger.style.bottom = '0px';
              trigger.style.left = '0px';
              break;
            case 'bottom-right':
              trigger.style.bottom = '0px';
              trigger.style.right = '0px';
              break;
          }
          
          document.body.appendChild(trigger);
          return trigger;
        };

        // Create four triggers in different corners
        const triggers = {
          topLeft: createTrigger('top-left', { frequency: 1.0 }),
          topRight: createTrigger('top-right', { frequency: 1.5 }),
          bottomLeft: createTrigger('bottom-left', { frequency: 2.0 }),
          bottomRight: createTrigger('bottom-right', { frequency: 2.5 })
        };

        let lastFrame = performance.now();
        const frameInterval = 1000 / fps; // Use passed fps parameter

        const animate = () => {
          const now = performance.now();
          const delta = now - lastFrame;
          
          if (delta >= frameInterval) {
            lastFrame = now - (delta % frameInterval);
            
            // Get current time in seconds
            const time = now / 1000;
          
            // Different animation patterns for each trigger
            triggers.topLeft.style.opacity = (Math.sin(time) * 0.004 + 0.01).toString();
            triggers.topLeft.style.transform = `translateZ(0) scale(${0.99 + Math.sin(time) * 0.01})`;
            
            triggers.topRight.style.opacity = (Math.cos(time * 1.5) * 0.004 + 0.01).toString();
            triggers.topRight.style.transform = `translateZ(0) rotate(${Math.sin(time) * 0.5}deg)`;
            
            triggers.bottomLeft.style.opacity = (Math.sin(time * 2) * 0.004 + 0.01).toString();
            triggers.bottomLeft.style.transform = `translateZ(0) translate(${Math.cos(time) * 0.5}px, 0)`;
            
            triggers.bottomRight.style.opacity = (Math.cos(time * 2.5) * 0.004 + 0.01).toString();
            triggers.bottomRight.style.transform = `translateZ(0) skew(${Math.sin(time) * 0.2}deg)`;
          }

          requestAnimationFrame(animate);
        };

        // Start animation
        requestAnimationFrame(animate);
      }, this.targetFps); // Pass targetFps as an argument to evaluate

      this.isInitialized = true;
      MetricsLogger.logInfo('Frame trigger initialized successfully');
    } catch (error) {
      MetricsLogger.logError(error as Error, 'Frame trigger initialization');
      throw error;
    }
  }
}
