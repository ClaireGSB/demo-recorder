// src/tests/transition-test.ts
import * as path from 'path';
import { TransitionManager } from '../recorder/transitions/TransitionManager';
import { Segment } from '../recorder/segments/types';
import { TransitionOptions } from '../recorder/transitions/types';
import { MetricsLogger } from '../recorder/metrics/MetricsLogger';

const videoPath1= 'your-video-path1';
const videoPath2= 'your-video-path2';

async function testTransition() {
  try {
    const transitionManager = new TransitionManager();
    const recordingsDir = path.join(__dirname, '..', '..', 'recordings');

    const segments: Segment[] = [
      {
        path: path.join(recordingsDir, videoPath1),
        startTime: 0,
        frameCount: 0,
        width: 1728,
        height: 1080
      },
      {
        path: path.join(recordingsDir, videoPath2),
        startTime: 0,
        frameCount: 0,
        width: 1728,
        height: 1080
      }
    ];

    const outputPath = path.join(recordingsDir, 'combined-with-transition.mp4');

    // Test different transitions
    const transitions: TransitionOptions[] = [
      {
        type: 'fade',
        duration: 500,
        options: { color: 'white' }
      },
      {
        type: 'dissolve',
        duration: 750,
        options: { strength: 1.5 }
      }
    ];

    for (const transition of transitions) {
      MetricsLogger.logInfo(`Starting ${transition.type} transition test...`);
      await transitionManager.applyTransition(
        segments, 
        outputPath.replace('.mp4', `-${transition.type}.mp4`),
        transition
      );
      MetricsLogger.logInfo(`${transition.type} test completed successfully!`);
    }

  } catch (error) {
    MetricsLogger.logError(error as Error, 'Transition Test');
    process.exit(1);
  }
}

testTransition().catch(console.error);