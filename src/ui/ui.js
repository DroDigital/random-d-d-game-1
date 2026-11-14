// DOM user interface: menus, character select, HUD, per-player panels.
import { url } from '../core/assets.js';
import { input } from '../core/input.js';
import { audio, audioSettings } from '../core/audio.js';
import { meta } from '../core/meta.js';
import { CLASSES, CLASS_ORDER, SKINS, PLAYER_COLORS } from '../data/classes.js';
import { RARITY, PACTS, SHOP_ITEMS } from '../data/boons.js';
import { VOWS, UNLOCKS, ROOM_TYPES } from '../data/world.js';
import { LEVEL_COST, MAX_LEVEL, d20, rng } from '../core/rules.js';
import { settings as psx } from '../render/psx.js';
import { draftBoons } from '../world/run.js';
import { t, LANGUAGES, getLang, setLang } from '../i18n/index.js';
import { DEPTHS } from '../data/world.js';

const COND = { rage: 'RAGE', surge: 'ACTION SURGE', slowed: 'SLOWED', poisoned: 'POISONED', frightened: 'FRIGHTENED', hexed: 'HEXED', prone: 'PRONE', shadowAdv: 'HIDDEN', alert: 'ALERT', whirl: 'WHIRL', reckless: 'RECKLESS', fumbled: 'FUMBLED', dash: 'DASH', chilled: 'CHILLED', frozen: 'FROZEN' };
export const ctrlLabel = (c) => (c ? (c.layout ? t(c.label) : t('Gamepad {0}', c.padIndex + 1)) : '');

const $ = (sel, root = document) => root.querySelector(sel);
const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const icon = (name, color = 'currentColor') => `<i class="gi" style="--c:${color};-webkit-mask-image:url('${url('assets/icons/' + name + '.svg')}');mask-image:url('${url('assets/icons/' + name + '.svg')}')"></i>`;
const img = (path, cls = 'px') => `<img class="${cls}" src="${url(path)}" alt="">`;
const keycap = (k) => `<span class="key">${k}</span>`;

export class UI {
  constructor(game) {
    this.game = game;
    this.root = $('#ui');
    this.panels = new Map(); // hero -> panel
    this.screen = null;
    this.menuIndex = 0;
    this.hudEls = [];
    this.toastT = 0;
    this.root.innerHTML = '';
    document.documentElement.style.setProperty('--border', `url("${url('assets/ui/border-011.png')}")`);
    this.layer = {};
    for (const n of ['screen', 'hud', 'panels', 'banner', 'fade', 'toast', 'boss', 'log', 'prompt']) { this.layer[n] = h('div', 'layer layer-' + n); this.root.appendChild(this.layer[n]); }
    document.addEventListener('mousedown', () => audio.unlock());
    document.addEventListener('keydown', () => audio.unlock());
  }

  // ------------------------------------------------------------ generic
  fade(on) { this.layer.fade.classList.toggle('on', on); }
  banner(sup, text, dur = 2) {
    const b = this.layer.banner;
    b.innerHTML = `<div class="banner-in">${sup ? `<div class="banner-sup">${t(sup)}</div>` : ''}<div class="banner-text">${t(text)}</div></div>`;
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
    clearTimeout(this.bannerTimer); this.bannerTimer = setTimeout(() => b.classList.remove('show'), dur * 1000);
  }
  roomTitle(name, sub) { this.roomName = t(name); this.roomSub = sub; }
  toast(msg) { this.layer.toast.textContent = t(msg); this.layer.toast.classList.add('show'); clearTimeout(this.toastTimer); this.toastTimer = setTimeout(() => this.layer.toast.classList.remove('show'), 1800); }
  updateLog(lines) {
    if (!this.game.showLog) { this.layer.log.innerHTML = ''; return; }
    this.layer.log.innerHTML = lines.map((l) => `<div style="color:${l.color}">${l.msg}</div>`).join('');
  }

  // ------------------------------------------------------------ menus (shared)
  setScreen(name, build) {
    this.screen = name; this.menuIndex = 0;
    this.layer.screen.innerHTML = '';
    if (build) { const el = build(); this.layer.screen.appendChild(el); }
    this.layer.screen.classList.toggle('on', !!build);
  }
  menu(items, { title = '', sub = '', cls = '' } = {}) {
    const wrap = h('div', 'menu ' + cls);
    if (title) wrap.appendChild(h('div', 'menu-title', title));
    if (sub) wrap.appendChild(h('div', 'menu-sub', sub));
    const list = h('div', 'menu-list');
    items.forEach((it, i) => {
      const b = h('button', 'menu-item' + (it.disabled ? ' disabled' : ''), it.label);
      b.onmouseenter = () => { this.menuIndex = i; this.paintMenu(); };
      b.onclick = () => { this.menuIndex = i; this.activate(); };
      list.appendChild(b);
    });
    wrap.appendChild(list);
    this.menuItems = items; this.menuList = list;
    setTimeout(() => this.paintMenu(), 0);
    return wrap;
  }
  paintMenu() { if (!this.menuList) return; [...this.menuList.children].forEach((c, i) => c.classList.toggle('sel', i === this.menuIndex)); }
  activate() { const it = this.menuItems && this.menuItems[this.menuIndex]; if (it && !it.disabled) { audio.play('confirm', { vol: 0.5 }); it.action(); } else audio.play('error', { vol: 0.4 }); }
  menuInput() {
    if (!this.menuItems) return;
    const nav = input.anyNav();
    if (nav === 'up' || nav === 'down') {
      const n = this.menuItems.length;
      this.menuIndex = (this.menuIndex + (nav === 'down' ? 1 : n - 1)) % n;
      audio.play('move', { vol: 0.3 }); this.paintMenu();
    }
    if (nav === 'left' || nav === 'right') { const it = this.menuItems[this.menuIndex]; if (it && it.adjust) { it.adjust(nav === 'right' ? 1 : -1); audio.play('move', { vol: 0.3 }); } }
    if (input.anyPressed('confirm') || input.anyPressed('attack')) this.activate();
    if (input.anyPressed('back') && this.onBack) { audio.play('back', { vol: 0.4 }); this.onBack(); }
  }

  showTitle() {
    this.onBack = null;
    this.layer.hud.innerHTML = ''; this.layer.boss.innerHTML = '';
    audio.music('title');
    this.setScreen('title', () => {
      const w = h('div', 'title-screen');
      w.appendChild(h('div', 'title-logo', `<div class="t1">ASHEN&nbsp;OATH</div><div class="t2">${t('a couch co-op souls-roguelite of the Fifth Edition')}</div>`));
      w.appendChild(this.menu([
        { label: t('Begin the Oath'), action: () => this.showSelect() },
        { label: `${t('Vows')} <small>(${t('{0} sworn', this.game.vowsChosen.size)})</small>`, action: () => this.showVows() },
        { label: `${t('Reliquary')} <small>(${meta.data.marks} ✦)</small>`, action: () => this.showReliquary() },
        { label: t('How to Play'), action: () => this.showHelp() },
        { label: t('Options'), action: () => this.showOptions(() => this.showTitle()) },
        { label: t('Credits'), action: () => this.showCredits() },
      ], { cls: 'title-menu' }));
      w.appendChild(h('div', 'title-foot', `${t('Runs {0} · Victories {1} · Deepest {2} · Foes slain {3}', meta.data.runs, meta.data.wins, ['—', 'I', 'II', 'III'][meta.data.bestDepth] || 'III', meta.data.kills)}<br>${t('1–4 players · keyboard (2 players) + gamepads')}`));
      return w;
    });
  }

  showVows() {
    const items = VOWS.map((v) => ({
      get label() { return `<span class="chk">${this.on ? '☒' : '☐'}</span> ${t(v.name)} <small>${t(v.desc)} (+${v.marks}✦)</small>`; },
      on: this.game.vowsChosen.has(v.id),
      action: () => { if (this.game.vowsChosen.has(v.id)) this.game.vowsChosen.delete(v.id); else this.game.vowsChosen.add(v.id); this.showVows(); },
    }));
    items.forEach((it, i) => { it.on = this.game.vowsChosen.has(VOWS[i].id); });
    items.push({ label: t('Back'), action: () => this.showTitle() });
    const idx = this.menuIndex;
    this.setScreen('vows', () => this.menu(items, { title: t('Vows'), sub: t('Swear vows for a harder descent. Each grants more Oath Marks when you fall or win.') }));
    this.menuIndex = Math.min(idx, items.length - 1); this.paintMenu();
    this.onBack = () => this.showTitle();
  }

  showReliquary() {
    const items = UNLOCKS.map((u) => ({
      label: `${meta.has(u.id) ? '<span class="owned">✔</span>' : `<span class="cost">${u.cost}✦</span>`} ${t(u.name)} <small>${t(u.desc)}</small>`,
      disabled: meta.has(u.id) || meta.data.marks < u.cost,
      action: () => { if (meta.unlock(u.id, u.cost)) { audio.play('levelUp'); this.showReliquary(); } },
    }));
    items.push({ label: t('Back'), action: () => this.showTitle() });
    const idx = this.menuIndex;
    this.setScreen('reliquary', () => this.menu(items, { title: t('Reliquary'), sub: t('Spend Oath Marks earned across runs. You hold <b>{0}✦</b>.', meta.data.marks) }));
    this.menuIndex = Math.min(idx, items.length - 1); this.paintMenu();
    this.onBack = () => this.showTitle();
  }

  showOptions(back) {
    const opt = (label, get, adjust) => ({ get label() { return `${t(label)} <span class="val">◂ ${get()} ▸</span>`; }, action: () => { adjust(1); this.showOptions(back); }, adjust: (d) => { adjust(d); this.showOptions(back); } });
    const toggle = (k) => () => { psx[k] = !psx[k]; this.game.psx.applySettings(); this.saveSettings(); };
    const items = [
      opt('Language', () => LANGUAGES.find((l) => l.id === getLang()).name, (d) => { const i = LANGUAGES.findIndex((l) => l.id === getLang()); setLang(LANGUAGES[(i + d + LANGUAGES.length) % LANGUAGES.length].id); this.saveSettings(); this.game.onLanguageChange && this.game.onLanguageChange(); }),
      opt('Resolution', () => psx.height + 'p', (d) => { const r = [180, 240, 300, 360, 480]; psx.height = r[(r.indexOf(psx.height) + d + r.length) % r.length]; this.game.psx.applySettings(); this.saveSettings(); }),
      opt('Vertex wobble', () => t(psx.jitter ? 'on' : 'off'), toggle('jitter')),
      opt('Texture warp', () => t(psx.affine ? 'on' : 'off'), toggle('affine')),
      opt('Dithering', () => t(psx.dither ? 'on' : 'off'), toggle('dither')),
      opt('Ink outlines', () => t(psx.outline ? 'on' : 'off'), toggle('outline')),
      opt('Scanlines', () => t(psx.scanlines ? 'on' : 'off'), toggle('scanlines')),
      opt('Palette grade', () => Math.round(psx.grade * 100) + '%', (d) => { psx.grade = Math.max(0, Math.min(1.6, psx.grade + d * 0.2)); this.saveSettings(); }),
      opt('Music', () => Math.round(audioSettings.music * 100) + '%', (d) => { audioSettings.music = Math.max(0, Math.min(1, audioSettings.music + d * 0.1)); audio.refreshVolume(); this.saveSettings(); }),
      opt('Sound FX', () => Math.round(audioSettings.sfx * 100) + '%', (d) => { audioSettings.sfx = Math.max(0, Math.min(1, audioSettings.sfx + d * 0.1)); this.saveSettings(); }),
      opt('Announcer', () => t(audioSettings.announcer ? 'on' : 'off'), () => { audioSettings.announcer = !audioSettings.announcer; this.saveSettings(); }),
      opt('Dice log', () => t(this.game.showLog ? 'on' : 'off'), () => { this.game.showLog = !this.game.showLog; this.saveSettings(); }),
      { label: t('Back'), action: back },
    ];
    const idx = this.menuIndex;
    this.setScreen('options', () => this.menu(items, { title: t('Options'), sub: t('The PSX look is a filter: every option can be dialled back.') }));
    this.menuIndex = Math.min(idx, items.length - 1); this.paintMenu();
    this.onBack = back;
  }
  saveSettings() { meta.data.settings = { psx: { ...psx }, audio: { ...audioSettings }, showLog: this.game.showLog, lang: getLang() }; meta.save(); }

  showHelp() {
    this.setScreen('help', () => {
      const w = h('div', 'menu help');
      const g1 = input.controllers[0].glyph, g2 = input.controllers[1].glyph;
      const pad = { attack: 'X', heavy: 'RT', dodge: 'A', skill1: 'LB', skill2: 'RB', potion: 'Y', interact: 'B', move: 'L-Stick' };
      const row = (n, k) => `<tr><td>${t(n)}</td><td>${keycap(g1[k])}</td><td>${keycap(g2[k])}</td><td>${keycap(pad[k])}</td></tr>`;
      w.innerHTML = `<div class="menu-title">${t('How to Play')}</div>
      <table class="controls"><tr><th></th><th>${t('Keyboard 1')}</th><th>${t('Keyboard 2')}</th><th>${t('Gamepad')}</th></tr>
      ${row('Move', 'move')}${row('Attack', 'attack')}${row('Heavy attack', 'heavy')}${row('Dodge roll', 'dodge')}${row('Skill 1', 'skill1')}${row('Skill 2', 'skill2')}${row('Potion', 'potion')}${row('Interact / revive', 'interact')}</table>
      <div class="help-cols">
      <div><h3>${t('Souls-like')}</h3><p>${t('help.souls1')}</p>
      <p>${t('help.souls2')}</p></div>
      <div><h3>${t('Fifth Edition')}</h3><p>${t('help.dnd')}</p></div>
      <div><h3>${t('Roguelite')}</h3><p>${t('help.rogue')}</p></div>
      </div><div class="menu-sub">${t('Press back to return')}</div>`;
      return w;
    });
    this.menuItems = [{ label: 'back', action: () => this.showTitle() }];
    this.onBack = () => this.showTitle();
  }

  showCredits() {
    this.setScreen('credits', () => {
      const w = h('div', 'menu help');
      w.innerHTML = `<div class="menu-title">${t('Credits')}</div>
      <div class="credits">
      <p>${t('credits.game')}</p>
      <h3>${t('Libraries')}</h3><p>three.js (MIT) · rot.js (BSD-3) · howler.js (MIT) · Fontsource: IM Fell English & VT323 (OFL) · Noto Serif CJK SC/JP (OFL) · Electron (MIT) · esbuild (MIT)</p>
      <h3>${t('Art & audio (all CC0 unless noted)')}</h3>
      <p>KayKit Adventurers, Skeletons, Character Animations, Dungeon Remastered, Board Game Bits — Kay Lousberg<br>
      Ultimate Monsters — Quaternius<br>
      Particle Pack, Smoke Particles, Light Masks, Fantasy UI Borders, RPG Audio, Impact Sounds, Interface Sounds, Music Loops, Music Jingles, Fighter Voiceover — Kenney<br>
      Ninja Adventure music — Pixel-boy & AAA<br>
      Dungeon Crawl Stone Soup tiles (CC0 release)<br>
      game-icons.net — Lorc, Delapouite, Skoll, Sbed, Felbrigg, Zeromancer, Faithtoken, Carl Olsen and others (CC BY 3.0)<br>
      Curated via the series-ai/jam-ready-assets collection.</p>
      <p>${t('credits.srd')}</p></div>
      <div class="menu-sub">${t('Press back to return')}</div>`;
      return w;
    });
    this.menuItems = [{ label: 'back', action: () => this.showTitle() }];
    this.onBack = () => this.showTitle();
  }

  // ------------------------------------------------------------ character select
  showSelect() {
    audio.music('select');
    this.slots = [];
    this.onBack = null;
    this.setScreen('select', () => {
      const w = h('div', 'select');
      w.appendChild(h('div', 'menu-title', t('The Gathering')));
      w.appendChild(h('div', 'menu-sub', t('select.howto')));
      const row = h('div', 'select-row'); this.selectRow = row; w.appendChild(row);
      w.appendChild(h('div', 'select-foot', ''));
      return w;
    });
    this.selectFoot = $('.select-foot', this.layer.screen);
    this.paintSelect();
    this.selectTimer = 0;
  }
  classUnlocked(id) { const c = CLASSES[id]; return !c.unlock || meta.has(c.unlock); }
  paintSelect() {
    const row = this.selectRow; if (!row) return;
    row.innerHTML = '';
    for (let i = 0; i < 4; i++) {
      const s = this.slots[i];
      const card = h('div', 'pcard' + (s ? ' joined' : '') + (s && s.ready ? ' ready' : ''));
      card.style.setProperty('--pc', PLAYER_COLORS[i]);
      if (!s) { card.innerHTML = `<div class="pslot">P${i + 1}</div><div class="pjoin">${t('Press Attack to join')}</div>`; row.appendChild(card); continue; }
      const c = CLASSES[CLASS_ORDER[s.ci]];
      const locked = !this.classUnlocked(c.id);
      const ctrl = input.byId(s.controllerId);
      card.innerHTML = `<div class="pslot">P${i + 1} <small>${ctrlLabel(ctrl)}</small></div>
        <div class="pclass" style="color:${c.color}">◂ ${t(c.name)} ▸</div><div class="ptitle">${t(c.title)}</div>
        ${locked ? `<div class="plock">${t('LOCKED — unlock in the Reliquary')}</div>` : ''}
        <div class="pstats">HP ${c.hitDie + Math.floor((c.abilities.con - 10) / 2) + 8} · AC ${c.armor.base + Math.min(Math.floor((c.abilities.dex - 10) / 2), c.armor.dexCap) + c.armor.shield + (c.armor.conToAc ? Math.floor((c.abilities.con - 10) / 2) : 0)} · d${c.hitDie}</div>
        <div class="pabil">${['str', 'dex', 'con', 'int', 'wis', 'cha'].map((k) => `<span><b>${t(k.toUpperCase())}</b>${c.abilities[k]}</span>`).join('')}</div>
        <div class="pblurb">${t(c.blurb)}</div>
        <div class="pskills">${c.skills.map((sk) => `<div>${icon(sk.icon, c.color)}<b>${t(sk.name)}</b><br><small>${t(sk.desc)}</small></div>`).join('')}</div>
        <div class="pskin">${t('Colours')}: ${s.skin ? t('Variant {0}', s.skin.replace('alt_', '')) : t('Classic')} ${meta.has('skins') ? '▴▾' : `<small>(${t('unlock: Ashen Wardrobe')})</small>`}</div>
        <div class="pready">${s.ready ? t('READY') : t('Press Attack when ready')}</div>`;
      row.appendChild(card);
    }
    const n = this.slots.filter(Boolean).length, r = this.slots.filter((s) => s && s.ready).length;
    if (this.selectFoot) this.selectFoot.innerHTML = n === 0 ? t('Waiting for heroes…') : r === n ? t('The oath is sworn…') : t('{0}/{1} ready · Back with no one joined returns to title', r, n);
  }
  selectInput(dt) {
    const free = () => { for (let i = 0; i < 4; i++) if (!this.slots[i]) return i; return -1; };
    for (const c of input.controllers) {
      if (!c.connected) continue;
      const idx = this.slots.findIndex((s) => s && s.controllerId === c.id);
      if (idx < 0) {
        if (c.pressed('attack') || c.pressed('confirm')) {
          const f = free(); if (f < 0) continue;
          const used = new Set(this.slots.filter(Boolean).map((s) => CLASS_ORDER[s.ci]));
          let ci = CLASS_ORDER.findIndex((id) => !used.has(id) && this.classUnlocked(id)); if (ci < 0) ci = 0;
          this.slots[f] = { controllerId: c.id, ci, skin: '', ready: false };
          c.consume('attack'); c.consume('confirm');
          audio.play('confirm', { vol: 0.6 }); this.paintSelect();
        }
        if (c.pressed('back') && !this.slots.some(Boolean)) { this.showTitle(); return; }
        continue;
      }
      const s = this.slots[idx];
      if (!s.ready) {
        if (c.nav === 'left' || c.nav === 'right') { s.ci = (s.ci + (c.nav === 'right' ? 1 : CLASS_ORDER.length - 1)) % CLASS_ORDER.length; audio.play('move', { vol: 0.3 }); this.paintSelect(); }
        if ((c.nav === 'up' || c.nav === 'down') && meta.has('skins')) { const k = SKINS.indexOf(s.skin); s.skin = SKINS[(k + (c.nav === 'down' ? 1 : SKINS.length - 1)) % SKINS.length]; audio.play('move', { vol: 0.3 }); this.paintSelect(); }
        if (c.pressed('attack') || c.pressed('confirm')) {
          if (!this.classUnlocked(CLASS_ORDER[s.ci])) { audio.play('error'); continue; }
          s.ready = true; audio.play('select', { vol: 0.6 }); this.paintSelect();
        }
        if (c.pressed('back')) { this.slots[idx] = null; audio.play('back', { vol: 0.4 }); this.paintSelect(); }
      } else if (c.pressed('back')) { s.ready = false; audio.play('back', { vol: 0.4 }); this.paintSelect(); }
    }
    const joined = this.slots.filter(Boolean);
    if (joined.length && joined.every((s) => s.ready)) {
      this.selectTimer += dt;
      if (this.selectTimer > 0.8) {
        const players = joined.map((s) => ({ controllerId: s.controllerId, classId: CLASS_ORDER[s.ci], skin: s.skin }));
        this.setScreen(null);
        this.slots = [];
        this.game.beginRun(players);
      }
    } else this.selectTimer = 0;
  }

  // ------------------------------------------------------------ HUD
  buildHud() {
    const hud = this.layer.hud; hud.innerHTML = '';
    this.hudEls = [];
    const top = h('div', 'hud-top'); hud.appendChild(top); this.hudTop = top;
    this.game.heroes.forEach((hero, i) => {
      const p = h('div', `hud-p hud-p${i}`);
      p.style.setProperty('--pc', hero.color);
      p.innerHTML = `
        <div class="hp-head"><span class="hp-name">P${i + 1} ${t(hero.cls.name)}</span><span class="hp-lv"></span></div>
        <div class="bar hpbar"><div class="fill"></div><div class="temp"></div><span></span></div>
        <div class="bar stbar"><div class="fill"></div></div>
        <div class="hp-row">
          <div class="sk sk0">${icon(hero.cls.skills[0].icon, hero.cls.color)}<div class="cd"></div><span class="kc">${hero.ctrl.glyph.skill1}</span></div>
          <div class="sk sk1">${icon(hero.cls.skills[1].icon, hero.cls.color)}<div class="cd"></div><span class="kc">${hero.ctrl.glyph.skill2}</span></div>
          <div class="pot">${icon('health-potion', '#ff6a6a')}<span></span></div>
          <div class="slots"></div>
          <div class="ac"></div>
        </div>
        <div class="hp-boons"></div><div class="hp-conds"></div><div class="hp-prompt"></div>`;
      hud.appendChild(p);
      this.hudEls.push({ hero, el: p, hp: $('.hpbar .fill', p), temp: $('.hpbar .temp', p), hpt: $('.hpbar span', p), st: $('.stbar .fill', p), cd: [$('.sk0 .cd', p), $('.sk1 .cd', p)], pot: $('.pot span', p), slots: $('.slots', p), ac: $('.ac', p), lv: $('.hp-lv', p), boons: $('.hp-boons', p), conds: $('.hp-conds', p), prompt: $('.hp-prompt', p) });
    });
    this.refreshHud();
  }
  refreshHud() {
    const g = this.game; if (!g.run) return;
    for (const e of this.hudEls) {
      const hero = e.hero;
      e.lv.textContent = t('Lv {0}', hero.level);
      e.ac.innerHTML = t('AC {0}', hero.ac);
      e.boons.innerHTML = hero.boons.slice(-10).map((b) => `<img class="px boon-ic" title="${t(b.name)}" style="border-color:${RARITY[b.rarity].color}" src="${url(b.icon)}">`).join('') +
        [...hero.pacts].map((p) => `<span class="pact" style="color:${PACTS[p].color}">${t(PACTS[p].name)}${hero.bonds && hero.bonds.has(p) ? '⚭' : ''}</span>`).join('');
    }
    if (this.hudTop) {
      const r = g.run;
      this.hudTop.innerHTML = `<span class="ember">${'<b>✹</b>'.repeat(Math.max(0, r.embers))}</span><span class="room">${this.roomName || ''} <small>${this.roomSub || ''}</small></span>${g.heroes.length === 1 ? `<span class="second" title="${t('Second Chance')}">${r.secondChance > 0 ? '♥ ' + t('Second Chance') : '♡'}</span>` : ''}<span class="ash">${icon('campfire', '#ff9a40')} <b class="ashv">${r.ash}</b> ${t('Ash')}</span>`;
      this.ashEl = $('.ashv', this.hudTop);
    }
  }
  updateHud(dt) {
    const g = this.game;
    for (const e of this.hudEls) {
      const hero = e.hero;
      e.hp.style.width = (100 * Math.max(0, hero.hp) / hero.maxHp) + '%';
      e.temp.style.width = (100 * Math.min(1, hero.tempHp / hero.maxHp)) + '%';
      e.hpt.textContent = hero.dead ? t('DEAD') : hero.downed ? `${t('DOWNED')} ${hero.deathSaves.s}✓ ${hero.deathSaves.f}✗` : `${Math.max(0, hero.hp)}/${hero.maxHp}${hero.tempHp ? ' +' + hero.tempHp : ''}`;
      e.st.style.width = Math.max(0, hero.stamina) + '%';
      e.st.parentElement.classList.toggle('ex', hero.exhausted);
      for (let i = 0; i < 2; i++) {
        const sk = hero.cls.skills[i];
        const cd = hero.cooldowns[i] / (sk.cd * hero.cooldownMul);
        e.cd[i].style.height = (cd * 100) + '%';
        e.cd[i].parentElement.classList.toggle('noslot', !!sk.slot && hero.slots <= 0);
      }
      e.pot.textContent = hero.potions;
      e.slots.innerHTML = hero.slotsMax ? '◆'.repeat(Math.max(0, hero.slots)) + '<i>' + '◇'.repeat(Math.max(0, hero.slotsMax - hero.slots)) + '</i>' : '';
      const conds = Object.keys(hero.cond).filter((c) => !['alert'].includes(c) || true);
      e.conds.textContent = conds.map((c) => t(COND[c] || c.toUpperCase())).join(' · ') + (hero.exhausted ? ' · ' + t('EXHAUSTED') : '');
      e.el.classList.toggle('down', hero.downed || hero.dead);
    }
    if (this.ashEl && g.run) this.ashEl.textContent = g.run.ash;
  }
  prompts(list) {
    for (const e of this.hudEls) {
      const p = list.find((x) => x.hero === e.hero);
      e.prompt.innerHTML = p ? `${keycap(e.hero.ctrl.glyph.interact)} ${t(p.text)}` : '';
    }
  }

  bossIntro(def) {
    const b = this.layer.banner;
    b.innerHTML = `<div class="boss-intro"><img class="px" src="${url(def.portrait)}"><div><div class="banner-sup">${t(def.title)}</div><div class="banner-text">${t(def.name)}</div></div></div>`;
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
    clearTimeout(this.bannerTimer); this.bannerTimer = setTimeout(() => b.classList.remove('show'), 3000);
  }
  bossBar(boss) {
    const el = this.layer.boss;
    if (!boss) { el.innerHTML = ''; this.bossEl = null; return; }
    if (!this.bossEl) {
      el.innerHTML = `<div class="bossbar"><div class="bname">${t(boss.def.name)} <small>${t(boss.def.title)}</small></div><div class="bbar"><div class="fill"></div><div class="poise"></div></div><div class="binfo"></div></div>`;
      this.bossEl = { fill: $('.fill', el), poise: $('.poise', el), info: $('.binfo', el) };
    }
    this.bossEl.fill.style.width = (100 * Math.max(0, boss.hp) / boss.maxHp) + '%';
    this.bossEl.poise.style.width = (100 * Math.min(1, boss.poise / boss.poiseMax)) + '%';
    this.bossEl.info.textContent = `${t('AC {0}', boss.ac)} · CR ${boss.def.cr} · ${t('Phase {0}', boss.phase)}${boss.has('stagger') ? ' · ' + t('STAGGERED') : ''}`;
  }
  bossPhase() { }

  // ------------------------------------------------------------ per-player panels
  panelFor(hero) { return this.panels.get(hero); }
  anyPanelOpen() { return this.panels.size > 0; }
  closeAllPanels() { for (const p of this.panels.values()) p.el.remove(); this.panels.clear(); this.queue = new Map(); }
  openPanel(hero, spec) {
    // queue if one is already open for this hero
    if (this.panels.has(hero)) { if (!this.queue) this.queue = new Map(); const q = this.queue.get(hero) || []; q.push(spec); this.queue.set(hero, q); return; }
    const el = h('div', 'ppanel');
    el.style.setProperty('--pc', hero.color);
    el.style.order = hero.slot;
    this.layer.panels.appendChild(el);
    const panel = { hero, el, spec, index: 0 };
    this.panels.set(hero, panel);
    this.paintPanel(panel);
    audio.play('open', { vol: 0.4 });
  }
  closePanel(hero) {
    const p = this.panels.get(hero); if (!p) return;
    p.el.remove(); this.panels.delete(hero);
    const q = this.queue && this.queue.get(hero);
    if (q && q.length) { const next = q.shift(); this.openPanel(hero, next); }
    const c = hero.ctrl; if (c) for (const k of ['attack', 'confirm', 'interact', 'back', 'pause', 'dodge']) c.consume(k);
  }
  paintPanel(p) {
    const s = p.spec, hero = p.hero;
    const opts = s.options();
    p.count = opts.length;
    p.index = Math.min(p.index, opts.length - 1);
    const g = hero.ctrl.glyph;
    p.el.innerHTML = `<div class="pp-head">P${hero.slot + 1} ${t(hero.cls.name)} <small>${t('Lv {0}', hero.level)}</small></div><div class="pp-title">${s.title}</div>${s.sub ? `<div class="pp-sub">${s.sub()}</div>` : ''}
      <div class="pp-opts ${s.cards ? 'cards' : ''}">${opts.map((o, i) => `<div class="pp-opt ${i === p.index ? 'sel' : ''} ${o.disabled ? 'disabled' : ''}" style="${o.color ? '--rc:' + o.color : ''}">${o.html}</div>`).join('')}</div>
      <div class="pp-keys">${keycap(g.move)} ${t('choose')} · ${keycap(g.attack)} ${t('confirm')} ${s.extraKey ? '· ' + s.extraKey(g) : ''} ${s.canClose !== false ? '· ' + keycap(g.back || 'ESC') + ' ' + t('close') : ''}</div>`;
  }
  panelInput() {
    for (const p of [...this.panels.values()]) {
      const c = p.hero.ctrl; if (!c) continue;
      const vertical = !p.spec.cards;
      const prevKey = vertical ? 'up' : 'left', nextKey = vertical ? 'down' : 'right';
      if (c.nav === prevKey || c.nav === nextKey) { p.index = (p.index + (c.nav === nextKey ? 1 : p.count - 1)) % p.count; audio.play('move', { vol: 0.25 }); this.paintPanel(p); }
      if (c.pressed('attack') || c.pressed('confirm')) {
        const o = p.spec.options()[p.index];
        if (o && !o.disabled) { const keep = o.action(); if (keep) this.paintPanel(p); else this.closePanel(p.hero); }
        else audio.play('error', { vol: 0.3 });
      } else if (p.spec.extra && c.pressed('skill2')) { p.spec.extra(); this.paintPanel(p); }
      else if ((c.pressed('back') || c.pressed('dodge')) && p.spec.canClose !== false) { audio.play('back', { vol: 0.3 }); this.closePanel(p.hero); }
    }
  }

  boonCard(b, hero) {
    const r = RARITY[b.rarity], pact = PACTS[b.pact];
    const have = hero.boons.filter((x) => x.pact === b.pact).length;
    return `<div class="bc-top"><img class="px bc-ic" src="${url(b.icon)}"><div><div class="bc-name">${t(b.name)}</div><div class="bc-rar" style="color:${r.color}">${t(r.name)}</div></div></div>
      <div class="bc-desc">${t(b.desc)}</div><div class="bc-pact" style="color:${pact.color}">${t('{0} pact', t(pact.name))} ${have ? `(${have}/3)` : ''}</div>`;
  }

  openDraft(hero, boons, then = null) {
    let current = boons;
    this.openPanel(hero, {
      title: t('Choose a Boon'), cards: true, canClose: false,
      sub: () => `${t('Pacts')}: ${Object.entries(PACTS).map(([k, p]) => { const n = hero.boons.filter((b) => b.pact === k).length; return n ? `<span style="color:${p.color}">${t(p.name)} ${n}</span>` : ''; }).join(' ') || '—'}`,
      options: () => current.map((b) => ({ html: this.boonCard(b, hero), color: RARITY[b.rarity].color, action: () => { this.game.grantBoon(hero, b); if (then) then(); return false; } })),
      extraKey: (g) => hero.rerolls > 0 ? `${keycap(g.skill2)} ${t('reroll')} (${hero.rerolls})` : '',
      extra: () => { if (hero.rerolls > 0) { hero.rerolls--; current = draftBoons(hero, { depth: this.game.run.depthIndex }); audio.play('book', { vol: 0.6 }); } },
    });
  }

  openShrine(hero) {
    const g = this.game;
    this.openPanel(hero, {
      title: t('Ember Shrine'),
      sub: () => `${t('Party Ash')}: <b>${g.run.ash}</b> · ${t('HP')} ${hero.hp}/${hero.maxHp}`,
      options: () => {
        const cost = LEVEL_COST[hero.level];
        const next = hero.cls.features[hero.level + 1];
        const o = [{ html: hero.level >= MAX_LEVEL ? t('Level MAX') : `${t('Level up to {0}', hero.level + 1)} — <b>${cost}</b> ${t('Ash')}<br><small>+${t('HP')}${next ? ', ' + t(next) : ''}${(hero.level + 1) % 4 === 0 ? ', ' + t('+ a feat draft') : ''}</small>`, disabled: hero.level >= MAX_LEVEL || g.run.ash < cost, action: () => { g.levelUp(hero); return true; } }];
        o.push({ html: `${t('Kindle an Ember')} — <b>${900 + 300 * g.run.depthIndex}</b> ${t('Ash')}<br><small>${t('+1 party life')}</small>`, disabled: g.run.ash < 900 + 300 * g.run.depthIndex, action: () => { g.run.ash -= 900 + 300 * g.run.depthIndex; g.run.embers++; audio.play('shrine'); this.refreshHud(); return true; } });
        o.push({ html: t('Leave'), action: () => false });
        return o;
      },
    });
  }

  openShop(hero) {
    const g = this.game;
    if (!g.shopStock) g.shopStock = new Set();
    this.openPanel(hero, {
      title: t('Ossa the Ash-Merchant'),
      sub: () => `${t('Party Ash')}: <b>${g.run.ash}</b>`,
      options: () => SHOP_ITEMS.map((it) => {
        const cost = Math.round(it.cost * (1 + g.run.depthIndex * 0.25));
        return { html: `<img class="px shop-ic" src="${url(it.icon)}"> <b>${t(it.name)}</b> — ${cost} ${t('Ash')}<br><small>${t(it.desc)}</small>`, disabled: g.run.ash < cost, action: () => { g.run.ash -= cost; this.buy(it.id, hero); audio.play('coins', { vol: 0.8 }); this.refreshHud(); return it.id !== 'boon'; } };
      }).concat([{ html: t('Leave'), action: () => false }]),
    });
  }
  buy(id, hero) {
    const g = this.game;
    if (id === 'potion') for (const x of g.heroes) x.potions = Math.min(x.potionsMax, x.potions + 1);
    if (id === 'greater') for (const x of g.heroes) { x.boons.push({ id: 'flask_' + Math.random(), name: "Alchemist's Draught", rarity: 'common', pact: 'dawn', icon: 'assets/sprites/crawl/item_potion_i-might.png', desc: '+1 potion', mods: { potions: 1 } }); x.recompute(); x.potions++; }
    if (id === 'ember') g.run.embers++;
    if (id === 'reroll') for (const x of g.heroes) x.rerolls++;
    if (id === 'boon') setTimeout(() => this.openDraft(hero, draftBoons(hero, { depth: g.run.depthIndex, minRarity: 'uncommon' })), 50);
    if (id === 'scroll') for (const x of g.heroes) { x.slots = x.slotsMax; x.heal(Math.ceil(x.maxHp / 2)); }
    g.log(t('{0} buys {1}.', hero.label, t(SHOP_ITEMS.find((i) => i.id === id).name)), hero.color);
  }

  openAltar(hero) {
    const g = this.game;
    if (g.altarRolled.has(hero)) { this.toast(t('{0} has already tempted fate here.', hero.label)); return; }
    this.openPanel(hero, {
      title: t("The Dicer's Altar"),
      sub: () => t('altar.rules'),
      options: () => [
        { html: `${icon('dice-twenty-faces-twenty', '#ff7ad0')} ${t('Roll the bones')}`, action: () => { g.altarRolled.add(hero); this.altarRoll(hero); return false; } },
        { html: t('Walk away'), action: () => false },
      ],
    });
  }
  altarRoll(hero) {
    const g = this.game, r = d20().roll;
    g.fx.die({ x: hero.pos.x, y: 4, z: hero.pos.z, value: r, color: hero.diceColor, good: r >= 10 });
    audio.play('dice', { vol: 0.8 });
    setTimeout(() => {
      if (r === 1) {
        hero.boons.push({ id: 'curse_' + Math.random(), name: 'Hexed', rarity: 'common', pact: 'grave', icon: 'assets/sprites/crawl/item_amulet_i-rage.png', desc: '-1 AC, -1 to hit', mods: { ac: -1, toHit: -1 } }); hero.recompute();
        g.ui.banner(t('Cursed'), t('{0} is Hexed (-1 AC, -1 to hit)', hero.label), 2); audio.play('error');
      } else if (r < 10) { const a = 40 * r + 60 * g.run.depthIndex; g.run.ash += a; g.ui.banner(t('Fortune'), `+${a} ${t('Ash')}`, 1.6); audio.play('coins'); }
      else if (r < 18) this.openDraft(hero, draftBoons(hero, { depth: g.run.depthIndex }));
      else if (r < 20) this.openDraft(hero, draftBoons(hero, { depth: g.run.depthIndex, minRarity: 'rare' }));
      else { this.openDraft(hero, draftBoons(hero, { minRarity: 'legendary' })); g.ui.banner(t('NATURAL 20'), t('The dice adore you'), 2); }
      this.refreshHud();
    }, 900);
  }

  // ------------------------------------------------------------ pause & end
  showPause() {
    this.onBack = () => this.game.resume();
    this.setScreen('pause', () => this.menu([
      { label: t('Resume'), action: () => this.game.resume() },
      { label: t('Options'), action: () => this.showOptions(() => this.showPause()) },
      { label: t('Abandon run'), action: () => { this.game.paused = false; this.game.abandon(); } },
    ], { title: t('Paused'), sub: this.game.run ? `${t('Seed {0}', this.game.run.seed)} · ${t(this.game.run.depth.name)} · ${t('Room {0}', this.game.run.roomIndex)}` : '' }));
  }

  showEnd(won, marks) {
    const g = this.game, r = g.run;
    this.closeAllPanels();
    this.layer.boss.innerHTML = ''; this.bossEl = null;
    const mins = Math.floor((Date.now() - r.startTime) / 60000);
    this.setScreen('end', () => {
      const w = h('div', 'menu end');
      w.innerHTML = `<div class="menu-title ${won ? 'won' : 'lost'}">${won ? t('The Oath is Fulfilled') : t('The Oath is Broken')}</div>
        <div class="menu-sub">${won ? t('Cindermaw lies cold. The Abyss sleeps.') : t('Fell in {0}, room {1}.', t(r.depth.name), r.roomIndex)} · ${t('{0} min · {1} rooms · {2} bosses · seed {3}', mins, r.roomsCleared, r.bossesSlain, r.seed)}</div>
        <div class="end-heroes">${g.heroes.map((x) => `<div class="eh" style="--pc:${x.color}"><b>P${x.slot + 1} ${t(x.cls.name)}</b> ${t('Lv {0}', x.level)}<br>${t('Damage')} ${x.stats.dealt} · ${t('Kills')} ${x.stats.kills}<br>${t('Crits')} ${x.stats.crits} · ${t('Nat 20s')} ${x.stats.nat20}<br>${t('Revives')} ${x.stats.revives} · ${t('Downs')} ${x.stats.downs}<div class="eb">${x.boons.map((b) => `<img class="px" title="${t(b.name)}" src="${url(b.icon)}">`).join('')}</div></div>`).join('')}</div>
        <div class="marks">+${marks} ${t('Oath Marks')} ✦ <small>(${t('total {0}', meta.data.marks)})</small></div>`;
      w.appendChild(this.menu([{ label: t('Return to the Shrine'), action: () => this.game.toTitle() }]));
      return w;
    });
    this.onBack = null;
  }

  update(dt) {
    if (this.screen === 'select') this.selectInput(dt);
    else if (this.screen) this.menuInput();
    if (this.game.mode === 'play' && !this.game.paused) this.panelInput();
  }
}
