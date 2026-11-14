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
try {
  await page.waitForFunction(() => window.__game.mode === 'play' && !document.querySelector('.layer-fade.on'), null, { timeout: 120000 });
} catch (e) {
  await page.screenshot({ path: path.join(OUT, 'fail-start.png') });
  console.log('run did not start', JSON.stringify(await page.evaluate(() => ({ mode: window.__game.mode, screen: window.__game.ui.screen, err: String(window.__aoErr || '') }))), errors.join('\n'));
  process.exit(1);
}
await step(1500);
await page.screenshot({ path: path.join(OUT, '03-shrine.png') });
// walk to the shrine, rest, then walk north to the door
// hold until the party reaches the shrine (frame-rate independent)
await page.keyboard.down('KeyW'); await page.keyboard.down('ArrowUp');
await page.waitForFunction(() => window.__game.heroes[0].pos.z < 3, null, { timeout: 60000 });
await page.keyboard.up('KeyW'); await page.keyboard.up('ArrowUp');
await press('KeyF'); await step(800);
await page.screenshot({ path: path.join(OUT, '04-shrine-panel.png') });
await press('Escape'); await step(300);
// line the party up in front of the first north door, then walk through it
await page.evaluate(() => { const g = window.__game; const d = g.doors.find((x) => x.side === 'N') || g.doors[0]; g.heroes.forEach((h, i) => h.pos.set(d.x + d.inX * 5 + (i - 0.5), 0, d.z + d.inZ * 5)); g.leashCenter = { x: d.x + d.inX * 5, z: d.z + d.inZ * 5 }; });
const dirKeys = await page.evaluate(() => { const g = window.__game; const d = g.doors.find((x) => x.side === 'N') || g.doors[0]; return d.side === 'N' ? ['KeyW', 'ArrowUp'] : d.side === 'W' ? ['KeyA', 'ArrowLeft'] : ['KeyD', 'ArrowRight']; });
for (const k of dirKeys) await page.keyboard.down(k);
try {
  await page.waitForFunction(() => window.__game.roomType !== 'shrine', null, { timeout: 90000 });
} catch (e) {
  await page.screenshot({ path: path.join(OUT, 'fail-door.png') });
  console.log('did not leave the shrine', JSON.stringify(await page.evaluate(() => { const g = window.__game; return { heroes: g.heroes.map((h) => [h.pos.x, h.pos.z, h.state]), doors: g.doors.map((d) => [d.side, d.x, d.z, d.open]), panels: g.ui.panels.size, paused: g.paused, toast: document.querySelector('.layer-toast').textContent }; })));
  process.exit(1);
}
for (const k of dirKeys) await page.keyboard.up(k);
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
