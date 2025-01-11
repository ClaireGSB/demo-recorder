// src/recorder/transitions/TransitionManager.ts
import { RecordingSegment } from '../types';
import { TransitionOptions, TransitionType } from './types';
import { FadeTransition } from './FadeTransition';
import { DissolveTransition } from './DissolveTransition';
import { BaseTransition } from './BaseTransitions';
import { MetricsLogger } from '../metrics/MetricsLogger';


export class TransitionManager {
  private transitions: Record<TransitionType, BaseTransition<any>> = {
    fade: new FadeTransition(),
    dissolve: new DissolveTransition()
  };

  async applyTransition(
    segments: RecordingSegment[],
    outputPath: string,
    transitionOptions: TransitionOptions
  ): Promise<void> {
    if (segments.length < 2) {
      throw new Error('At least two segments are required for transition');
    }

    // Find the first segment with a transition
    const transitionSegmentIndex = segments.findIndex(seg => seg.hasTransition && seg.transition);
    if (transitionSegmentIndex === -1 || transitionSegmentIndex === segments.length - 1) {
      MetricsLogger.logInfo('No valid transitions found between segments');
      return;
    }

    const segment = segments[transitionSegmentIndex];
    const nextSegment = segments[transitionSegmentIndex + 1];

    const transition = this.transitions[segment.transition!.type];
    if (!transition) {
      throw new Error(`Unsupported transition type: ${segment.transition!.type}`);
    }

    MetricsLogger.logInfo(`Applying ${segment.transition!.type} transition between segments ${transitionSegmentIndex} and ${transitionSegmentIndex + 1}`);
    
    return transition.apply(
      [segment, nextSegment],
      outputPath,
      segment.transition!
    );
  }
}