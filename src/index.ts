// src/index.ts
import * as path from 'path';
import * as fs from 'fs';
import { initializeConfig, ensureConfigExists } from './config';
import { DemoRecorder } from './recorder/CustomScreenRecorder';

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

console.log(`Command: ${command}`);
console.log(`Target directory: ${targetDir}`);

async function init() {
  try {
    if (!fs.existsSync(targetDir)) {
      console.error(`Error: Target directory does not exist: ${targetDir}`);
      process.exit(1);
    }

    console.log(`Initializing demo recorder config in: ${targetDir}`);

    // This will create the config file if it doesn't exist
    const configPath = ensureConfigExists(targetDir);

    console.log('\nConfiguration file created successfully!');
    console.log(`Please edit ${configPath} to configure your recording steps.`);
    console.log('\nOnce configured, you can run:');
    console.log('demo-record');
    console.log('\nto start the recording.');

  } catch (error) {
    console.error('Initialization failed:', error);
    process.exit(1);
  }
}

async function record() {
  try {
    if (!fs.existsSync(targetDir)) {
      console.error(`Error: Target directory does not exist: ${targetDir}`);
      process.exit(1);
    }

    console.log(`Starting demo recorder for directory: ${targetDir}`);

    // Load and validate config
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
        console.error('Unknown command. Use "init" or "record"');
        process.exit(1);
    }
  } catch (error) {
    console.error('Unexpected error:', error);
    process.exit(1);
  }
}

// Run the main function
main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
