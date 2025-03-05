// src/recorder/core/DemoRecorder.ts

import * as puppeteer from 'puppeteer';
import { MouseActions } from '../../actions/MouseActions';
import { InputActions } from '../../actions/InputActions';
import { SelectActions } from '../../actions/SelectActions';
import { ZoomActions } from '../../actions/ZoomActions';
import { ScreenRecorder } from './ScreenRecorder';
import { delay } from '../../utils/delay';
import { DemoConfig, RecordingOptions } from '../types';
import { MetricsLogger } from '../metrics/MetricsLogger';
import { DEFAULT_RECORDING_SETTINGS } from '../config/RecorderConfig';
import { ScreenshotCapture } from '../screenshots/ScreenshotCapture';




export class DemoRecorder {
  private browser?: puppeteer.Browser;
  private page?: puppeteer.Page;
  private recorder?: ScreenRecorder;
  private mouseActions?: MouseActions;
  private inputActions?: InputActions;
  private selectActions?: SelectActions;
  private screenshotCapture?: ScreenshotCapture;
  private needsRecording: boolean = false;


  constructor(private config: DemoConfig) {
    // Check if any step requires recording
    this.needsRecording = config.steps.some(step =>
      ['startRecording', 'stopRecording', 'pauseRecording', 'resumeRecording'].includes(step.type)
    );
  }

  async initialize(): Promise<void> {
    this.browser = await puppeteer.launch({
      headless: false,
      defaultViewport: this.config.project.viewport
    });

    this.page = await this.browser.newPage();

    const mouseColor = this.config.project.cursor?.mouseDownColor;

    if (mouseColor) {
      this.mouseActions = MouseActions.getInstance(this.page, mouseColor);
    } else {
      this.mouseActions = MouseActions.getInstance(this.page);
    }

    this.mouseActions = MouseActions.getInstance(this.page);

    this.inputActions = new InputActions(this.page);
    this.selectActions = new SelectActions(this.page);
    this.screenshotCapture = new ScreenshotCapture(this.page);

    // Only initialize the recorder if recording steps are present
    if (this.needsRecording) {
      if (!this.config.recording) {
        throw new Error('Recording configuration is required when recording steps are present');
      }

      const recordingOptions: RecordingOptions = {
        ...DEFAULT_RECORDING_SETTINGS,
        outputPath: this.config.recording.output
      };

      this.recorder = new ScreenRecorder(this.page, recordingOptions);
    }
  }

  async executeStep(step: any): Promise<void> {
    if (!this.page || !this.mouseActions || !this.inputActions || !this.selectActions) {
      throw new Error('Recorder not properly initialized');
    }

    try {
      MetricsLogger.logInfo(`Executing step: ${step.type}`);

      switch (step.type) {
        case 'navigate':
          MetricsLogger.logInfo(`Navigating to: ${this.config.project.baseUrl}${step.path}`);
          await this.page.goto(`${this.config.project.baseUrl}${step.path}`, {
            waitUntil: ['networkidle0', 'load']
          });
          await delay(500); // Stabilization delay
          break;

        case 'input':
          MetricsLogger.logInfo(`Typing into: ${step.selector}`);
          const defaultTypeConfig = this.config.recording?.defaultTypeConfig || {};
          const typeConfig = {
            ...defaultTypeConfig,
            ...step.typeConfig
          };
          await this.inputActions.typeText(step.selector!, step.value!, {
            isTextarea: step.selector?.includes('textarea'),
            delay: typeConfig.slowType ? (typeConfig.typeDelay || 150) : 0
          });
          break;

        case 'select':
          MetricsLogger.logInfo(`Selecting from: ${step.selector}`);
          await this.selectActions.select(step.selector!, step.option!);
          break;

        case 'click':
          MetricsLogger.logInfo(`Clicking: ${step.selector}`);
          await this.mouseActions.click(step.selector!);
          break;

        case 'hover':
          MetricsLogger.logInfo(`Hovering over: ${step.selector}`);
          const hoverDuration = step.duration || 1000; // Default to 1 second if not specified

          try {
            await this.mouseActions?.hover(step.selector, hoverDuration);
            MetricsLogger.logInfo(`Completed hovering over: ${step.selector}`);
          } catch (error) {
            MetricsLogger.logError(error as Error, `Hovering over ${step.selector}`);
            throw new Error(`Failed to hover over ${step.selector}: ${error}`);
          }
          break;

        case 'wait':
          MetricsLogger.logInfo(`Waiting: ${step.duration}ms`);
          await delay(step.duration || 1000);
          break;

        case 'waitForSelector':
          MetricsLogger.logInfo(`Waiting for selector: ${step.selector}`);
          const timeout = step.timeout || 30000; // Default to 30 seconds if not specified
          const visible = step.visible !== undefined ? step.visible : true; // Default to waiting for visibility

          try {
            await this.page.waitForSelector(step.selector, {
              timeout: timeout,
              visible: visible
            });
            MetricsLogger.logInfo(`Selector found: ${step.selector}`);
          } catch (error) {
            MetricsLogger.logError(error as Error, `Waiting for selector ${step.selector}`);
            throw new Error(`Timeout (${timeout}ms) waiting for selector: ${step.selector}`);
          }
          break;

        case 'scrollDown':
          MetricsLogger.logInfo(`Scrolling: ${step.pixels}px`);
          await this.mouseActions?.smoothScroll(
            step.pixels,
            step.duration || 1000
          );
          break;

          case 'zoom':
            MetricsLogger.logInfo(`Zooming to: ${step.target}`);
            const zoomActions = new ZoomActions(this.page);
            await zoomActions.zoomToElement(step.target, {
              scale: step.scale,
              duration: step.duration || 1000,
              easing: step.easing || 'ease-in-out',
              waitForCompletion: step.waitForCompletion !== false,
              origin: step.origin || 'center',
              padding: step.padding || 0,
              // fitWidth: step.fitWidth,
              // fitHeight: step.fitHeight,
              // fitMode: step.fitMode,
              // focusPoint: step.focusPoint
            });
            break;
            
          case 'zoomToPoint':
            MetricsLogger.logInfo(`Zooming to point: (${step.x}, ${step.y})`);
            const pointZoomActions = new ZoomActions(this.page);
            await pointZoomActions.zoomToPoint(step.x, step.y, {
              scale: step.scale,
              duration: step.duration || 1000,
              easing: step.easing || 'ease-in-out',
              waitForCompletion: step.waitForCompletion !== false,
              padding: step.padding || 100
            });
            break;
            
          case 'zoomSequence':
            MetricsLogger.logInfo(`Starting zoom sequence with ${step.steps.length} steps`);
            const sequenceZoomActions = new ZoomActions(this.page);
            await sequenceZoomActions.zoomSequence(
              step.steps,
              step.overlap || 0,
              step.waitForCompletion !== false
            );
            break;

        case 'startRecording':
        case 'stopRecording':
        case 'pauseRecording':
        case 'resumeRecording':
          // Verify recorder is initialized when needed
          if (!this.recorder) {
            throw new Error(`Cannot execute ${step.type} step: recorder not initialized. Make sure recording configuration is provided.`);
          }

          // Execute recording steps as before
          if (step.type === 'startRecording') {
            await this.recorder.start(this.config.recording!.output);
          } else if (step.type === 'stopRecording') {
            await this.recorder.stop();
          } else if (step.type === 'pauseRecording') {
            await this.recorder.pause(step.transition);
          } else if (step.type === 'resumeRecording') {
            await this.recorder.resume();
          }
          break;

        case 'takeScreenshot':
          MetricsLogger.logInfo(`Taking screenshot: ${step.outputName}`);
          if (!this.screenshotCapture) throw new Error('Screenshot capture not initialized');

          await this.screenshotCapture.capture({
            outputName: step.outputName,
            target: step.target || 'fullPage',
            viewport: this.config.project.viewport,
            padding: step.padding || 0,
            omitBackground: step.omitBackground || false,
            baseOutputDir: step.baseOutputDir || 'screenshots'
          });
          break;

        default:
          MetricsLogger.logWarning(`Unknown step type: ${step.type}`);
      }
    } catch (error) {
      MetricsLogger.logError(error as Error, `Executing step ${step.type}`);
      throw error;
    }
  }

  async record(): Promise<void> {
    try {
      await this.initialize();
      if (!this.page || !this.recorder) throw new Error('Failed to initialize');

      const startTime = Date.now();

      for (const step of this.config.steps) {
        await this.executeStep(step);
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      MetricsLogger.logInfo('Stopping recording...');
      // Log final recording stats
      MetricsLogger.logInfo('=== Recording Summary ===');
      MetricsLogger.logInfo(`Total Duration: ${(duration / 1000).toFixed(2)} seconds`);
      MetricsLogger.logInfo(`Steps Executed: ${this.config.steps.length}`);
      MetricsLogger.logInfo('=======================');

      if (this.recorder.getStatus().isRecording) {
        await this.recorder.stop();
      }
    } catch (error) {
      MetricsLogger.logError(error as Error, 'Recording');
      throw error;
    } finally {
      if (this.browser) {
        await this.browser.close();
      }
    }
  }
}
