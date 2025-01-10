// src/utils/delay.ts
/**
 * Creates a promise that resolves after a specified number of milliseconds
 * @param ms Number of milliseconds to wait
 * @returns Promise that resolves after the specified delay
 */
export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));