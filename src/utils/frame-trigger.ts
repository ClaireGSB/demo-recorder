// src/utils/frame-trigger.ts
import { Page } from 'puppeteer';
import { MetricsLogger } from '../recorder/metrics/MetricsLogger';

export class FrameTrigger {
  private static instance: FrameTrigger | null = null;
  private isInitialized: boolean = false;

  private constructor() {}

  static getInstance(): FrameTrigger {
    if (!FrameTrigger.instance) {
      FrameTrigger.instance = new FrameTrigger();
    }
    return FrameTrigger.instance;
  }

  async initialize(page: Page): Promise<void> {
    if (this.isInitialized) return;

    try {
      await page.evaluate(() => {
        console.log('Initializing frame trigger');
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

        // Use multiple requestAnimationFrame loops with different patterns
        const animate = () => {
          // Get current time in seconds
          const time = performance.now() / 1000;
          
          // Different animation patterns for each trigger
          triggers.topLeft.style.opacity = (Math.sin(time) * 0.004 + 0.01).toString();
          triggers.topLeft.style.transform = `translateZ(0) scale(${0.99 + Math.sin(time) * 0.01})`;
          
          triggers.topRight.style.opacity = (Math.cos(time * 1.5) * 0.004 + 0.01).toString();
          triggers.topRight.style.transform = `translateZ(0) rotate(${Math.sin(time) * 0.5}deg)`;
          
          triggers.bottomLeft.style.opacity = (Math.sin(time * 2) * 0.004 + 0.01).toString();
          triggers.bottomLeft.style.transform = `translateZ(0) translate(${Math.cos(time) * 0.5}px, 0)`;
          
          triggers.bottomRight.style.opacity = (Math.cos(time * 2.5) * 0.004 + 0.01).toString();
          triggers.bottomRight.style.transform = `translateZ(0) skew(${Math.sin(time) * 0.2}deg)`;

          requestAnimationFrame(animate);
        };

        // Start animation
        requestAnimationFrame(animate);
      });

      this.isInitialized = true;
      MetricsLogger.logInfo('Frame trigger initialized successfully');
    } catch (error) {
      MetricsLogger.logError(error as Error, 'Frame trigger initialization');
      throw error;
    }
  }
}