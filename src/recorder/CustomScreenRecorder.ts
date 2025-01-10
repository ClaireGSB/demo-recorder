//src/recorder/CustomScreenRecorder.ts
import * as puppeteer from 'puppeteer';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { MouseActions } from '../actions/MouseActions';
import { InputActions } from '../actions/InputActions';
import { SelectActions } from '../actions/SelectActions';
import { delay } from '../utils/delay';
import { DemoConfig, RecordingOptions } from './types';

class CustomScreenRecorder {
  private ffmpeg: any;
  private frameCount: number = 0;
  private client: puppeteer.CDPSession | null = null;
  private isRecording: boolean = false;
  private isPaused: boolean = false;
  private pausedTime: number = 0;

  public getStatus() {
    return {
      isRecording: this.isRecording,
      isPaused: this.isPaused
    };
  }


  constructor(
    private page: puppeteer.Page,
    private options: RecordingOptions = {
      fps: 30,
      quality: 90,
      videoCrf: 18,
      videoCodec: 'libx264',
      videoPreset: 'ultrafast'
    }
  ) { }

  async start(outputPath: string): Promise<void> {
    // Ensure the output directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    this.client = await this.page.createCDPSession();
    this.isRecording = true;
    this.isPaused = false;

    this.ffmpeg = spawn('ffmpeg', [
      '-y',
      '-f', 'image2pipe',
      '-r', `${this.options.fps}`,
      '-i', '-',
      '-c:v', this.options.videoCodec,
      '-preset', this.options.videoPreset,
      '-crf', `${this.options.videoCrf}`,
      '-pix_fmt', 'yuv420p',
      outputPath
    ]);

    this.ffmpeg.stderr.on('data', (data: Buffer) => {
      console.log(`FFmpeg: ${data.toString()}`);
    });

    await this.client.send('Page.startScreencast', {
      format: 'jpeg',
      quality: this.options.quality,
      everyNthFrame: 1
    });

    await this.client.on('Page.screencastFrame', async (frame) => {
      try {
        if (!this.client) return;

        this.ffmpeg.stdin.write(Buffer.from(frame.data, 'base64'));
        this.frameCount++;

        await this.client.send('Page.screencastFrameAck', {
          sessionId: frame.sessionId
        }).catch(console.error);
      } catch (error) {
        console.error('Error processing frame:', error);
      }
    });
  }

  async stop(): Promise<void> {
    if (this.client) {
      try {
        await this.client.send('Page.stopScreencast');
        this.ffmpeg.stdin.end();

        await new Promise<void>((resolve, reject) => {
          this.ffmpeg.on('close', (code: number) => {
            if (code === 0) {
              console.log(`Recording completed with ${this.frameCount} frames`);
              resolve();
            } else {
              reject(new Error(`FFmpeg exited with code ${code}`));
            }
          });
        });

        await this.client.detach();
        this.client = null;
      } catch (error) {
        console.error('Error stopping recording:', error);
        throw error;
      }
    }
  }

  async pause(): Promise<void> {
    if (!this.isRecording || this.isPaused) return;

    if (this.client) {
      await this.client.send('Page.stopScreencast');
      this.isPaused = true;
      this.pausedTime = Date.now();
      console.log('Recording paused');
    }
  }

  async resume(): Promise<void> {
    if (!this.isRecording || !this.isPaused) return;

    if (this.client) {
      await this.client.send('Page.startScreencast', {
        format: 'jpeg',
        quality: this.options.quality,
        everyNthFrame: 1
      });
      this.isPaused = false;
      console.log(`Recording resumed after ${Date.now() - this.pausedTime}ms pause`);
    }
  }
}

class DemoRecorder {
  private browser?: puppeteer.Browser;
  private page?: puppeteer.Page;
  private recorder?: CustomScreenRecorder;
  private mouseActions?: MouseActions;
  private inputActions?: InputActions;
  private selectActions?: SelectActions;

  constructor(private config: DemoConfig) { }

  async initialize() {
    this.browser = await puppeteer.launch({
      headless: false,
      defaultViewport: this.config.project.viewport
    });

    this.page = await this.browser.newPage();

    this.mouseActions = new MouseActions(this.page);
    this.recorder = new CustomScreenRecorder(this.page);
    this.inputActions = new InputActions(this.page);
    this.selectActions = new SelectActions(this.page);
  }

  async executeStep(step: any) {
    if (!this.page || !this.mouseActions || !this.inputActions || !this.selectActions) {
      throw new Error('Recorder not properly initialized');
    }

    try {
      console.log(`Executing step: ${step.type}`);

      switch (step.type) {
        case 'navigate':
          console.log(`Navigating to: ${this.config.project.baseUrl}${step.path}`);
          await this.page.goto(`${this.config.project.baseUrl}${step.path}`, {
            waitUntil: ['networkidle0', 'load']
          });
          // Give the page time to stabilize after navigation
          await delay(500);
          break;

        case 'input':
          console.log(`Typing into: ${step.selector}`);
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
          console.log(`Selecting from: ${step.selector}`);
          await this.selectActions.select(step.selector!, step.option!);
          break;

        case 'click':
          console.log(`Clicking: ${step.selector}`);
          await this.mouseActions.click(step.selector!);
          break;

        case 'wait':
          console.log(`Waiting: ${step.duration}ms`);
          await delay(step.duration || 1000);
          break;

        case 'scrollDown':
          console.log(`Scrolling: ${step.pixels}px`);
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
          await this.recorder.pause();
          break;

        case 'resumeRecording':
          if (!this.recorder) throw new Error('Recorder not initialized');
          await this.recorder.resume();
          break;

        default:
          console.warn(`Unknown step type: ${step.type}`);
      }
    } catch (error) {
      console.error(`Error executing step ${step.type}:`, error);
      throw error;
    }
  }

  async record() {
    try {
      await this.initialize();
      if (!this.page || !this.recorder) throw new Error('Failed to initialize');

      // Don't auto-start recording - wait for a startRecording step
      for (const step of this.config.steps) {
        await this.executeStep(step);
      }

      // Only stop if we're still recording at the end
      if (this.recorder.getStatus().isRecording) {
        console.log('Stopping recording...');
        await this.recorder.stop();
      }
    } catch (error) {
      console.error('Recording error:', error);
      throw error;
    } finally {
      if (this.browser) {
        await this.browser.close();
      }
    }
  }
}

export { CustomScreenRecorder, DemoRecorder };
