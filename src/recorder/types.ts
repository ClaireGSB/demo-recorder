// src/recorder/types.ts

export interface ViewportDimensions {
  width: number;
  height: number;
}

export interface RecordingOptions {
  fps: number;
  quality: number;
  videoCrf: number;
  videoCodec: string;
  videoPreset: string;
  outputPath: string;
}

export interface RecordingSettings {
  fps: number;
  quality: number;
  videoCrf: number;
  videoCodec: string;
  videoPreset: string;
}

export interface TypeConfig {
  slowType?: boolean;
  typeDelay?: number;  // milliseconds between keystrokes
}

export interface Step {
  type: StepType;
  selector?: string;
  value?: string;
  option?: string;
  duration?: number;
  path?: string;
  typeConfig?: TypeConfig;
  transition?: TransitionConfig; 
}

export type StepType =
  | 'navigate'
  | 'input'
  | 'select'
  | 'click'
  | 'wait'
  | 'scrollDown'
  | 'startRecording'
  | 'stopRecording'
  | 'pauseRecording'
  | 'resumeRecording';

  export interface TransitionConfig {
    type: 'fade' | 'dissolve';
    duration: number;  // milliseconds
  }

export interface ScrollStep extends Step {
  type: 'scrollDown';
  pixels: number;
  duration?: number;  // milliseconds
  moveMouse?: boolean;
}
export interface ProjectConfig {
  name: string;
  baseUrl: string;
  viewport: ViewportDimensions;
}

export interface AuthConfig {
  email?: string;
  password?: string;
}

export interface RecordingConfig {
  output: string;
  fps: number;
  quality: number;
  defaultTypeConfig?: TypeConfig;
}

export interface DemoConfig {
  project: ProjectConfig;
  auth?: AuthConfig;
  recording: RecordingConfig;
  steps: Step[];
}

export interface Frame {
  data: Buffer;
  timestamp: number;
}

export interface RecorderStatus {
  isRecording: boolean;
  isPaused: boolean;
}

export interface PerformanceMetrics {
  avgEncodingTime: number;
  maxEncodingTime: number;
  realFPS: number;
  queueSize: number;
  totalFrames: number;
  encodedFrames: number;
  droppedFrames: number;
}

export interface ScreencastOptions {
  format: 'jpeg';
  quality: number;
  maxWidth: number;
  maxHeight: number;
  everyNthFrame: number;
}

export interface FFmpegConfig {
  inputFormat: string;
  inputCodec: string;
  outputCodec: string;
  preset: string;
  crf: number;
  pixelFormat: string;
  extraOptions?: string[];
}

export interface RecordingSegment {
  path: string;
  hasTransition: boolean;
  transition?: TransitionConfig;
  startTime: number;    // add these required properties
  frameCount: number;   // from Segment interface
  width: number;
  height: number;
}
