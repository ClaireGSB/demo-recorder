// src/tests/transition-test.ts
import * as path from 'path';
import { TransitionManager } from '../recorder/transitions/TransitionManager';
import { Segment } from '../recorder/segments/types';
import { TransitionOptions } from '../recorder/transitions/types';
import { MetricsLogger } from '../recorder/metrics/MetricsLogger';

async function testTransition() {
  try {
    const transitionManager = new TransitionManager();
    const recordingsDir = path.join(__dirname, '..', '..', 'recordings');

    // Define the two videos we want to combine
    const segments: Segment[] = [
      {
        path: path.join(recordingsDir, 'login-flow.mp4'),
        startTime: 0,
        frameCount: 0,
        width: 1728,
        height: 1080
      },
      {
        path: path.join(recordingsDir, 'login-flow2.mp4'),
        startTime: 0,
        frameCount: 0,
        width: 1728,
        height: 1080
      }
    ];

    const outputPath = path.join(recordingsDir, 'combined-with-transition.mp4');

    // Configure a half-second fade transition
    const transitionOptions: TransitionOptions = {
      type: 'fade',
      duration: 500
    };

    MetricsLogger.logInfo('Starting transition test...');
    await transitionManager.applyTransition(segments, outputPath, transitionOptions);
    MetricsLogger.logInfo('Test completed successfully!');

  } catch (error) {
    MetricsLogger.logError(error as Error, 'Transition Test');
    process.exit(1);
  }
}

testTransition().catch(console.error);