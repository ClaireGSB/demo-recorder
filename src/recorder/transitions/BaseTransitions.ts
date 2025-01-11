// src/recorder/transitions/base/BaseTransition.ts
import { spawn } from 'child_process';
import { Segment } from '../segments/types';
import { BaseTransitionOptions } from './types';
import { MetricsLogger } from '../metrics/MetricsLogger';
import * as fs from 'fs';

export abstract class BaseTransition<T extends BaseTransitionOptions> {
  protected abstract createFilterGraph(
    fadeStartTime: number, 
    durationInSeconds: number,
    options?: NonNullable<T['options']>
  ): string;

  protected async getVideoDuration(videoPath: string): Promise<number> {
    const ffprobeArgs = [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      videoPath
    ];

    return new Promise<number>((resolve, reject) => {
      const ffprobe = spawn('ffprobe', ffprobeArgs);
      let output = '';

      ffprobe.stdout.on('data', (data) => {
        output += data.toString();
      });

      ffprobe.on('close', (code) => {
        if (code === 0) {
          resolve(parseFloat(output.trim()));
        } else {
          reject(new Error('Failed to get video duration'));
        }
      });
    });
  }

  async apply(
    segments: Segment[],
    outputPath: string,
    options: T
  ): Promise<void> {
    if (segments.length < 2) {
      throw new Error('At least two segments are required for transition');
    }

    // Verify segments exist
    for (const segment of segments) {
      if (!fs.existsSync(segment.path)) {
        throw new Error(`Segment file not found: ${segment.path}`);
      }
    }

    const firstVideo = segments[0];
    const secondVideo = segments[1];
    const durationInSeconds = options.duration / 1000;

    const duration = await this.getVideoDuration(firstVideo.path);
    const fadeStartTime = Math.max(0, duration - durationInSeconds);

    const filterGraph = this.createFilterGraph(
      fadeStartTime,
      durationInSeconds,
      options.options
    );

    return new Promise((resolve, reject) => {
      const ffmpegArgs = [
        '-i', firstVideo.path,
        '-i', secondVideo.path,
        '-filter_complex', filterGraph,
        '-map', '[outv]',
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-preset', 'medium',
        '-crf', '23',
        '-y',
        outputPath
      ];

      MetricsLogger.logInfo('FFmpeg command:');
      MetricsLogger.logInfo('ffmpeg ' + ffmpegArgs.join(' '));

      const ffmpeg = spawn('ffmpeg', ffmpegArgs);

      ffmpeg.stderr.on('data', (data) => {
        MetricsLogger.logInfo(`FFmpeg Transition: ${data.toString()}`);
      });

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          MetricsLogger.logInfo('Transition completed successfully');
          resolve();
        } else {
          reject(new Error(`FFmpeg transition process exited with code ${code}`));
        }
      });

      ffmpeg.on('error', (error) => {
        MetricsLogger.logError(error, 'FFmpeg process error');
        reject(error);
      });
    });
  }
}

