// src/utils/mouse-helper.ts
import { Page } from 'puppeteer';

export async function checkMouseHelper(page: Page) {
  const isMouseHelperAvailable = await page.evaluate(() => {
    return typeof (window as any)['mouse-helper'] === 'function';
  });

  console.log('Mouse helper available:', isMouseHelperAvailable);

  // Check if the mouse helper element exists in the DOM
  const mouseHelperExists = await page.evaluate(() => {
    return !!document.querySelector('.mouse-helper');
  });

  console.log('Mouse helper element exists:', mouseHelperExists);

  // Check mouse-helper script content
  try {
    const mouseHelperPath = require.resolve('mouse-helper/dist/mouse-helper.js');
    const fs = require('fs');
    const content = fs.readFileSync(mouseHelperPath, 'utf8');
    console.log('Mouse helper script length:', content.length);
    if (content.length < 100) {
      console.warn('Mouse helper script seems too small, might be corrupted');
    }
  } catch (error) {
    console.error('Error checking mouse helper script:', error);
  }
}
