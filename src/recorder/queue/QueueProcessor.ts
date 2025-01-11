// src/recorder/queue/QueueProcessor.ts

import { Frame } from '../types';
import { FrameQueue } from './FrameQueue';

export class QueueProcessor {
  private processorInterval?: NodeJS.Timeout;
  private lastProcessTime: number = 0;
  private readonly targetFrameInterval: number;

  constructor(
    private frameQueue: FrameQueue,
    private processFrame: (frame: Frame) => Promise<void>,
    fps: number
  ) {
    this.targetFrameInterval = 1000 / fps;
  }

  start(): void {
    if (this.processorInterval) {
      return;
    }

    this.processorInterval = setInterval(
      () => this.processQueue(),
      this.targetFrameInterval / 4
    );
  }

  stop(): void {
    if (this.processorInterval) {
      clearInterval(this.processorInterval);
      this.processorInterval = undefined;
    }
  }

  private async processQueue(): Promise<void> {
    const now = Date.now();

    // Calculate how many frames we should process to catch up
    const framesToProcess = Math.min(
      this.frameQueue.length,
      Math.max(1, Math.floor((now - this.lastProcessTime) / this.targetFrameInterval))
    );

    for (let i = 0; i < framesToProcess; i++) {
      const frame = this.frameQueue.shift();
      if (!frame) break;

      try {
        await this.processFrame(frame);
        this.lastProcessTime = now;
      } catch (error) {
        console.error('Error processing frame:', error);
      }
    }

    if (framesToProcess > 1) {
      console.log(`Processed ${framesToProcess} frames to catch up`);
    }
  }

  async processRemaining(): Promise<void> {
    while (!this.frameQueue.isEmpty) {
      const frame = this.frameQueue.shift();
      if (frame) {
        await this.processFrame(frame);
      }
    }
  }
}
