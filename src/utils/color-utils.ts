// src/utils/color-utils.ts

/**
 * Convert hex color to HSL
 * @param hex Hex color string (e.g., '#3498db' or '3498db')
 * @returns Object containing h, s, l values
 */
export function hexToHSL(hex: string): { h: number, s: number, l: number } {
  // Remove the # if present
  hex = hex.replace(/^#/, '');
  
  // Parse the r, g, b values
  let r = parseInt(hex.substring(0, 2), 16) / 255;
  let g = parseInt(hex.substring(2, 4), 16) / 255;
  let b = parseInt(hex.substring(4, 6), 16) / 255;
  
  let max = Math.max(r, g, b);
  let min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  
  if (max !== min) {
    let d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    
    h = h / 6 * 360;
  }
  
  return { h, s, l };
}

/**
 * Calculate hue rotation value for a target color
 * @param targetHex Target hex color
 * @returns Rotation value in degrees
 */
export function calculateHueRotation(targetHex: string): number {
  // Default blue hue (approximately the hue of the default mouse helper)
  // const baseHue = 210;
  // default red hue
  const baseHue = 0;
  
  // Get the hue of the target color
  const targetHSL = hexToHSL(targetHex);
  
  // Calculate how much we need to rotate from base to target
  let rotation = targetHSL.h - baseHue;
  
  // Normalize to 0-360 range
  if (rotation < 0) rotation += 360;
  
  return rotation;
}

/**
 * Calculate saturation adjustment based on target color
 * @param targetHex Target hex color
 * @returns Saturation adjustment factor
 */
export function calculateSaturationAdjustment(targetHex: string): number {
  const targetHSL = hexToHSL(targetHex);
  // Adjust saturation factor based on target color saturation
  // Higher saturation values for more vibrant colors
  return 1 + targetHSL.s;
}

/**
 * Get CSS filter string for a target color
 * @param hexColor Target hex color
 * @returns CSS filter string
 */
export function getColorFilterString(hexColor: string): string {
  const hueRotation = calculateHueRotation(hexColor);
  const saturationFactor = calculateSaturationAdjustment(hexColor);
  
  return `hue-rotate(${hueRotation}deg) saturate(${saturationFactor})`;
}
