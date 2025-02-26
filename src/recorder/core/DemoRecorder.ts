// src/recorder/core/DemoRecorder.ts

import * as puppeteer from 'puppeteer';
import { MouseActions } from '../../actions/MouseActions';
import { InputActions } from '../../actions/InputActions';
import { SelectActions } from '../../actions/SelectActions';
import { ScreenRecorder } from './ScreenRecorder';
import { delay } from '../../utils/delay';
import { DemoConfig, RecordingOptions } from '../types';
import { MetricsLogger } from '../metrics/MetricsLogger';
import { DEFAULT_RECORDING_SETTINGS } from '../config/RecorderConfig';



export class DemoRecorder {
  private browser?: puppeteer.Browser;
  private page?: puppeteer.Page;
  private recorder?: ScreenRecorder;
  private mouseActions?: MouseActions;
  private inputActions?: InputActions;
  private selectActions?: SelectActions;

  constructor(private config: DemoConfig) { }

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

    const recordingOptions: RecordingOptions = {
      ...DEFAULT_RECORDING_SETTINGS,
      outputPath: this.config.recording.output
    };

    this.recorder = new ScreenRecorder(this.page, recordingOptions);

    this.inputActions = new InputActions(this.page);
    this.selectActions = new SelectActions(this.page);
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
          const typeConfig = {
            ...this.config.recording.defaultTypeConfig,
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

        case 'wait':
          MetricsLogger.logInfo(`Waiting: ${step.duration}ms`);
          await delay(step.duration || 1000);
          break;

        case 'scrollDown':
          MetricsLogger.logInfo(`Scrolling: ${step.pixels}px`);
          await this.mouseActions?.smoothScroll(
            step.pixels,
            step.duration || 1000
          );
          break;

        case 'startRecording':
          if (!this.recorder) throw new Error('Recorder not initialized');
          await this.recorder.start(this.config.recording.output);
          break;

        case 'stopRecording':
          if (!this.recorder) throw new Error('Recorder not initialized');
          await this.recorder.stop();
          break;

        case 'pauseRecording':
          if (!this.recorder) throw new Error('Recorder not initialized');
          MetricsLogger.logInfo(`Pausing recording${step.transition ? ` with ${step.transition.type} transition` : ''}`);
          // Pass the transition configuration to pause
          await this.recorder.pause(step.transition);
          break;

        case 'resumeRecording':
          if (!this.recorder) throw new Error('Recorder not initialized');
          await this.recorder.resume();
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
