// src/index.ts
import * as path from 'path';
import * as fs from 'fs';
import { initializeConfig, ensureConfigExists } from './config';
import { DemoRecorder } from './recorder/core/DemoRecorder';  // Updated import path
import { MetricsLogger } from './recorder/metrics/MetricsLogger';  // Add MetricsLogger for better logging

async function init() {
  try {
    if (!fs.existsSync(targetDir)) {
      MetricsLogger.logError(new Error(`Target directory does not exist: ${targetDir}`), 'Initialization');
      process.exit(1);
    }

    MetricsLogger.logInfo(`Initializing demo recorder config in: ${targetDir}`);

    // This will create the config file if it doesn't exist
    const configPath = ensureConfigExists(targetDir);

    MetricsLogger.logInfo('\nConfiguration file created successfully!');
    MetricsLogger.logInfo(`Please edit ${configPath} to configure your recording steps.`);
    MetricsLogger.logInfo('\nOnce configured, you can run:');
    MetricsLogger.logInfo('demo-record');
    MetricsLogger.logInfo('\nto start the recording.');

  } catch (error) {
    MetricsLogger.logError(error as Error, 'Initialization');
    process.exit(1);
  }
}

async function record() {
  try {
    if (!fs.existsSync(targetDir)) {
      MetricsLogger.logError(new Error(`Target directory does not exist: ${targetDir}`), 'Recording');
      process.exit(1);
    }

    MetricsLogger.logInfo(`Starting demo recorder for directory: ${targetDir}`);

    // Load and validate config
    const config = initializeConfig(targetDir);

    // Create output directory if recording is configured
    if (config.recording && config.recording.output) {
      const outputDir = path.dirname(path.join(targetDir, config.recording.output));
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
    } else {
      // For screenshot-only configs
      // Create a default screenshots directory
      const screenshotsDir = path.join(targetDir, 'screenshots');
      if (!fs.existsSync(screenshotsDir)) {
        fs.mkdirSync(screenshotsDir, { recursive: true });
      }
      MetricsLogger.logInfo(`Created screenshots directory: ${screenshotsDir}`);
    }

    // Initialize and run recorder
    const recorder = new DemoRecorder(config);
    await recorder.record();

  } catch (error) {
    MetricsLogger.logError(error as Error, 'Recording');
    process.exit(1);
  }
}

// Get command line arguments
const args = process.argv.slice(2);
let command = 'record';  // default command
let targetDir = process.cwd();  // default directory

// If we have arguments, check their order
if (args.length > 0) {
  // If the first arg is a command, use it and look for dir in second arg
  if (args[0] === 'init' || args[0] === 'record') {
    command = args[0];
    targetDir = args[1] ? path.resolve(args[1]) : process.cwd();
  } else {
    // If first arg isn't a command, it must be the directory
    targetDir = path.resolve(args[0]);
  }
}

MetricsLogger.logInfo(`Command: ${command}`);
MetricsLogger.logInfo(`Target directory: ${targetDir}`);

// Main execution
async function main() {
  try {
    switch (command) {
      case 'init':
        await init();
        break;
      case 'record':
        await record();
        break;
      default:
        MetricsLogger.logError(new Error('Unknown command. Use "init" or "record"'), 'Command validation');
        process.exit(1);
    }
  } catch (error) {
    MetricsLogger.logError(error as Error, 'Main execution');
    process.exit(1);
  }
}

// Run the main function
main().catch((error) => {
  MetricsLogger.logError(error as Error, 'Application startup');
  process.exit(1);
});
