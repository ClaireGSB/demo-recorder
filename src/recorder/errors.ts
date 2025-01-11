export class VideoAnalysisError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'VideoAnalysisError';
  }
}

export class SegmentStorageError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'SegmentStorageError';
  }
}

export class FFprobeError extends Error {
  constructor(message: string, public readonly stderr: string) {
    super(message);
    this.name = 'FFprobeError';
  }
}
