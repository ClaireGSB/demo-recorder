// src/recorder/metrics/MetricsLogger.ts

import { PerformanceMetrics } from '../types';

export class MetricsLogger {
  static logPerformance(metrics: PerformanceMetrics): void {
    console.log('Recording Performance Metrics:');
    console.log(`- Average encoding time: ${metrics.avgEncodingTime.toFixed(2)}ms`);
    console.log(`- Max encoding time: ${metrics.maxEncodingTime.toFixed(2)}ms`);
    console.log(`- Current queue size: ${metrics.queueSize}`);
    console.log(`- Total frames captured: ${metrics.totalFrames}`);
    console.log(`- Frames encoded: ${metrics.encodedFrames}`);
    console.log(`- Frames dropped: ${metrics.droppedFrames}`);
    console.log(`- Actual FPS: ${metrics.realFPS.toFixed(2)}`);
  }

  static logError(error: Error, context: string): void {
    console.error(`Error in ${context}:`, error);
  }

  static logWarning(message: string): void {
    console.warn(message);
  }

  static logInfo(message: string): void {
    console.log(message);
  }
}
