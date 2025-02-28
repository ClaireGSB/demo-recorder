// src/recorder/transitions/FrameProcessor.ts
// Alternative with more reliable but simpler gradient approach

import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { FrameConfig } from '../types';
import { MetricsLogger } from '../metrics/MetricsLogger';

export class FrameProcessor {
  static async applyFrame(
    inputPath: string,
    outputPath: string,
    frameConfig: FrameConfig,
    viewportWidth: number,
    viewportHeight: number
  ): Promise<string> {
    if (!frameConfig.enabled) {
      if (inputPath !== outputPath) {
        fs.copyFileSync(inputPath, outputPath);
      }
      return outputPath;
    }

    // Create temp directory if needed
    const tempDir = path.join(path.dirname(outputPath), 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Get video dimensions
    const videoDimensions = await this.getVideoDimensions(inputPath);
    if (!videoDimensions) {
      fs.copyFileSync(inputPath, outputPath);
      return outputPath;
    }
    
    // Calculate frame dimensions
    const frameWidth = frameConfig.width || 20;
    const outputWidth = videoDimensions.width + (frameWidth * 2);
    const outputHeight = videoDimensions.height + (frameWidth * 2);
    
    // Create gradient or solid color background
    const backgroundPath = path.join(tempDir, `background_${Date.now()}.png`);
    await this.createBackground(
      backgroundPath, 
      outputWidth, 
      outputHeight, 
      frameConfig.color || '#000000',
      frameConfig.gradientEnabled && frameConfig.gradientColor ? frameConfig.gradientColor : null,
      frameConfig.gradientDirection || 'vertical'
    );
    
    // Create filter for adding the video on top of the background
    let complexFilter = '';
    
    // Input 0 is the original video, input 1 will be the background image
    complexFilter += `[1:v][0:v]overlay=x=${frameWidth}:y=${frameWidth}`;
    
    // Add title if configured
    if (frameConfig.title) {
      const titlePos = frameConfig.titlePosition || 'top';
      const titleY = titlePos === 'top' ? frameWidth / 2 : outputHeight - (frameWidth / 2) - 10;
      const titleColor = frameConfig.titleColor || 'white';
      const fontSize = Math.max(frameWidth * 0.7, 16);
      
      complexFilter += `,drawtext=text='${frameConfig.title}':fontcolor=${titleColor}:fontsize=${fontSize}:x=(w-text_w)/2:y=${titleY}`;
    }
    
    return new Promise<string>((resolve, reject) => {
      // Use two inputs: the video and the background image
      const ffmpegArgs = [
        '-i', inputPath,            // Input 0: Original video
        '-i', backgroundPath,       // Input 1: Background with gradient/color
        '-filter_complex', complexFilter,
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '18',
        '-y',
        outputPath
      ];
      
      MetricsLogger.logInfo(`Applying frame with command: ffmpeg ${ffmpegArgs.join(' ')}`);
      
      const ffmpeg = spawn('ffmpeg', ffmpegArgs);
      
      ffmpeg.stderr.on('data', (data: Buffer) => {
        MetricsLogger.logInfo(`FFmpeg Frame Process: ${data.toString()}`);
      });
      
      ffmpeg.on('close', (code: number) => {
        // Clean up temporary background image
        if (fs.existsSync(backgroundPath)) {
          fs.unlinkSync(backgroundPath);
        }
        
        if (code === 0) {
          MetricsLogger.logInfo(`Successfully applied frame to video: ${outputPath}`);
          resolve(outputPath);
        } else {
          reject(new Error(`FFmpeg exited with code ${code} when applying frame`));
        }
      });
      
      ffmpeg.on('error', (err: Error) => {
        MetricsLogger.logError(err, 'FFmpeg frame process error');
        reject(err);
      });
    });
  }
  
  /**
   * Creates a background image with the desired color or gradient
   */
  private static async createBackground(
    outputPath: string, 
    width: number, 
    height: number, 
    primaryColor: string,
    gradientColor: string | null,
    gradientDirection: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let args = [];
      
      if (gradientColor) {
        // Create gradient using ImageMagick's convert tool
        let gradientSpec = '';
        
        if (gradientDirection === 'horizontal') {
          gradientSpec = `gradient:${primaryColor}-${gradientColor}`;
        } else if (gradientDirection === 'diagonal') {
          gradientSpec = `gradient:${primaryColor}-${gradientColor}`;
          // Additional rotation might be needed for diagonal
        } else { // vertical
          gradientSpec = `gradient:${primaryColor}-${gradientColor}`;
        }
        
        args = [
          '-size', `${width}x${height}`,
          gradientSpec,
          outputPath
        ];
      } else {
        // Create solid color
        args = [
          '-size', `${width}x${height}`,
          `canvas:${primaryColor}`,
          outputPath
        ];
      }
      
      MetricsLogger.logInfo(`Creating background with: convert ${args.join(' ')}`);
      
      const convert = spawn('convert', args);
      
      convert.on('close', (code: number) => {
        if (code === 0) {
          resolve();
        } else {
          // If ImageMagick fails, try a fallback with FFmpeg
          this.createBackgroundWithFFmpeg(outputPath, width, height, primaryColor)
            .then(resolve)
            .catch(reject);
        }
      });
      
      convert.on('error', (err: Error) => {
        MetricsLogger.logWarning(`ImageMagick not available: ${err.message}. Trying FFmpeg instead.`);
        this.createBackgroundWithFFmpeg(outputPath, width, height, primaryColor)
          .then(resolve)
          .catch(reject);
      });
    });
  }
  
  /**
   * Fallback method to create a background using FFmpeg
   */
  private static async createBackgroundWithFFmpeg(
    outputPath: string, 
    width: number, 
    height: number, 
    color: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-f', 'lavfi',
        '-i', `color=c=${color}:s=${width}x${height}`,
        '-frames:v', '1',
        '-y',
        outputPath
      ]);
      
      ffmpeg.on('close', (code: number) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Failed to create background with FFmpeg: exit code ${code}`));
        }
      });
      
      ffmpeg.on('error', (err: Error) => {
        reject(new Error(`Failed to create background with FFmpeg: ${err.message}`));
      });
    });
  }
  
  /**
   * Gets the actual dimensions of a video file using FFmpeg
   */
  private static async getVideoDimensions(videoPath: string): Promise<{width: number, height: number} | null> {
    // Same implementation as before
    return new Promise((resolve) => {
      const ffprobe = spawn('ffprobe', [
        '-v', 'error',
        '-select_streams', 'v:0',
        '-show_entries', 'stream=width,height',
        '-of', 'csv=p=0',
        videoPath
      ]);
      
      let output = '';
      
      ffprobe.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      ffprobe.on('close', (code) => {
        if (code === 0 && output) {
          const [width, height] = output.trim().split(',').map(Number);
          if (!isNaN(width) && !isNaN(height)) {
            resolve({ width, height });
            return;
          }
        }
        
        MetricsLogger.logWarning(`Could not determine video dimensions with ffprobe (code ${code}), falling back to default`);
        resolve(null);
      });
      
      ffprobe.on('error', () => {
        MetricsLogger.logWarning('Error running ffprobe, falling back to default dimensions');
        resolve(null);
      });
    });
  }
}
