// Entry point: boot, main loop, top-level state transitions.
import { Game } from './game.js';
import { UI } from './ui/ui.js';
import { loadFonts } from './core/assets.js';
import { audio, audioSettings } from './core/audio.js';
import { input } from './core/input.js';
import { meta } from './core/meta.js';
import { settings as psxSettings } from './render/psx.js';
import { setLang, detectLang } from './i18n/index.js';
import { draftBoons } from './world/run.js';
import { loadGLTF } from './core/assets.js';
import { Box3 } from 'three';

const bootFill = document.getElementById('boot-fill');
const bootNote = document.getElementById('boot-note');

async function main() {
  // restore settings
  const s = meta.data.settings;
  if (s) { Object.assign(psxSettings, s.psx || {}); Object.assign(audioSettings, s.audio || {}); }
  setLang((s && s.lang) || detectLang());
  await loadFonts();
  const game = new Game();
  game.showLog = s ? s.showLog !== false : true;
  game.vowsChosen = new Set(meta.data.vows || []);
  const ui = new UI(game);
  game.ui = ui;
  game.psx.applySettings();
  audio.init();
  await game.init((p, msg) => { bootFill.style.width = (p * 100) + '%'; bootNote.textContent = msg + '…'; });
  document.getElementById('boot').classList.add('done');

  game.beginRun = async (players) => {
    meta.data.vows = [...game.vowsChosen]; meta.save();
    game.mode = 'loading';
    ui.fade(true);
    if (game.titleHeroes) { for (const m of game.titleHeroes) game.scene.remove(m.root); game.titleHeroes = null; }
    await game.startRun(players, game.vowsChosen);
    ui.buildHud();
  };
  game.onLanguageChange = () => { if (ui.hudEls.length) ui.buildHud(); };
  game.resume = () => { game.paused = false; ui.setScreen(null); ui.onBack = null; };
  game.abandon = () => { game.mode = 'over'; const m = game.endRun(false); ui.showEnd(false, m); };
  game.toTitle = async () => {
    for (const h of game.heroes) h.removeModel();
    game.heroes = []; game.run = null; game.boss = null;
    ui.closeAllPanels(); ui.layer.hud.innerHTML = ''; ui.layer.prompt.innerHTML = ''; ui.hudEls = [];
    game.psx.post.uniforms.uDesat.value = 0;
    await game.buildTitleScene();
    ui.showTitle();
  };

  await game.buildTitleScene();
  ui.showTitle();

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    try {
      if (game.mode === 'play' && !ui.screen) {
        const c = input.controllers.find((k) => k.connected && k.pressed('pause'));
        if (c) {
          const hero = game.heroes.find((h) => h.controllerId === c.id);
          if (!hero || !ui.panelFor(hero)) { game.paused = true; ui.showPause(); c.consume('back'); }
        }
      }
      game.update(dt);
      ui.update(dt);
      game.render();
    } catch (e) {
      console.error(e);
      if (!window.__aoErr) { window.__aoErr = e; }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.__game = game;
  window.__psx = psxSettings;
  window.__draft = draftBoons; // test hooks (balance sims, asset checks)
  window.__loadGLTF = loadGLTF; window.__Box3 = Box3;
}

main().catch((e) => {
  console.error(e);
  bootNote.textContent = 'Error: ' + e.message;
});
