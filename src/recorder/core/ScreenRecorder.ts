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
import type { Frame, RecorderStatus, RecordingOptions, RecordingSegment } from '../types';
import { TransitionManager } from '../transitions/TransitionManager';
import type { BaseTransitionOptions } from '../transitions/types';
import { FrameTrigger } from '../../utils/frame-trigger';

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
    await FrameTrigger.getInstance().initialize(this.page, this.options.fps);

    // Calculate everyNthFrame based on target fps
  // const screencastOptions = {
  //   ...DEFAULT_SCREENCAST_OPTIONS,
  //   everyNthFrame: Math.max(1, Math.floor(60 / this.options.fps))
  // };

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
        await this.client?.send('Page.screencastFrameAck', { sessionId: frame.sessionId });

        if (!this.client || !this.isRecording || this.isPaused) {
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

    console.log('Starting final file processing...');
    try {

      // Add final segment
      if (this.currentSegmentPath) {
        this.segments.push({
          path: this.currentSegmentPath,
          hasTransition: false,
          startTime: this.pausedTime - this.metricsCollector.getTotalFrames() * (1000 / this.options.fps),
          frameCount: this.metricsCollector.getTotalFrames(),
          width: this.page.viewport()?.width || 1920,
          height: this.page.viewport()?.height || 1080
        });
        MetricsLogger.logInfo(`Added final segment: ${this.currentSegmentPath}`);
      }

      // Process segments
      if (this.segments.length > 0) {
        MetricsLogger.logInfo(`Combining ${this.segments.length} segments with transitions...`);
        const transitionManager = new TransitionManager();
        await this.createFinalFile(transitionManager);
      } else {
        MetricsLogger.logWarning('No segments to process');
      }

      // Cleanup temp files and .DS_Store
      // if (fs.existsSync(this.tempDir)) {
      //   const files = fs.readdirSync(this.tempDir);
      //   for (const file of files) {
      //     const filePath = path.join(this.tempDir, file);
      //     if (fs.existsSync(filePath)) {
      //       fs.unlinkSync(filePath);
      //       MetricsLogger.logInfo(`Deleted temp file: ${filePath}`);
      //     }
      //   }

      //   try {
      //     fs.rmdirSync(this.tempDir);
      //     MetricsLogger.logInfo('Removed temp directory');
      //   } catch (error) {
      //     MetricsLogger.logWarning(`Note: Could not remove temp directory: ${(error as Error).message}`);
      //   }
      // }
    } catch (error) {
      MetricsLogger.logError(error as Error, 'Segment processing');
      throw error;
    }
  }

  async pause(transition?: BaseTransitionOptions): Promise<void> {
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

  private async copySegmentToOutput(segmentPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ffmpegArgs = [
        '-i', segmentPath,
        '-c', 'copy',  // Use stream copy for faster processing
        '-y',  // Overwrite output file if it exists
        outputPath
      ];
  
      MetricsLogger.logInfo('FFmpeg copy command:');
      MetricsLogger.logInfo('ffmpeg ' + ffmpegArgs.join(' '));
  
      const ffmpeg = spawn('ffmpeg', ffmpegArgs);
  
      ffmpeg.stderr.on('data', (data) => {
        MetricsLogger.logInfo(`FFmpeg Copy: ${data.toString()}`);
      });
  
      ffmpeg.on('close', (code) => {
        if (code === 0) {
          MetricsLogger.logInfo('Copy completed successfully');
          resolve();
        } else {
          reject(new Error(`FFmpeg copy process exited with code ${code}`));
        }
      });
  
      ffmpeg.on('error', (error) => {
        MetricsLogger.logError(error, 'FFmpeg copy process error');
        reject(error);
      });
    });
  }
  

  private async concatenateSegments(segments: RecordingSegment[], outputPath: string): Promise<void> {
    // Ensure temp directory exists
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }

    // Create a temporary file listing all segments to concatenate
    const concatFilePath = path.join(this.tempDir, 'concat_list.txt');

    // Use absolute paths to avoid any path resolution issues
    const fileContent = segments.map(seg => `file '${path.resolve(seg.path)}'`).join('\n');
    fs.writeFileSync(concatFilePath, fileContent);

    MetricsLogger.logInfo(`Created concat file at ${concatFilePath}`);
    MetricsLogger.logInfo(`Concat file contents:\n${fileContent}`);

    return new Promise((resolve, reject) => {
      const ffmpegArgs = [
        '-f', 'concat',
        '-safe', '0',
        '-i', concatFilePath,
        '-c', 'copy',  // Use stream copy for faster processing
        '-y',  // Overwrite output file if it exists
        outputPath
      ];

      MetricsLogger.logInfo('FFmpeg concatenation command:');
      MetricsLogger.logInfo('ffmpeg ' + ffmpegArgs.join(' '));

      const ffmpeg = spawn('ffmpeg', ffmpegArgs);

      ffmpeg.stderr.on('data', (data) => {
        MetricsLogger.logInfo(`FFmpeg Concatenation: ${data.toString()}`);
      });

      ffmpeg.on('close', (code) => {
        // Clean up the temporary concat list file
        if (fs.existsSync(concatFilePath)) {
          fs.unlinkSync(concatFilePath);
          MetricsLogger.logInfo(`Cleaned up concat file: ${concatFilePath}`);
        }

        if (code === 0) {
          MetricsLogger.logInfo('Concatenation completed successfully');
          resolve();
        } else {
          reject(new Error(`FFmpeg concatenation process exited with code ${code}`));
        }
      });

      ffmpeg.on('error', (error) => {
        if (fs.existsSync(concatFilePath)) {
          fs.unlinkSync(concatFilePath);
          MetricsLogger.logInfo(`Cleaned up concat file after error: ${concatFilePath}`);
        }
        MetricsLogger.logError(error, 'FFmpeg concatenation process error');
        reject(error);
      });
    });
  }

  private async createFinalFile(transitionManager: TransitionManager): Promise<void> {
    MetricsLogger.logInfo(`Starting segment combination with ${this.segments.length} segments`);

    // Handle single segment case
    if (this.segments.length === 1) {
      MetricsLogger.logInfo('Only one segment found, copying to output');
      await this.copySegmentToOutput(this.segments[0].path, this.options.outputPath);
      return;
    }

    // Create a temporary directory for intermediate files
    const intermediateDir = path.join(this.tempDir, 'intermediate');
    if (!fs.existsSync(intermediateDir)) {
      fs.mkdirSync(intermediateDir, { recursive: true });
    }

    try {
      let currentOutput = path.join(intermediateDir, 'output_0.mp4');
      let segmentsToConcat: RecordingSegment[] = [this.segments[0]]; // Start with first segment

      for (let i = 0; i < this.segments.length - 1; i++) {
        const currentSegment = this.segments[i];
        const nextSegment = this.segments[i + 1];

        if (currentSegment.hasTransition && currentSegment.transition) {
          // If we have accumulated segments to concatenate, do it first
          if (segmentsToConcat.length > 1) {
            const tempOutput = path.join(intermediateDir, `concat_${i}.mp4`);
            await this.concatenateSegments(segmentsToConcat, tempOutput);
            segmentsToConcat = [{ ...currentSegment, path: tempOutput }];
          }

          // Apply transition
          MetricsLogger.logInfo(`Applying ${currentSegment.transition.type} transition`);
          currentOutput = path.join(intermediateDir, `output_${i + 1}.mp4`);
          await transitionManager.applyTransition(
            [segmentsToConcat[0], nextSegment],
            currentOutput,
            currentSegment.transition
          );

          // Start new segment collection with the output
          segmentsToConcat = [{
            ...nextSegment,
            path: currentOutput
          }];
        } else {
          segmentsToConcat.push(nextSegment);
        }
      }

      // Handle any remaining segments that need concatenation
      if (segmentsToConcat.length > 0) {
        await this.concatenateSegments(segmentsToConcat, this.options.outputPath);
      }

      MetricsLogger.logInfo('Finished combining segments');
    } finally {
      // Clean up intermediate files
      if (fs.existsSync(intermediateDir)) {
        const files = fs.readdirSync(intermediateDir);
        for (const file of files) {
          const filePath = path.join(intermediateDir, file);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            MetricsLogger.logInfo(`Cleaned up intermediate file: ${filePath}`);
          }
        }
        fs.rmdirSync(intermediateDir);
        MetricsLogger.logInfo('Cleaned up intermediate directory');
      }
    }
  }
}