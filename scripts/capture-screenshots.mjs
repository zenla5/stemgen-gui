import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = join(ROOT, 'screenshots');

mkdirSync(OUT, { recursive: true });

const VIEWPORT = { width: 1280, height: 800 };

const VIEWS = [
  { name: 'files',    key: '1' },
  { name: 'queue',    key: '2' },
  { name: 'mixer',    key: '3' },
  { name: 'settings', key: '4' },
];

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();

  console.log('Opening app...');
  await page.goto('http://localhost:1420', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // Main / files view
  for (const view of VIEWS) {
    console.log(`Capturing ${view.name} view...`);
    await page.keyboard.press(view.key);
    await page.waitForTimeout(800);
    await page.screenshot({
      path: join(OUT, `${view.name}.png`),
      fullPage: false,
    });
    console.log(`  -> screenshots/${view.name}.png`);
  }

  await browser.close();
  console.log('Done!');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
