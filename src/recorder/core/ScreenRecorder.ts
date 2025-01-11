// src/recorder/core/ScreenRecorder.ts

import * as puppeteer from 'puppeteer';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import {  
  DEFAULT_RECORDING_OPTIONS,
  DEFAULT_SCREENCAST_OPTIONS, 
} from '../config/RecorderConfig';
import { createFFmpegArgs } from '../config/FFmpegConfig';

import { FrameQueue } from '../queue/FrameQueue';
import { QueueProcessor } from '../queue/QueueProcessor';
import { MetricsCollector } from '../metrics/PerformanceMetrics';
import { MetricsLogger } from '../metrics/MetricsLogger';
import { Frame, RecorderStatus, RecordingOptions } from '../types';

export class ScreenRecorder {
  private ffmpeg: any;
  private client: puppeteer.CDPSession | null = null;
  private isRecording: boolean = false;
  private isPaused: boolean = false;
  private pausedTime: number = 0;
  
  private frameQueue: FrameQueue;
  private queueProcessor: QueueProcessor;
  private metricsCollector: MetricsCollector;

  constructor(
    private page: puppeteer.Page,
    private options: RecordingOptions = DEFAULT_RECORDING_OPTIONS
  ) {
    this.frameQueue = new FrameQueue();
    this.metricsCollector = new MetricsCollector();
    this.queueProcessor = new QueueProcessor(
      this.frameQueue,
      this.processFrame.bind(this),
      options.fps
    );
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

    // Initialize FFmpeg
    this.ffmpeg = spawn('ffmpeg', createFFmpegArgs(this.options.fps, this.options, outputPath));

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
  }

  async pause(): Promise<void> {
    if (!this.isRecording || this.isPaused) return;

    if (this.client) {
      await this.client.send('Page.stopScreencast');
      this.isPaused = true;
      this.pausedTime = Date.now();
      MetricsLogger.logInfo('Recording paused');
    }
  }

  async resume(): Promise<void> {
    if (!this.isRecording || !this.isPaused) return;

    if (this.client) {
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
}
