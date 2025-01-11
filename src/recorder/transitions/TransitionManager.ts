// src/recorder/transitions/TransitionManager.ts
import { Segment } from '../segments/types';
import { TransitionOptions, TransitionType } from './types';
import { FadeTransition } from './FadeTransition';
import { DissolveTransition } from './DissolveTransition';
import { BaseTransition } from './BaseTransitions';

export class TransitionManager {
  private transitions: Record<TransitionType, BaseTransition<any>> = {
    fade: new FadeTransition(),
    dissolve: new DissolveTransition()
  };

  async applyTransition(
    segments: Segment[],
    outputPath: string,
    transitionOptions: TransitionOptions
  ): Promise<void> {
    const transition = this.transitions[transitionOptions.type];
    if (!transition) {
      throw new Error(`Unsupported transition type: ${transitionOptions.type}`);
    }

    return transition.apply(segments, outputPath, transitionOptions);
  }
}