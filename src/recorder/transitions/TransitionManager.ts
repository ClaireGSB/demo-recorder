// src/recorder/transitions/TransitionManager.ts
import { spawn } from 'child_process';
import { MetricsLogger } from '../metrics/MetricsLogger';
import { Segment } from '../segments/types';
import { TransitionOptions } from './types';
import * as fs from 'fs';

export class TransitionManager {
  async applyTransition(
    segments: Segment[],
    outputPath: string,
    transitionOptions: TransitionOptions
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
    const durationInSeconds = transitionOptions.duration / 1000;

    // Get duration of first video
    const ffprobeArgs = [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      firstVideo.path
    ];

    const duration = await new Promise<number>((resolve, reject) => {
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

    // Calculate fade start time
    const fadeStartTime = Math.max(0, duration - durationInSeconds);

    // Create filter graph
    const filterGraph = 
      `[0:v]fade=t=out:st=${fadeStartTime}:d=${durationInSeconds}[v0];` +
      `[1:v]fade=t=in:st=0:d=${durationInSeconds}[v1];` +
      `[v0][v1]concat=n=2:v=1[outv]`;

    return new Promise((resolve, reject) => {
      const ffmpegArgs = [
        '-i', firstVideo.path,
        '-i', secondVideo.path,
        '-filter_complex', filterGraph,
        '-map', '[outv]',
        '-c:v', 'libx264',
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
