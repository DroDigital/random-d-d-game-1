// Audio via Howler.js: Kenney SFX packs, Kenney + Ninja Adventure music,
// Kenney announcer voice. Every sound gets slight pitch variation.
import { Howl, Howler } from 'howler';
import { url } from './assets.js';

const A = 'assets/audio/';
const SFX = {
  swing: ['rpg/drawKnife1', 'rpg/drawKnife2', 'rpg/cloth1'],
  slice: ['rpg/knifeSlice', 'rpg/knifeSlice2', 'rpg/chop'],
  hitFlesh: ['impact/impactPunch_medium_000', 'impact/impactSoft_heavy_000', 'impact/impactSoft_medium_000'],
  hitArmor: ['impact/impactMetal_medium_000', 'impact/impactPlate_heavy_000', 'impact/impactMetal_light_000'],
  hitHeavy: ['impact/impactMetal_heavy_000', 'impact/impactMetal_heavy_001', 'impact/impactPunch_heavy_000'],
  bone: ['impact/impactWood_heavy_000', 'impact/impactMining_000'],
  crit: ['impact/impactBell_heavy_000', 'impact/impactBell_heavy_001'],
  miss: ['rpg/cloth3', 'rpg/cloth1'],
  dodge: ['rpg/cloth3', 'rpg/beltHandle1'],
  dice: ['ui/tick_002', 'ui/click_002', 'impact/impactGeneric_light_000'],
  cast: ['ui/maximize_006', 'rpg/bookFlip1'],
  magicHit: ['impact/impactGlass_light_000', 'ui/glass_002'],
  potion: ['ui/glass_002', 'rpg/metalClick'],
  coins: ['rpg/handleCoins', 'rpg/handleCoins2'],
  door: ['rpg/doorOpen_1', 'rpg/metalLatch'],
  doorClose: ['rpg/doorClose_2'],
  chest: ['rpg/creak1', 'rpg/metalClick'],
  shrine: ['ui/bong_001'],
  step: ['impact/footstep_concrete_000', 'impact/footstep_concrete_001', 'impact/footstep_concrete_002', 'impact/footstep_concrete_003'],
  select: ['ui/select_003'],
  move: ['ui/click_002'],
  confirm: ['ui/confirmation_002'],
  back: ['ui/close_002'],
  error: ['ui/error_004'],
  open: ['ui/open_002'],
  levelUp: ['jingles/hit_03'],
  boon: ['jingles/hit_05'],
  bossDown: ['jingles/hit_10'],
  roomClear: ['jingles/hit_00'],
  downed: ['jingles/hit_08'],
  explode: ['impact/impactPunch_heavy_000', 'impact/impactWood_heavy_000'],
  scratch: ['ui/scratch_002'],
  book: ['rpg/bookOpen'],
  drop: ['rpg/dropLeather'],
};
const VOICE = ['begin', 'fight', 'final_round', 'prepare_yourself', 'game_over', 'winner', 'you_win', 'flawless_victory'];
const MUSIC = {
  title: 'music/na_intro', select: 'music/na_curse', crypt: 'music/na_crypt', ossuary: 'music/na_dark_castle',
  abyss: 'music/na_final_area', boss: 'music/na_fight', boss2: 'music/na_fight2', shrine: 'music/na_melancholia',
  gameover: 'music/na_lament', victory: 'music/retro_mystic', peddler: 'music/flowing_rocks', altar: 'music/infinite_descent',
  sad: 'music/sad_descent',
};

const howls = {};
const lastPlay = {};
let music = null, musicKey = null;
export const audioSettings = { sfx: 0.8, music: 0.55, voice: 0.8, announcer: true };

function howl(path, opts = {}) {
  if (!howls[path]) howls[path] = new Howl({ src: [url(A + path + '.mp3')], format: ['mp3'], preload: true, ...opts });
  return howls[path];
}

export const audio = {
  init() {
    for (const k in SFX) SFX[k].forEach((p) => howl(p));
    VOICE.forEach((v) => howl('voice/' + v));
  },
  play(name, { vol = 1, rate = null, spread = 0.08 } = {}) {
    const list = SFX[name];
    if (!list) return;
    const now = performance.now();
    if (lastPlay[name] && now - lastPlay[name] < 35) return; // avoid stacking
    lastPlay[name] = now;
    const h = howl(list[Math.floor(Math.random() * list.length)]);
    const id = h.play();
    h.volume(Math.min(1, vol * audioSettings.sfx), id);
    h.rate(rate ?? (1 + (Math.random() * 2 - 1) * spread), id);
  },
  voice(name) {
    if (!audioSettings.announcer) return;
    const h = howl('voice/' + name);
    const id = h.play(); h.volume(audioSettings.voice * 0.7, id); h.rate(0.82, id); // deeper, ominous
  },
  music(key) {
    if (key === musicKey) return;
    musicKey = key;
    const old = music;
    if (old) { old.fade(old.volume(), 0, 900); setTimeout(() => old.stop(), 950); }
    if (!key || !MUSIC[key]) { music = null; return; }
    music = new Howl({ src: [url(A + MUSIC[key] + '.mp3')], format: ['mp3'], loop: true, volume: 0 });
    music.play();
    music.fade(0, audioSettings.music * 0.6, 1400);
  },
  refreshVolume() { if (music) music.volume(audioSettings.music * 0.6); },
  unlock() { if (Howler.ctx && Howler.ctx.state === 'suspended') Howler.ctx.resume(); },
};
