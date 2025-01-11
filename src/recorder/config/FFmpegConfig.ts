// src/recorder/config/FFmpegConfig.ts
import type { RecordingOptions } from '../types';

export interface FFmpegConfig {
  inputFormat: string;
  inputCodec: string;
  outputCodec: string;
  preset: string;
  crf: number;
  pixelFormat: string;
  extraOptions?: string[];
}

export const createFFmpegArgs = (
  fps: number,
  config: RecordingOptions,
  outputPath: string
): string[] => {
  return [
    '-y',
    '-f', 'image2pipe',
    '-r', `${fps}`,
    '-i', '-',
    '-c:v', config.videoCodec,
    // '-vsync', 'cfr',
    // '-g', `${fps}`,
    '-preset', config.videoPreset,
    '-crf', `${config.videoCrf}`,
    '-pix_fmt', 'yuv420p',
    outputPath
  ];
};


