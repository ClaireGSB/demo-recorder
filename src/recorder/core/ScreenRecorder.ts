// src/recorder/core/ScreenRecorder.ts

import * as puppeteer from 'puppeteer';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import {
  DEFAULT_RECORDING_SETTINGS,
  DEFAULT_SCREENCAST_OPTIONS,
} from '../config/RecorderConfig';
import { createFFmpegArgs } from '../config/FFmpegConfig';

import { FrameQueue } from '../queue/FrameQueue';
import { QueueProcessor } from '../queue/QueueProcessor';
import { MetricsCollector } from '../metrics/PerformanceMetrics';
import { MetricsLogger } from '../metrics/MetricsLogger';
import type { Frame, RecorderStatus, RecordingOptions, RecordingSegment, TransitionConfig } from '../types';
import { TransitionManager } from '../transitions/TransitionManager';

export class ScreenRecorder {
  private ffmpeg: any;
  private client: puppeteer.CDPSession | null = null;
  private isRecording: boolean = false;
  private isPaused: boolean = false;
  private pausedTime: number = 0;

  private frameQueue: FrameQueue;
  private queueProcessor: QueueProcessor;
  private metricsCollector: MetricsCollector;

  private segments: RecordingSegment[] = [];
  private currentSegmentPath: string | null = null;
  private tempDir: string;

  constructor(
    private page: puppeteer.Page,
    private options: RecordingOptions
  ) {
    this.frameQueue = new FrameQueue();
    this.metricsCollector = new MetricsCollector();
    this.queueProcessor = new QueueProcessor(
      this.frameQueue,
      this.processFrame.bind(this),
      options.fps
    );
    this.tempDir = path.join(path.dirname(this.options.outputPath), 'temp');
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
    MetricsLogger.logInfo(`Initialized temp directory: ${this.tempDir}`);
  }

  private async processFrame(frame: Frame): Promise<void> {
    if (!this.ffmpeg?.stdin.writable) return;

    const startTime = Date.now();
    this.ffmpeg.stdin.write(frame.data);

    this.metricsCollector.recordEncodingTime(startTime);
    this.metricsCollector.incrementEncodedFrames();
    this.metricsCollector.recordQueueSize(this.frameQueue.length);

    if (this.metricsCollector.shouldLogMetrics()) {
      MetricsLogger.logPerformance(this.metricsCollector.getMetrics());
      this.metricsCollector.reset();
    }
  }

  async start(outputPath: string): Promise<void> {
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    this.client = await this.page.createCDPSession();
    this.isRecording = true;
    this.isPaused = false;

    // Set initial segment path
    this.currentSegmentPath = path.join(this.tempDir, `segment-${Date.now()}.mp4`);
    MetricsLogger.logInfo(`Starting recording to segment: ${this.currentSegmentPath}`);



    // Initialize FFmpeg
    this.ffmpeg = spawn('ffmpeg', createFFmpegArgs(this.options.fps, this.options, this.currentSegmentPath));

    this.ffmpeg.stderr.on('data', (data: Buffer) => {
      MetricsLogger.logInfo(`FFmpeg: ${data.toString()}`);
    });

    // Start screen capture
    await this.client.send('Page.startScreencast', DEFAULT_SCREENCAST_OPTIONS);

    // Set up frame handling
    await this.client.on('Page.screencastFrame', async (frame) => {
      try {
        if (!this.client || !this.isRecording || this.isPaused) {
          await this.client?.send('Page.screencastFrameAck', { sessionId: frame.sessionId });
          return;
        }

        this.metricsCollector.incrementFrameCounter();

        const frameBuffer = Buffer.from(frame.data, 'base64');
        this.frameQueue.push({
          data: frameBuffer,
          timestamp: Date.now()
        });

        await this.client.send('Page.screencastFrameAck', { sessionId: frame.sessionId })
          .catch(error => MetricsLogger.logError(error, 'Frame acknowledgment'));
      } catch (error) {
        MetricsLogger.logError(error as Error, 'Frame processing');
      }
    });

    this.queueProcessor.start();
  }

  async stop(): Promise<void> {
    this.queueProcessor.stop();

    // Log final metrics before stopping
    const finalMetrics = this.metricsCollector.getMetrics();
    MetricsLogger.logInfo('=== Final Recording Metrics ===');
    MetricsLogger.logPerformance(finalMetrics);
    MetricsLogger.logInfo('=============================');

    if (this.client) {
      try {
        await this.client.send('Page.stopScreencast');
        await this.queueProcessor.processRemaining();

        this.ffmpeg.stdin.end();

        await new Promise<void>((resolve, reject) => {
          this.ffmpeg.on('close', (code: number) => {
            if (code === 0) {
              MetricsLogger.logInfo(`Recording completed successfully`);
              resolve();
            } else {
              reject(new Error(`FFmpeg exited with code ${code}`));
            }
          });
        });

        await this.client.detach();
        this.client = null;
        this.isRecording = false;
      } catch (error) {
        MetricsLogger.logError(error as Error, 'Stopping recording');
        throw error;
      }
    }

    console.log('Trying to combine segments...');
    try {
      if (this.segments.length > 0) {
        MetricsLogger.logInfo(`Combining ${this.segments.length} segments with transitions...`);

        // Add final segment
        if (this.currentSegmentPath) {
          this.segments.push({
            path: this.currentSegmentPath,
            hasTransition: false,
            startTime: this.pausedTime - this.metricsCollector.getTotalFrames() * (1000 / this.options.fps),
            frameCount: this.metricsCollector.getTotalFrames(),
            width: this.page.viewport()?.width || 1920,  // default if viewport not set
            height: this.page.viewport()?.height || 1080
          });
          MetricsLogger.logInfo(`Added final segment: ${this.currentSegmentPath}`);
        }

        const transitionManager = new TransitionManager();
        await this.combineSegments(transitionManager);

        // Cleanup temp files
        // this.segments.forEach(segment => {
        //   fs.unlinkSync(segment.path);
        //   MetricsLogger.logInfo(`Deleted temp segment: ${segment.path}`);
        // });

        // if (fs.existsSync(this.tempDir)) {
        //   fs.rmdirSync(this.tempDir);
        //   MetricsLogger.logInfo(`Removed temp directory: ${this.tempDir}`);
        // }
      }
    } catch (error) {
      MetricsLogger.logError(error as Error, 'Segment processing');
      throw error;
    }
  }



  async pause(transition?: TransitionConfig): Promise<void> {
    if (!this.isRecording || this.isPaused) return;

    if (this.client) {
      await this.client.send('Page.stopScreencast');
      this.isPaused = true;
      this.pausedTime = Date.now();

      // Finish current segment
      if (this.ffmpeg) {
        MetricsLogger.logInfo('Finishing current segment...');
        this.ffmpeg.stdin.end();
        await new Promise<void>((resolve) => {
          this.ffmpeg.on('close', () => {
            MetricsLogger.logInfo(`Segment saved to: ${this.currentSegmentPath}`);
            resolve();
          });
        });
      }

      const metrics = this.metricsCollector.getMetrics();

      // Save segment info with transition
      if (this.currentSegmentPath) {
        const segment = {
          path: this.currentSegmentPath,
          hasTransition: !!transition,  // Make sure this is set based on transition parameter
          transition,  // Include the full transition config
          startTime: this.pausedTime - metrics.totalFrames * (1000 / this.options.fps),
          frameCount: metrics.totalFrames,
          width: this.page.viewport()?.width || 1920,
          height: this.page.viewport()?.height || 1080
        };
        this.segments.push(segment);
        MetricsLogger.logInfo(`Saved segment info: ${JSON.stringify(segment, null, 2)}`);
      }

      // Prepare for next segment
      this.currentSegmentPath = path.join(this.tempDir, `segment-${Date.now()}.mp4`);
      MetricsLogger.logInfo(`Prepared next segment path: ${this.currentSegmentPath}`);
    }
  }

  async resume(): Promise<void> {
    if (!this.isRecording || !this.isPaused) return;

    if (this.client && this.currentSegmentPath) {
      try {
        // Initialize new FFmpeg process for new segment
        this.ffmpeg = spawn('ffmpeg', createFFmpegArgs(this.options.fps, this.options, this.currentSegmentPath));
        MetricsLogger.logInfo(`Started new recording segment: ${this.currentSegmentPath}`);

        this.ffmpeg.stderr.on('data', (data: Buffer) => {
          MetricsLogger.logInfo(`FFmpeg: ${data.toString()}`);
        });

        this.ffmpeg.on('error', (err: Error) => {
          MetricsLogger.logError(err, 'FFmpeg process error');
        });

      } catch (error) {
        MetricsLogger.logError(error as Error, 'Failed to start FFmpeg process');
        throw error;
      }

      await this.client.send('Page.startScreencast', DEFAULT_SCREENCAST_OPTIONS);
      this.isPaused = false;
      MetricsLogger.logInfo(`Recording resumed after ${Date.now() - this.pausedTime}ms pause`);
    }
  }

  getStatus(): RecorderStatus {
    return {
      isRecording: this.isRecording,
      isPaused: this.isPaused
    };
  }

  private async combineSegments(transitionManager: TransitionManager): Promise<void> {
    MetricsLogger.logInfo(`Starting segment combination with ${this.segments.length} segments`);

    for (let i = 0; i < this.segments.length - 1; i++) {
      const currentSegment = this.segments[i];
      const nextSegment = this.segments[i + 1];

      MetricsLogger.logInfo(`Processing segments ${i} and ${i + 1}:`);
      MetricsLogger.logInfo(`Current segment: ${JSON.stringify(currentSegment, null, 2)}`);
      MetricsLogger.logInfo(`Next segment: ${JSON.stringify(nextSegment, null, 2)}`);

      if (currentSegment.hasTransition && currentSegment.transition) {
        MetricsLogger.logInfo(`Applying ${currentSegment.transition.type} transition`);
        await transitionManager.applyTransition(
          [currentSegment, nextSegment],
          this.options.outputPath,
          currentSegment.transition
        );
      } else {
        MetricsLogger.logInfo('No transition specified between segments');
      }
    }

    MetricsLogger.logInfo('Finished combining segments');
  }
}
