// src/recorder/transitions/FrameProcessor.ts
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
    
    const frameWidth = frameConfig.width || 20;
    const shadowEnabled = frameConfig.shadow === true;
    const shadowBlur = shadowEnabled ? (frameConfig.shadowBlur || 10) : 0;
    
    // Calculate dimensions for the colored frame
    const totalWidth = videoDimensions.width + (frameWidth * 2);
    const totalHeight = videoDimensions.height + (frameWidth * 2);
    
    // Create the colored frame background
    const frameBackgroundPath = path.join(tempDir, `frame_bg_${Date.now()}.png`);
    
    // Create gradient or solid color background for the frame
    await this.createBackground(
      frameBackgroundPath,
      totalWidth,
      totalHeight,
      frameConfig.color || '#000000',
      frameConfig.gradientEnabled && frameConfig.gradientColor ? frameConfig.gradientColor : null,
      frameConfig.gradientDirection || 'vertical'
    );
    
    // Now, let's create the shadow for the video (if enabled)
    let shadowPath = null;
    if (shadowEnabled) {
      shadowPath = path.join(tempDir, `shadow_${Date.now()}.png`);
      
      // Create a rectangle with video dimensions and apply shadow to it
      await this.createVideoShadow(
        shadowPath,
        videoDimensions.width,
        videoDimensions.height,
        shadowBlur,
        frameConfig.shadowColor || '#000000'
      );
    }
    
    // Overlay steps:
    // 1. The colored frame is the base
    // 2. If shadow is enabled, overlay the shadow on top of the frame (centered)
    // 3. Overlay the video centered on top of everything
    
    let complexFilter = '';
    if (shadowEnabled && shadowPath) {
      // Input 0: Original video
      // Input 1: Colored frame background
      // Input 2: Video shadow
      
      // First overlay shadow on colored frame background
      complexFilter += `[1:v][2:v]overlay=x=(W-w)/2:y=(H-h)/2[bg_with_shadow];`;
      
      // Then overlay video on top
      complexFilter += `[bg_with_shadow][0:v]overlay=x=${frameWidth}:y=${frameWidth}`;
    } else {
      // Without shadow, just overlay video on the colored frame
      complexFilter += `[1:v][0:v]overlay=x=${frameWidth}:y=${frameWidth}`;
    }
    
    // Add title if configured
    if (frameConfig.title) {
      const titlePos = frameConfig.titlePosition || 'top';
      const titleY = titlePos === 'top' ? frameWidth / 2 : totalHeight - (frameWidth / 2) - 10;
      const titleColor = frameConfig.titleColor || 'white';
      const fontSize = Math.max(frameWidth * 0.7, 16);
      
      complexFilter += `,drawtext=text='${frameConfig.title}':fontcolor=${titleColor}:fontsize=${fontSize}:x=(w-text_w)/2:y=${titleY}`;
    }
    
    // Apply all to the video
    return new Promise<string>((resolve, reject) => {
      let ffmpegArgs = [
        '-i', inputPath,              // Input 0: Original video
        '-i', frameBackgroundPath     // Input 1: Colored frame background
      ];
      
      // Add shadow input if enabled
      if (shadowEnabled && shadowPath) {
        ffmpegArgs.push('-i', shadowPath);  // Input 2: Shadow
      }
      
      // Add remaining arguments
      ffmpegArgs = ffmpegArgs.concat([
        '-filter_complex', complexFilter,
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '18',
        '-y',
        outputPath
      ]);
      
      MetricsLogger.logInfo(`Applying frame with command: ffmpeg ${ffmpegArgs.join(' ')}`);
      
      const ffmpeg = spawn('ffmpeg', ffmpegArgs);
      
      ffmpeg.stderr.on('data', (data: Buffer) => {
        MetricsLogger.logInfo(`FFmpeg Frame Process: ${data.toString()}`);
      });
      
      ffmpeg.on('close', (code: number) => {
        // Clean up temporary files
        [frameBackgroundPath, shadowPath].forEach(file => {
          if (file && fs.existsSync(file)) {
            fs.unlinkSync(file);
          }
        });
        
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
   * Creates a video shadow image - a rectangle with the video dimensions with a shadow applied
   */
  private static async createVideoShadow(
    outputPath: string,
    width: number,
    height: number,
    blur: number,
    shadowColor: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      // The size needs to be larger to accommodate the shadow
      const paddingForShadow = blur * 2;
      const totalWidth = width + paddingForShadow;
      const totalHeight = height + paddingForShadow;
      
      // Center offset for the rectangle so shadow is even all around
      const offsetX = Math.floor(paddingForShadow / 2);
      const offsetY = offsetX;
      
      // Try to create shadow with ImageMagick
      const args = [
        // Create a transparent canvas of the appropriate size
        '-size', `${totalWidth}x${totalHeight}`,
        'xc:none',
        
        // Draw a filled rectangle representing the video
        '-fill', 'black',
        '-draw', `rectangle ${offsetX},${offsetY} ${offsetX + width},${offsetY + height}`,
        
        // Apply shadow effect to it
        '-shadow', `80x${blur}+0+0`,
        
        // Keep only the shadow part, remove the rectangle
        '-alpha', 'extract',
        '-background', shadowColor,
        '-alpha', 'shape',
        
        // Output
        outputPath
      ];
      
      MetricsLogger.logInfo(`Creating video shadow with: convert ${args.join(' ')}`);
      
      const convert = spawn('convert', args);
      
      convert.on('close', (code: number) => {
        if (code === 0) {
          resolve();
        } else {
          // If ImageMagick fails, create a simple shadow with FFmpeg
          this.createVideoShadowWithFFmpeg(outputPath, width, height, blur, shadowColor)
            .then(resolve)
            .catch(reject);
        }
      });
      
      convert.on('error', (err: Error) => {
        MetricsLogger.logWarning(`ImageMagick not available: ${err.message}. Trying FFmpeg for shadow.`);
        this.createVideoShadowWithFFmpeg(outputPath, width, height, blur, shadowColor)
          .then(resolve)
          .catch(reject);
      });
    });
  }
  
  /**
   * Fallback method to create a video shadow using FFmpeg
   */
  private static async createVideoShadowWithFFmpeg(
    outputPath: string,
    width: number,
    height: number,
    blur: number,
    shadowColor: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      // FFmpeg can't create real shadows, so we'll just create a semi-transparent rectangle
      // that's slightly larger than the video dimensions
      
      // Make the shadow slightly larger than the video
      const shadowPadding = Math.min(blur, 10); // Limit the padding for better control
      const shadowWidth = width + shadowPadding * 2;
      const shadowHeight = height + shadowPadding * 2;
      
      // Extract the hex color without the # and add alpha
      let colorWithAlpha = shadowColor;
      if (colorWithAlpha.startsWith('#')) {
        colorWithAlpha = colorWithAlpha.substring(1);
      }
      // Use a semi-transparent color for the shadow
      colorWithAlpha = `0x${colorWithAlpha}80`; // 80 is ~50% opacity in hex
      
      const ffmpeg = spawn('ffmpeg', [
        '-f', 'lavfi',
        '-i', `color=c=${colorWithAlpha}:s=${shadowWidth}x${shadowHeight}`,
        '-vf', `boxblur=${Math.max(blur/2, 1)}:1`, // Apply some blur for soft edges
        '-frames:v', '1',
        '-y',
        outputPath
      ]);
      
      ffmpeg.on('close', (code: number) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Failed to create shadow with FFmpeg: exit code ${code}`));
        }
      });
      
      ffmpeg.on('error', (err: Error) => {
        reject(new Error(`Failed to create shadow with FFmpeg: ${err.message}`));
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
