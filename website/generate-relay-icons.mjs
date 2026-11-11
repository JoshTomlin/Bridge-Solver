import fs from 'node:fs/promises';
import { chromium } from '@playwright/test';

const svg = await fs.readFile(new URL('./icons/relay.svg', import.meta.url), 'utf8');
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  await page.setContent(`<style>html,body{margin:0}svg{display:block;width:100vw;height:100vh}</style>${svg}`);
  for (const size of [180, 192, 512]) {
    await page.setViewportSize({ width: size, height: size });
    await page.screenshot({ path: new URL(`./icons/relay-${size}.png`, import.meta.url).pathname });
  }
} finally { await browser.close(); }
