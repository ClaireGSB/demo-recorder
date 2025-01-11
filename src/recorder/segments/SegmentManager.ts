// src/recorder/segments/SegmentManager.ts

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Segment, SegmentOptions } from './types';
import { MetricsLogger } from '../metrics/MetricsLogger';

export class SegmentManager {
  private segments: Segment[] = [];
  private segmentBuffers: Map<string, Buffer> = new Map();
  private tmpDir: string;
  private useMemoryBuffers: boolean;
  private maxBufferSize: number;
  private frameCounter: number = 0;

  constructor(
    private viewport: { width: number; height: number },
    options: SegmentOptions = {}
  ) {
    this.useMemoryBuffers = options.useMemoryBuffers ?? true;
    this.maxBufferSize = options.maxBufferSize ?? 100 * 1024 * 1024; // 100MB default
    this.tmpDir = options.tmpDir ?? path.join(os.tmpdir(), 'demo-recorder-' + Date.now());
  }

  async initialize(): Promise<void> {
    await fs.promises.mkdir(this.tmpDir, { recursive: true });
    MetricsLogger.logInfo(`Initialized segment manager with tmp dir: ${this.tmpDir}`);
  }

  incrementFrameCount(): void {
    this.frameCounter++;
  }

  async addSegment(videoBuffer: Buffer): Promise<Segment> {
    await this.checkMemoryPressure();

    const segmentNumber = this.segments.length + 1;
    const segmentPath = path.join(this.tmpDir, `segment-${segmentNumber}.mp4`);

    if (this.useMemoryBuffers && videoBuffer.length <= this.maxBufferSize) {
      this.segmentBuffers.set(segmentPath, videoBuffer);
      MetricsLogger.logInfo(`Stored segment ${segmentNumber} in memory`);
    } else {
      await fs.promises.writeFile(segmentPath, videoBuffer);
      MetricsLogger.logInfo(`Wrote segment ${segmentNumber} to disk`);
    }

    const segment: Segment = {
      path: segmentPath,
      startTime: Date.now(),
      frameCount: this.frameCounter,
      width: this.viewport.width,
      height: this.viewport.height
    };

    this.segments.push(segment);
    this.frameCounter = 0; // Reset for next segment
    return segment;
  }

  private async checkMemoryPressure(): Promise<void> {
    const used = process.memoryUsage();
    const heapUsageRatio = used.heapUsed / used.heapTotal;

    if (heapUsageRatio > 0.85) {
      MetricsLogger.logWarning('Memory pressure detected, flushing buffers to disk');
      this.useMemoryBuffers = false;
      await this.flushBuffersToFiles();
    }
  }

  private async flushBuffersToFiles(): Promise<void> {
    for (const [path, buffer] of this.segmentBuffers.entries()) {
      await fs.promises.writeFile(path, buffer);
      this.segmentBuffers.delete(path);
    }
  }

  async cleanup(): Promise<void> {
    try {
      this.segmentBuffers.clear();
      
      for (const segment of this.segments) {
        await fs.promises.unlink(segment.path).catch(() => {});
      }

      await fs.promises.rmdir(this.tmpDir).catch(() => {});
      
      MetricsLogger.logInfo('Cleaned up all segments and temporary files');
    } catch (error) {
      MetricsLogger.logError(error as Error, 'Segment cleanup');
    }
  }

  getSegments(): Segment[] {
    return [...this.segments];
  }

  getCurrentSegment(): Segment | undefined {
    return this.segments[this.segments.length - 1];
  }

  markSegmentEnd(segment: Segment): void {
    segment.endTime = Date.now();
    MetricsLogger.logInfo(`Segment completed: ${
      ((segment.endTime - segment.startTime) / 1000).toFixed(2)
    } seconds, ${segment.frameCount} frames`);
  }
}
