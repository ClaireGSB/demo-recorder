// src/recorder/transitions/DissolveTransition.ts
import { BaseTransition } from './BaseTransitions';
import { DissolveTransitionOptions } from './types';

export class DissolveTransition extends BaseTransition<DissolveTransitionOptions> {
  protected createFilterGraph(
    fadeStartTime: number,
    durationInSeconds: number,
    options?: NonNullable<DissolveTransitionOptions['options']>
  ): string {
    // const strength = options?.strength || 1;
    return `[0:v][1:v]xfade=transition=dissolve:duration=${durationInSeconds}:offset=${fadeStartTime}[outv]`;
  }
}