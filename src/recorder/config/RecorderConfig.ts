// src/recorder/config/RecorderConfig.ts
import type { RecordingOptions, ScreencastOptions } from '../types';


export const DEFAULT_RECORDING_OPTIONS: RecordingOptions = {
  fps: 60,
  quality: 95,
  videoCrf: 17,
  videoCodec: 'libx264',
  videoPreset: 'veryfast'
};

export const DEFAULT_SCREENCAST_OPTIONS: ScreencastOptions = {
  format: 'jpeg',
  quality: 95,
  maxWidth: 1920,
  maxHeight: 1080,
  everyNthFrame: 1
};

