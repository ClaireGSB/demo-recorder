// src/recorder/types.ts
import type { BaseTransitionOptions } from './transitions/types';

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
  frame?: FrameConfig;
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
  transition?: BaseTransitionOptions; 
}

export type StepType =
  | 'navigate'
  | 'input'
  | 'select'
  | 'click'
  | 'hover'
  | 'wait'
  | 'waitForSelector'
  | 'scrollDown'
  | 'startRecording'
  | 'stopRecording'
  | 'pauseRecording'
  | 'resumeRecording';

export interface ScrollStep extends Step {
  type: 'scrollDown';
  pixels: number;
  duration?: number;  // milliseconds
  moveMouse?: boolean;
}

export interface WaitForSelectorStep extends Step {
  type: 'waitForSelector';
  selector: string;
  timeout?: number;  // Optional timeout in milliseconds
  visible?: boolean; // Whether to wait for the element to be visible (not just present)
}

export interface HoverStep extends Step {
  type: 'hover';
  selector: string;
  duration?: number;
}

export interface ProjectConfig {
  name: string;
  baseUrl: string;
  viewport: ViewportDimensions;
  cursor?: {
    mouseDownColor?: string; // Hex color code for mouse clicks
  };
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
  hasTransitions: boolean;
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
  transition?: BaseTransitionOptions;
  startTime: number;    // add these required properties
  frameCount: number;   // from Segment interface
  width: number;
  height: number;
}


export interface FrameConfig {
  enabled: boolean;
  width: number;           // Width of the frame in pixels
  color: string;           // Primary color (hex format)
  gradientEnabled?: boolean; // Whether to use gradient
  gradientColor?: string;  // Secondary color for gradient (hex format)
  gradientDirection?: 'horizontal' | 'vertical' | 'diagonal'; // Direction of gradient
  cornerRadius?: number;   // Rounded corners radius
  shadow?: boolean;        // Whether to add shadow
  shadowColor?: string;    // Shadow color
  shadowBlur?: number;     // Shadow blur amount
  title?: string;          // Optional title to display in the frame
  titleFont?: string;      // Font for the title
  titleColor?: string;     // Color for the title
  titlePosition?: 'top' | 'bottom'; // Position of the title
}

// Add this to your RecordingConfig interface
export interface RecordingConfig {
  output: string;
  fps: number;
  quality: number;
  defaultTypeConfig?: TypeConfig;
  frame?: FrameConfig;     // Add the frame configuration
}