// src/recorder/transitions/implementations/FadeTransition.ts
import { BaseTransition } from './BaseTransitions';
import { FadeTransitionOptions } from './types';

export class FadeTransition extends BaseTransition<FadeTransitionOptions> {
  protected createFilterGraph(
    fadeStartTime: number,
    durationInSeconds: number,
    options?: FadeTransitionOptions['options']
  ): string {
    return `[0:v]fade=t=out:st=${fadeStartTime}:d=${durationInSeconds}${
      options?.color ? `:color=${options.color}` : ''
    }[v0];` +
    `[1:v]fade=t=in:st=0:d=${durationInSeconds}${
      options?.color ? `:color=${options.color}` : ''
    }[v1];` +
    `[v0][v1]concat=n=2:v=1[outv]`;
  }
}