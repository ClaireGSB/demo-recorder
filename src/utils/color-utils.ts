// src/utils/color-utils.ts

/**
 * Create an object with methods to modify mouse helper elements with a custom color
 * @param targetColor The hex color to apply
 */
export interface MouseColorModifier {
  /**
   * Applies the color to mouse helper elements via page.evaluateOnNewDocument
   * @param page Puppeteer Page object
   */
  applyToPage: (page: any) => Promise<void>;
}

/**
 * Creates a mouse color modifier that can apply a custom color to the mouse helper
 * @param targetColor The hex color to apply to the mouse helper
 * @returns A MouseColorModifier object
 */
export function createMouseColorModifier(targetColor: string): MouseColorModifier {
  return {
    applyToPage: async (page) => {
      await page.evaluateOnNewDocument((color: string) => {
        // Function that attempts to modify the mouse helper elements
        function modifyMouseHelper() {
          // Look for the SVG elements within the mouse-helper container
          const container = document.querySelector('.mouse-helper-container');
          if (!container) return false;
          
          // Try to find both the image and potentially any directly embedded SVG
          const helperImg = container.querySelector('img');
          const helperSvg = container.querySelector('svg');
          
          if (helperImg && !helperSvg) {
            // If we only have the img element but not direct SVG access,
            // we need to replace it with our own SVG that we can control
            
            // Create inline SVG with the custom color
            const svgContent = `
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
                <circle fill="${color}" cx="16" cy="16" r="10" />
                <circle stroke="${color}" fill="none" stroke-width="2" cx="16" cy="16" r="14" />
              </svg>
            `;
            
            // Create a data URL from the SVG content
            const svgDataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgContent);
            
            // Replace the image src with our custom SVG
            helperImg.setAttribute('src', svgDataUrl);
            
            // Remove any filters that might have been applied previously
            helperImg.style.filter = 'none';
          } 
          else if (helperSvg) {
            // If we have direct access to the SVG, modify its elements
            const circles = helperSvg.querySelectorAll('circle');
            circles.forEach(circle => {
              if (circle.getAttribute('fill') === 'red' || circle.getAttribute('fill') === '#ff0000') {
                circle.setAttribute('fill', color);
              }
              if (circle.getAttribute('stroke') === 'red' || circle.getAttribute('stroke') === '#ff0000') {
                circle.setAttribute('stroke', color);
              }
            });
          }
          
          return true;
        }
        
        // Try immediately
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
          setTimeout(modifyMouseHelper, 500);
        }
        
        // Also try when the DOM is loaded
        document.addEventListener('DOMContentLoaded', () => {
          setTimeout(modifyMouseHelper, 500);
        });
        
        // Set up a MutationObserver to watch for the mouse helper being added to the DOM
        const observer = new MutationObserver((mutations) => {
          for (const mutation of mutations) {
            if (mutation.addedNodes.length) {
              if (modifyMouseHelper()) {
                observer.disconnect();
                break;
              }
            }
          }
        });
        
        // Start observing
        observer.observe(document.body, {
          childList: true,
          subtree: true
        });
      }, targetColor);
    }
  };
}
