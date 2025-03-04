// src/config.ts
import * as fs from 'fs';
import * as path from 'path';
import * as TOML from 'toml';
import { DemoConfig } from './recorder/types';

export function getConfigPath(targetDir: string): string {
  return path.join(targetDir, '.demo-recorder.toml');
}

export function getExampleConfigPath(): string {
  return path.join(__dirname, '..', 'example-config.toml');
}

export function createConfigFile(configPath: string): void {
  const exampleConfigPath = getExampleConfigPath();

  if (!fs.existsSync(exampleConfigPath)) {
    throw new Error('Example config file not found. Please ensure example-config.toml exists in the project root.');
  }

  fs.copyFileSync(exampleConfigPath, configPath);
  console.log(`Created new config file at ${configPath}`);
  console.log('Please customize the config file for your specific needs.');
}

function interpolateEnvVariables(obj: any): any {
  if (typeof obj === 'string') {
    return obj.replace(/\${([^}]+)}/g, (match, envVar) => {
      // Check if it's a nested reference like auth.email
      const parts = envVar.split('.');
      if (parts.length > 1) {
        return match; // Keep the original ${auth.email} format for nested refs
      }
      return process.env[envVar] || match;
    });
  }

  if (Array.isArray(obj)) {
    return obj.map(item => interpolateEnvVariables(item));
  }

  if (obj && typeof obj === 'object') {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = interpolateEnvVariables(value);
    }
    return result;
  }

  return obj;
}

function interpolateConfigReferences(config: any): any {
  let stringified = JSON.stringify(config);

  // Replace ${auth.email} and similar with actual values
  stringified = stringified.replace(/\${([^}]+)}/g, (match, path) => {
    const parts = path.split('.');
    let value = config;
    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = value[part];
      } else {
        return match; // Keep original if path not found
      }
    }
    return typeof value === 'string' ? value : match;
  });

  return JSON.parse(stringified);
}

// Check if recording-related steps are present
function hasRecordingSteps(steps: any[]): boolean {
  return steps.some(step =>
    ['startRecording', 'stopRecording', 'pauseRecording', 'resumeRecording'].includes(step.type)
  );
}

// Validate the config based on steps present
function validateConfig(config: any): void {
  // Validate required base fields
  if (!config.project) {
    throw new Error('Project configuration is required');
  }

  if (!config.project.baseUrl) {
    throw new Error('Project baseUrl is required');
  }

  if (!config.project.viewport) {
    throw new Error('Project viewport configuration is required');
  }

  if (!config.steps || !Array.isArray(config.steps) || config.steps.length === 0) {
    throw new Error('At least one step is required in the steps array');
  }

  // Validate recording config only if recording steps are present
  const needsRecording = hasRecordingSteps(config.steps);

  if (needsRecording) {
    if (!config.recording) {
      throw new Error('Recording configuration is required when recording steps are present');
    }

    if (!config.recording.output) {
      throw new Error('Recording output path is required when recording steps are present');
    }
  }
}

export function readConfig(configPath: string): DemoConfig {
  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    let config = TOML.parse(content) as DemoConfig;

    // First interpolate environment variables
    config = interpolateEnvVariables(config);

    // Then interpolate config references
    config = interpolateConfigReferences(config);

    // Validate the configuration
    validateConfig(config);

    // check if any of the steps is "pause" and has "transition"
    config.hasTransitions = config.steps.some(step => step.type === 'pauseRecording' && step.transition);
    console.log('Config has transitions:', config.hasTransitions);

    return config;
  } catch (error) {
    console.error(`Error reading config at ${configPath}:`, error);
    throw error;
  }
}

export function ensureConfigExists(targetDir: string): string {
  const configPath = getConfigPath(targetDir);
  if (!fs.existsSync(configPath)) {
    createConfigFile(configPath);
  }
  return configPath;
}

export function initializeConfig(targetDir: string): DemoConfig {
  const configPath = ensureConfigExists(targetDir);
  return readConfig(configPath);
}
