// src/recorder/segments/types.ts

export interface Segment {
  path: string;
  startTime: number;
  endTime?: number;
  frameCount: number;
  width: number;
  height: number;
}

export interface SegmentOptions {
  useMemoryBuffers?: boolean;
  maxBufferSize?: number;  // in bytes
  tmpDir?: string;
}