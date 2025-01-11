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
