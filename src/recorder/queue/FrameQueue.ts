// src/recorder/queue/FrameQueue.ts

import { Frame } from '../types';

export class FrameQueue {
  private queue: Frame[] = [];
  private readonly maxQueueSize: number;

  constructor(maxQueueSize: number = 30) {
    this.maxQueueSize = maxQueueSize;
  }

  push(frame: Frame): boolean {
    if (this.queue.length >= this.maxQueueSize) {
      this.queue.shift(); // Remove oldest frame
    }
    this.queue.push(frame);
    return true;
  }

  shift(): Frame | undefined {
    return this.queue.shift();
  }

  clear(): void {
    this.queue = [];
  }

  get length(): number {
    return this.queue.length;
  }

  get isEmpty(): boolean {
    return this.queue.length === 0;
  }

  handleMemoryPressure(): void {
    if (this.queue.length > 0) {
      // Drop half the frames under memory pressure
      this.queue.splice(0, Math.floor(this.queue.length / 2));
    }
  }
}
