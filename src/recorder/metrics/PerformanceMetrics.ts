// src/recorder/metrics/PerformanceMetrics.ts

import { PerformanceMetrics } from '../types';

export class MetricsCollector {
  private encodingTimes: number[] = [];
  private queueSizeHistory: number[] = [];
  private frameCounter: number = 0;
  private encodedFrameCount: number = 0;
  private lastMetricsLog: number = Date.now();
  private readonly METRICS_INTERVAL = 5000; // 5 seconds

  recordEncodingTime(startTime: number): void {
    const encodingTime = Date.now() - startTime;
    this.encodingTimes.push(encodingTime);
  }

  recordQueueSize(size: number): void {
    this.queueSizeHistory.push(size);
  }

  incrementFrameCounter(): void {
    this.frameCounter++;
  }

  incrementEncodedFrames(): void {
    this.encodedFrameCount++;
  }

  getMetrics(): PerformanceMetrics {
    const avgEncodingTime = this.encodingTimes.reduce((a, b) => a + b, 0) / this.encodingTimes.length;
    const maxEncodingTime = Math.max(...this.encodingTimes);
    const realFPS = 1000 / avgEncodingTime;

    return {
      avgEncodingTime,
      maxEncodingTime,
      realFPS,
      queueSize: this.queueSizeHistory[this.queueSizeHistory.length - 1] || 0,
      totalFrames: this.frameCounter,
      encodedFrames: this.encodedFrameCount,
      droppedFrames: this.frameCounter - this.encodedFrameCount
    };
  }

  getTotalFrames(): number {
    return this.frameCounter;
  }
  
  shouldLogMetrics(): boolean {
    const now = Date.now();
    if (now - this.lastMetricsLog >= this.METRICS_INTERVAL) {
      this.lastMetricsLog = now;
      return true;
    }
    return false;
  }

  reset(): void {
    this.encodingTimes = [];
    this.queueSizeHistory = [];
  }
}
