// src/recorder/transitions/types.ts
export type TransitionType = 'fade' | 'dissolve';

export interface BaseTransitionOptions {
  type: TransitionType;
  duration: number;  // milliseconds
  options?: Record<string, any>;  // Base options type
}

export interface FadeTransitionOptions extends BaseTransitionOptions {
  type: 'fade';
  options?: {
    color?: string;
  };
}


export interface DissolveTransitionOptions extends BaseTransitionOptions {
  type: 'dissolve';
  options?: {
    strength?: number;
  };
}

export type TransitionOptions = 
  | FadeTransitionOptions 
  | DissolveTransitionOptions;
