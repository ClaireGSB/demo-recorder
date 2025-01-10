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

export interface Step {
  type: 'navigate' | 'input' | 'select' | 'click' | 'wait';
  selector?: string;
  value?: string;
  option?: string;
  duration?: number;
  path?: string;
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
}

export interface DemoConfig {
  project: ProjectConfig;
  auth?: AuthConfig;
  recording: RecordingConfig;
  steps: Step[];
}
