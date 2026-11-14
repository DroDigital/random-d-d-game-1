// Headless smoke test: opens play/index.html from disk, plays a scripted run,
// takes screenshots, and fails on any uncaught error.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.env.SHOTS || path.join(ROOT, 'shots');
const errors = [];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.goto('file://' + path.join(ROOT, 'play', 'index.html'));
await page.waitForFunction(() => document.getElementById('boot').classList.contains('done'), null, { timeout: 180000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: path.join(OUT, '01-title.png') });
const step = async (ms) => page.waitForTimeout(ms);
const press = async (k, ms = 80) => { await page.keyboard.down(k); await step(ms); await page.keyboard.up(k); await step(60); };
// begin -> select
await press('Space'); await step(800);
await press('Space'); await step(300);      // P1 joins
await press('Slash'); await step(300);      // P2 joins
await press('ArrowRight'); await step(200); // P2 changes class
await page.screenshot({ path: path.join(OUT, '02-select.png') });
await press('Space'); await press('Slash'); // ready
await step(9000);
await page.screenshot({ path: path.join(OUT, '03-shrine.png') });
// rest at shrine and walk north to the door
await press('KeyF'); await step(800);
await page.screenshot({ path: path.join(OUT, '04-shrine-panel.png') });
await press('Escape'); await step(300);
await page.keyboard.down('KeyW'); await page.keyboard.down('ArrowUp'); await step(3500); await page.keyboard.up('KeyW'); await page.keyboard.up('ArrowUp');
await step(3000);
await page.screenshot({ path: path.join(OUT, '05-room.png') });
// fight a bit
for (let i = 0; i < 30; i++) {
  await page.keyboard.down(i % 4 < 2 ? 'KeyW' : 'KeyA');
  await press('Space', 60);
  await press('Slash', 60);
  if (i % 7 === 3) await press('KeyQ');
  if (i % 9 === 5) await press('ShiftLeft');
  await page.keyboard.up(i % 4 < 2 ? 'KeyW' : 'KeyA');
  if (i === 10) await page.screenshot({ path: path.join(OUT, '06-combat.png') });
}
await page.screenshot({ path: path.join(OUT, '07-combat2.png') });
const state = await page.evaluate(() => { const g = window.__game; return { mode: g.mode, enemies: g.enemies.length, heroes: g.heroes.map((h) => [h.cls.id, h.hp, h.maxHp, h.state]), err: String(window.__aoErr || ''), room: g.roomType, ash: g.run && g.run.ash }; });
console.log(JSON.stringify(state));
console.log(errors.slice(0, 30).join('\n'));
await browser.close();
if (state.err) process.exit(1);
