// src/index.ts
import * as path from 'path';
import * as fs from 'fs';
import { initializeConfig } from './config';
import { DemoRecorder } from './recorder/CustomScreenRecorder';

// Get command line arguments
const args = process.argv.slice(2);
const targetDir = path.resolve(args[0] || process.cwd());

async function main() {
  try {
    // Verify target directory exists
    if (!fs.existsSync(targetDir)) {
      console.error(`Error: Target directory does not exist: ${targetDir}`);
      process.exit(1);
    }

    console.log(`Starting demo recorder for directory: ${targetDir}`);

    // This will create the config file if it doesn't exist
    const config = initializeConfig(targetDir);

    // Create output directory if specified in config
    const outputDir = path.dirname(path.join(targetDir, config.recording.output));
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Initialize and run recorder
    const recorder = new DemoRecorder(config);
    await recorder.record();

  } catch (error) {
    console.error('Recording failed:', error);
    process.exit(1);
  }
}

// Run the main function
main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
