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
  private frameQueue: Array<{ data: Buffer, timestamp: number }> = [];
  private lastFrameTime: number = 0;
  private targetFrameInterval: number;
  private queueProcessor?: NodeJS.Timeout;
  private frameTimings: number[] = [];
  private queueSizeHistory: number[] = [];
  private lastMetricsLog = Date.now();
  private METRICS_INTERVAL = 5000; // Log every 5 seconds
  private lastFrameEncoded = Date.now();
  private encodingTimes: number[] = [];
  private encodedFrameCount: number = 0;  // Add this to track encoded frames

  public getStatus() {
    return {
      isRecording: this.isRecording,
      isPaused: this.isPaused
    };
  }

  private readonly MAX_QUEUE_SIZE = 30; // Reduced from 30
  private frameCounter = 0;


  constructor(
    private page: puppeteer.Page,
    private options: RecordingOptions = {
      fps: 60,
      quality: 95,
      videoCrf: 17,
      videoCodec: 'libx264',
      videoPreset: 'veryfast'
    }
  ) {
    this.targetFrameInterval = 1000 / this.options.fps;
  }

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
      maxWidth: 1920, // Add this to limit resolution
      maxHeight: 1080, // Add this to limit resolution
      everyNthFrame: 1
    });

    await this.client.on('Page.screencastFrame', async (frame) => {
      try {
        if (!this.client || !this.isRecording || this.isPaused) return;

        this.frameCounter++;

        // Sample frames when under pressure
        // if (this.frameQueue.length > 10 && this.frameCounter % this.FRAME_SAMPLE_RATE !== 0) {
        //   await this.client.send('Page.screencastFrameAck', { sessionId: frame.sessionId });
        //   return;
        // }

        const frameBuffer = Buffer.from(frame.data, 'base64');

        if (this.frameQueue.length < this.MAX_QUEUE_SIZE) {
          this.frameQueue.push({
            data: frameBuffer,
            timestamp: Date.now()
          });
        } else {
          // Instead of just dropping, replace oldest frame
          this.frameQueue.shift(); // Remove oldest
          this.frameQueue.push({
            data: frameBuffer,
            timestamp: Date.now()
          });
        }

        await this.client.send('Page.screencastFrameAck', {
          sessionId: frame.sessionId
        }).catch(console.error);
      } catch (error) {
        console.error('Error processing frame:', error);
      }
    });

    // Start the queue processor
    this.startQueueProcessor();
  }

  async stop(): Promise<void> {
    this.stopQueueProcessor();

    if (this.client) {
      try {
        await this.client.send('Page.stopScreencast');

        // Process any remaining frames
        while (this.frameQueue.length > 0) {
          await this.processFrameQueue();
        }


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


  private async processFrameQueue() {
    if (!this.isRecording || this.isPaused || this.frameQueue.length === 0) {
        return;
    }

    try {
        const now = Date.now();
        // Process multiple frames if we're falling behind
        const framesToProcess = Math.min(
            this.frameQueue.length,
            Math.max(1, Math.floor((now - this.lastFrameTime) / this.targetFrameInterval))
        );

        for (let i = 0; i < framesToProcess; i++) {
            const frame = this.frameQueue.shift();
            if (!frame || !this.ffmpeg?.stdin.writable) break;

            this.ffmpeg.stdin.write(frame.data);
            this.encodedFrameCount++;
            this.frameCount++;
            this.lastFrameTime = now;
            
            // Collect metrics
            this.encodingTimes.push(now - frame.timestamp);
            this.queueSizeHistory.push(this.frameQueue.length);

            // Log performance metrics every 100 frames
            if (this.frameCount % 100 === 0) {
                this.logPerformanceMetrics();
            }
      
            
        }

        if (framesToProcess > 1) {
            console.log(`Processed ${framesToProcess} frames to catch up`);
        }
    } catch (error) {
        console.error('Error processing frame:', error);
    }
}

  private startQueueProcessor() {
    this.queueProcessor = setInterval(() => {
      this.processFrameQueue().catch(console.error);
    }, this.targetFrameInterval / 4);
  }

  private stopQueueProcessor() {
    if (this.queueProcessor) {
      clearInterval(this.queueProcessor);
      this.queueProcessor = undefined;
    }
  }

  private logPerformanceMetrics() {
    const now = Date.now();
    if (now - this.lastMetricsLog < this.METRICS_INTERVAL) return;

    const avgEncodingTime = this.encodingTimes.reduce((a, b) => a + b, 0) / this.encodingTimes.length;
    const maxEncodingTime = Math.max(...this.encodingTimes);
    const realFPS = 1000 / avgEncodingTime;

    console.log('Recording Performance Metrics:');
    console.log(`- Average encoding time: ${avgEncodingTime.toFixed(2)}ms`);
    console.log(`- Max encoding time: ${maxEncodingTime.toFixed(2)}ms`);
    console.log(`- Average queue size: ${this.queueSizeHistory.reduce((a, b) => a + b, 0) / this.queueSizeHistory.length}`);
    console.log(`- Current queue size: ${this.frameQueue.length}`);
    console.log(`- Total frames captured: ${this.frameCounter}`);
    console.log(`- Frames in queue: ${this.frameQueue.length}`);
    console.log(`- Frames encoded: ${this.encodedFrameCount}`);
    console.log(`- Frames dropped: ${this.frameCounter - this.encodedFrameCount}`);
    console.log(`- Actual FPS: ${realFPS.toFixed(2)}`);
    console.log(`- Target FPS: ${this.options.fps}`);
    console.log(`- Encoding speed: ${(realFPS / this.options.fps).toFixed(2)}x`);

    // Reset for next interval
    this.encodingTimes = [];
    this.lastMetricsLog = now;
  }

  private checkMemoryUsage() {
    const used = process.memoryUsage();
    const maxHeapSize = used.heapTotal * 0.9; // 90% threshold

    if (used.heapUsed > maxHeapSize) {
      console.warn('Memory pressure detected - dropping frames');
      // Clear half the queue
      this.frameQueue.splice(0, Math.floor(this.frameQueue.length / 2));
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

    this.mouseActions = MouseActions.getInstance(this.page);
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
