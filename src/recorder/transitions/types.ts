// src/recorder/transitions/types.ts
export interface TransitionOptions {
  type: 'fade';
  duration: number;  // milliseconds
  options?: {
    color?: string;  // for fade transition
  };
}
