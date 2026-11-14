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
  banner(sup, text, t = 2) {
    const b = this.layer.banner;
    b.innerHTML = `<div class="banner-in">${sup ? `<div class="banner-sup">${sup}</div>` : ''}<div class="banner-text">${text}</div></div>`;
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
    clearTimeout(this.bannerTimer); this.bannerTimer = setTimeout(() => b.classList.remove('show'), t * 1000);
  }
  roomTitle(name, sub) { this.roomName = name; this.roomSub = sub; }
  toast(msg) { this.layer.toast.textContent = msg; this.layer.toast.classList.add('show'); clearTimeout(this.toastTimer); this.toastTimer = setTimeout(() => this.layer.toast.classList.remove('show'), 1800); }
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
      w.appendChild(h('div', 'title-logo', `<div class="t1">ASHEN&nbsp;OATH</div><div class="t2">a couch co-op souls-roguelite of the Fifth Edition</div>`));
      w.appendChild(this.menu([
        { label: 'Begin the Oath', action: () => this.showSelect() },
        { label: `Vows <small>(${this.game.vowsChosen.size} sworn)</small>`, action: () => this.showVows() },
        { label: `Reliquary <small>(${meta.data.marks} ✦)</small>`, action: () => this.showReliquary() },
        { label: 'How to Play', action: () => this.showHelp() },
        { label: 'Options', action: () => this.showOptions(() => this.showTitle()) },
        { label: 'Credits', action: () => this.showCredits() },
      ], { cls: 'title-menu' }));
      w.appendChild(h('div', 'title-foot', `Runs ${meta.data.runs} · Victories ${meta.data.wins} · Deepest ${['—', 'I', 'II', 'III'][meta.data.bestDepth] || 'III'} · Foes slain ${meta.data.kills}<br>1–4 players · keyboard (2 players) + gamepads`));
      return w;
    });
  }

  showVows() {
    const items = VOWS.map((v) => ({
      get label() { return `<span class="chk">${this.on ? '☒' : '☐'}</span> ${v.name} <small>${v.desc} (+${v.marks}✦)</small>`; },
      on: this.game.vowsChosen.has(v.id),
      action: () => { if (this.game.vowsChosen.has(v.id)) this.game.vowsChosen.delete(v.id); else this.game.vowsChosen.add(v.id); this.showVows(); },
    }));
    items.forEach((it, i) => { it.on = this.game.vowsChosen.has(VOWS[i].id); });
    items.push({ label: 'Back', action: () => this.showTitle() });
    const idx = this.menuIndex;
    this.setScreen('vows', () => this.menu(items, { title: 'Vows', sub: 'Swear vows for a harder descent. Each grants more Oath Marks when you fall or win.' }));
    this.menuIndex = Math.min(idx, items.length - 1); this.paintMenu();
    this.onBack = () => this.showTitle();
  }

  showReliquary() {
    const items = UNLOCKS.map((u) => ({
      label: `${meta.has(u.id) ? '<span class="owned">✔</span>' : `<span class="cost">${u.cost}✦</span>`} ${u.name} <small>${u.desc}</small>`,
      disabled: meta.has(u.id) || meta.data.marks < u.cost,
      action: () => { if (meta.unlock(u.id, u.cost)) { audio.play('levelUp'); this.showReliquary(); } },
    }));
    items.push({ label: 'Back', action: () => this.showTitle() });
    const idx = this.menuIndex;
    this.setScreen('reliquary', () => this.menu(items, { title: 'Reliquary', sub: `Spend Oath Marks earned across runs. You hold <b>${meta.data.marks}✦</b>.` }));
    this.menuIndex = Math.min(idx, items.length - 1); this.paintMenu();
    this.onBack = () => this.showTitle();
  }

  showOptions(back) {
    const opt = (label, get, adjust) => ({ get label() { return `${label} <span class="val">◂ ${get()} ▸</span>`; }, action: () => { adjust(1); this.showOptions(back); }, adjust: (d) => { adjust(d); this.showOptions(back); } });
    const toggle = (k) => () => { psx[k] = !psx[k]; this.game.psx.applySettings(); this.saveSettings(); };
    const items = [
      opt('Resolution', () => psx.height + 'p', (d) => { const r = [180, 240, 300, 360, 480]; psx.height = r[(r.indexOf(psx.height) + d + r.length) % r.length]; this.game.psx.applySettings(); this.saveSettings(); }),
      opt('Vertex wobble', () => (psx.jitter ? 'on' : 'off'), toggle('jitter')),
      opt('Texture warp', () => (psx.affine ? 'on' : 'off'), toggle('affine')),
      opt('Dithering', () => (psx.dither ? 'on' : 'off'), toggle('dither')),
      opt('Ink outlines', () => (psx.outline ? 'on' : 'off'), toggle('outline')),
      opt('Scanlines', () => (psx.scanlines ? 'on' : 'off'), toggle('scanlines')),
      opt('Palette grade', () => Math.round(psx.grade * 100) + '%', (d) => { psx.grade = Math.max(0, Math.min(1.6, psx.grade + d * 0.2)); this.saveSettings(); }),
      opt('Music', () => Math.round(audioSettings.music * 100) + '%', (d) => { audioSettings.music = Math.max(0, Math.min(1, audioSettings.music + d * 0.1)); audio.refreshVolume(); this.saveSettings(); }),
      opt('Sound FX', () => Math.round(audioSettings.sfx * 100) + '%', (d) => { audioSettings.sfx = Math.max(0, Math.min(1, audioSettings.sfx + d * 0.1)); this.saveSettings(); }),
      opt('Announcer', () => (audioSettings.announcer ? 'on' : 'off'), () => { audioSettings.announcer = !audioSettings.announcer; this.saveSettings(); }),
      opt('Dice log', () => (this.game.showLog ? 'on' : 'off'), () => { this.game.showLog = !this.game.showLog; this.saveSettings(); }),
      { label: 'Back', action: back },
    ];
    const idx = this.menuIndex;
    this.setScreen('options', () => this.menu(items, { title: 'Options', sub: 'The PSX look is a filter: every option can be dialled back.' }));
    this.menuIndex = Math.min(idx, items.length - 1); this.paintMenu();
    this.onBack = back;
  }
  saveSettings() { meta.data.settings = { psx: { ...psx }, audio: { ...audioSettings }, showLog: this.game.showLog }; meta.save(); }

  showHelp() {
    this.setScreen('help', () => {
      const w = h('div', 'menu help');
      const g1 = input.controllers[0].glyph, g2 = input.controllers[1].glyph;
      const pad = { attack: 'X', heavy: 'RT', dodge: 'A', skill1: 'LB', skill2: 'RB', potion: 'Y', interact: 'B', move: 'L-Stick' };
      const row = (n, k) => `<tr><td>${n}</td><td>${keycap(g1[k])}</td><td>${keycap(g2[k])}</td><td>${keycap(pad[k])}</td></tr>`;
      w.innerHTML = `<div class="menu-title">How to Play</div>
      <table class="controls"><tr><th></th><th>Keyboard 1</th><th>Keyboard 2</th><th>Gamepad</th></tr>
      ${row('Move', 'move')}${row('Attack', 'attack')}${row('Heavy attack', 'heavy')}${row('Dodge roll', 'dodge')}${row('Skill 1', 'skill1')}${row('Skill 2', 'skill2')}${row('Potion', 'potion')}${row('Interact / revive', 'interact')}</table>
      <div class="help-cols">
      <div><h3>Souls-like</h3><p>Every swing and roll costs <b>stamina</b>. Dodging grants brief invulnerability. Foes <b>telegraph</b> attacks with red ground markings — roll through them. Heavy hits build <b>poise</b> damage; staggered foes take advantage and crit on 18+.</p>
      <p>Fall to 0 HP and you're <b>downed</b>: make death saves while an ally holds Interact to revive you. If the whole party falls, an <b>Ember</b> is spent and you rekindle at the last shrine — but your <b>Ash</b> stays where you died.</p></div>
      <div><h3>Fifth Edition</h3><p>Every attack is a real <b>d20 + bonus vs AC</b>. Natural 20s crit, natural 1s fumble. Advantage from flanking (an ally on the far side), backstabs, staggers, Hunter's Mark. Area spells call for <b>saving throws</b>. Damage types, resistances and vulnerabilities matter: skeletons shatter to bludgeoning, shades shrug off steel.</p></div>
      <div><h3>Roguelite</h3><p>Choose your path through branching doors: battles, elites, vaults, peddlers, the Dicer's Altar. Draft <b>boons</b> — feats, magic items, spell-pacts — after each fight. Three boons of one pact = <b>Attunement</b>. Two players with two each = a <b>Pact Bond</b> both enjoy. Spend Ash at <b>Ember Shrines</b> to level up (1–10). Earn Oath Marks for permanent unlocks, swear Vows for a harder climb.</p></div>
      </div><div class="menu-sub">Press back to return</div>`;
      return w;
    });
    this.menuItems = [{ label: 'back', action: () => this.showTitle() }];
    this.onBack = () => this.showTitle();
  }

  showCredits() {
    this.setScreen('credits', () => {
      const w = h('div', 'menu help');
      w.innerHTML = `<div class="menu-title">Credits</div>
      <div class="credits">
      <p><b>Ashen Oath</b> — game design, code, shaders and the "Ashcore" PSX filter written for this project.</p>
      <h3>Libraries</h3><p>three.js (MIT) · rot.js (BSD-3) · howler.js (MIT) · Fontsource: IM Fell English & VT323 (OFL) · esbuild (MIT)</p>
      <h3>Art & audio (all CC0 unless noted)</h3>
      <p>KayKit Adventurers, Skeletons, Character Animations, Dungeon Remastered, Board Game Bits — Kay Lousberg<br>
      Ultimate Monsters — Quaternius<br>
      Particle Pack, Smoke Particles, Light Masks, Fantasy UI Borders, RPG Audio, Impact Sounds, Interface Sounds, Music Loops, Music Jingles, Fighter Voiceover — Kenney<br>
      Ninja Adventure music — Pixel-boy & AAA<br>
      Dungeon Crawl Stone Soup tiles (CC0 release)<br>
      game-icons.net — Lorc, Delapouite, Skoll, Sbed, Felbrigg, Zeromancer, Faithtoken, Carl Olsen and others (CC BY 3.0)<br>
      Curated via the series-ai/jam-ready-assets collection.</p>
      <p>Dungeons & Dragons 5e mechanics are referenced under the SRD 5.1 (CC BY 4.0). Not affiliated with Wizards of the Coast.</p></div>
      <div class="menu-sub">Press back to return</div>`;
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
      w.appendChild(h('div', 'menu-title', 'The Gathering'));
      w.appendChild(h('div', 'menu-sub', 'Each player presses <b>Attack</b> on their keyboard half or gamepad to join. ◂ ▸ class · ▴ ▾ colours · Attack to ready · Back to leave'));
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
      if (!s) { card.innerHTML = `<div class="pslot">P${i + 1}</div><div class="pjoin">Press Attack to join</div>`; row.appendChild(card); continue; }
      const c = CLASSES[CLASS_ORDER[s.ci]];
      const locked = !this.classUnlocked(c.id);
      const ctrl = input.byId(s.controllerId);
      card.innerHTML = `<div class="pslot">P${i + 1} <small>${ctrl ? ctrl.label : ''}</small></div>
        <div class="pclass" style="color:${c.color}">◂ ${c.name} ▸</div><div class="ptitle">${c.title}</div>
        ${locked ? `<div class="plock">LOCKED — unlock in the Reliquary</div>` : ''}
        <div class="pstats">HP ${c.hitDie + Math.floor((c.abilities.con - 10) / 2) + 8} · AC ${c.armor.base + Math.min(Math.floor((c.abilities.dex - 10) / 2), c.armor.dexCap) + c.armor.shield + (c.armor.conToAc ? Math.floor((c.abilities.con - 10) / 2) : 0)} · d${c.hitDie}</div>
        <div class="pabil">${['str', 'dex', 'con', 'int', 'wis', 'cha'].map((k) => `<span><b>${k.toUpperCase()}</b>${c.abilities[k]}</span>`).join('')}</div>
        <div class="pblurb">${c.blurb}</div>
        <div class="pskills">${c.skills.map((sk) => `<div>${icon(sk.icon, c.color)}<b>${sk.name}</b><br><small>${sk.desc}</small></div>`).join('')}</div>
        <div class="pskin">Colours: ${s.skin ? s.skin.replace('alt_', 'Variant ') : 'Classic'} ${meta.has('skins') ? '▴▾' : '<small>(unlock: Ashen Wardrobe)</small>'}</div>
        <div class="pready">${s.ready ? 'READY' : 'Press Attack when ready'}</div>`;
      row.appendChild(card);
    }
    const n = this.slots.filter(Boolean).length, r = this.slots.filter((s) => s && s.ready).length;
    if (this.selectFoot) this.selectFoot.innerHTML = n === 0 ? 'Waiting for heroes…' : r === n ? 'The oath is sworn…' : `${r}/${n} ready · Back with no one joined returns to title`;
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
        <div class="hp-head"><span class="hp-name">P${i + 1} ${hero.cls.name}</span><span class="hp-lv"></span></div>
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
      e.lv.textContent = `Lv ${hero.level}`;
      e.ac.innerHTML = `AC ${hero.ac}`;
      e.boons.innerHTML = hero.boons.slice(-10).map((b) => `<img class="px boon-ic" title="${b.name}" style="border-color:${RARITY[b.rarity].color}" src="${url(b.icon)}">`).join('') +
        [...hero.pacts].map((p) => `<span class="pact" style="color:${PACTS[p].color}">${PACTS[p].name}${hero.bonds && hero.bonds.has(p) ? '⚭' : ''}</span>`).join('');
    }
    if (this.hudTop) {
      const r = g.run;
      this.hudTop.innerHTML = `<span class="ember">${'<b>✹</b>'.repeat(Math.max(0, r.embers))}</span><span class="room">${this.roomName || ''} <small>${this.roomSub || ''}</small></span><span class="ash">${icon('campfire', '#ff9a40')} <b class="ashv">${r.ash}</b> Ash</span>`;
      this.ashEl = $('.ashv', this.hudTop);
    }
  }
  updateHud(dt) {
    const g = this.game;
    for (const e of this.hudEls) {
      const hero = e.hero;
      e.hp.style.width = (100 * Math.max(0, hero.hp) / hero.maxHp) + '%';
      e.temp.style.width = (100 * Math.min(1, hero.tempHp / hero.maxHp)) + '%';
      e.hpt.textContent = hero.dead ? 'DEAD' : hero.downed ? `DOWNED ${hero.deathSaves.s}✓ ${hero.deathSaves.f}✗` : `${Math.max(0, hero.hp)}/${hero.maxHp}${hero.tempHp ? ' +' + hero.tempHp : ''}`;
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
      e.conds.textContent = conds.map((c) => c.toUpperCase()).join(' · ') + (hero.exhausted ? ' · EXHAUSTED' : '');
      e.el.classList.toggle('down', hero.downed || hero.dead);
    }
    if (this.ashEl && g.run) this.ashEl.textContent = g.run.ash;
  }
  prompts(list) {
    for (const e of this.hudEls) {
      const p = list.find((x) => x.hero === e.hero);
      e.prompt.innerHTML = p ? `${keycap(e.hero.ctrl.glyph.interact)} ${p.text}` : '';
    }
  }

  bossIntro(def) {
    const b = this.layer.banner;
    b.innerHTML = `<div class="boss-intro"><img class="px" src="${url(def.portrait)}"><div><div class="banner-sup">${def.title}</div><div class="banner-text">${def.name}</div></div></div>`;
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
    clearTimeout(this.bannerTimer); this.bannerTimer = setTimeout(() => b.classList.remove('show'), 3000);
  }
  bossBar(boss) {
    const el = this.layer.boss;
    if (!boss) { el.innerHTML = ''; this.bossEl = null; return; }
    if (!this.bossEl) {
      el.innerHTML = `<div class="bossbar"><div class="bname">${boss.def.name} <small>${boss.def.title}</small></div><div class="bbar"><div class="fill"></div><div class="poise"></div></div><div class="binfo"></div></div>`;
      this.bossEl = { fill: $('.fill', el), poise: $('.poise', el), info: $('.binfo', el) };
    }
    this.bossEl.fill.style.width = (100 * Math.max(0, boss.hp) / boss.maxHp) + '%';
    this.bossEl.poise.style.width = (100 * Math.min(1, boss.poise / boss.poiseMax)) + '%';
    this.bossEl.info.textContent = `AC ${boss.ac} · CR ${boss.def.cr} · Phase ${boss.phase}${boss.has('stagger') ? ' · STAGGERED' : ''}`;
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
    p.el.innerHTML = `<div class="pp-head">P${hero.slot + 1} ${hero.cls.name} <small>Lv ${hero.level}</small></div><div class="pp-title">${s.title}</div>${s.sub ? `<div class="pp-sub">${s.sub()}</div>` : ''}
      <div class="pp-opts ${s.cards ? 'cards' : ''}">${opts.map((o, i) => `<div class="pp-opt ${i === p.index ? 'sel' : ''} ${o.disabled ? 'disabled' : ''}" style="${o.color ? '--rc:' + o.color : ''}">${o.html}</div>`).join('')}</div>
      <div class="pp-keys">${keycap(g.move)} choose · ${keycap(g.attack)} confirm ${s.extraKey ? '· ' + s.extraKey(g) : ''} ${s.canClose !== false ? '· ' + keycap(g.back || 'ESC') + ' close' : ''}</div>`;
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
    return `<div class="bc-top"><img class="px bc-ic" src="${url(b.icon)}"><div><div class="bc-name">${b.name}</div><div class="bc-rar" style="color:${r.color}">${r.name}</div></div></div>
      <div class="bc-desc">${b.desc}</div><div class="bc-pact" style="color:${pact.color}">${pact.name} pact ${have ? `(${have}/3)` : ''}</div>`;
  }

  openDraft(hero, boons, then = null) {
    let current = boons;
    this.openPanel(hero, {
      title: 'Choose a Boon', cards: true, canClose: false,
      sub: () => `Pacts: ${Object.entries(PACTS).map(([k, p]) => { const n = hero.boons.filter((b) => b.pact === k).length; return n ? `<span style="color:${p.color}">${p.name} ${n}</span>` : ''; }).join(' ') || '—'}`,
      options: () => current.map((b) => ({ html: this.boonCard(b, hero), color: RARITY[b.rarity].color, action: () => { this.game.grantBoon(hero, b); if (then) then(); return false; } })),
      extraKey: (g) => hero.rerolls > 0 ? `${keycap(g.skill2)} reroll (${hero.rerolls})` : '',
      extra: () => { if (hero.rerolls > 0) { hero.rerolls--; current = draftBoons(hero, { depth: this.game.run.depthIndex }); audio.play('book', { vol: 0.6 }); } },
    });
  }

  openShrine(hero) {
    const g = this.game;
    this.openPanel(hero, {
      title: 'Ember Shrine',
      sub: () => `Party Ash: <b>${g.run.ash}</b> · HP ${hero.hp}/${hero.maxHp}`,
      options: () => {
        const cost = LEVEL_COST[hero.level];
        const next = hero.cls.features[hero.level + 1];
        const o = [{ html: hero.level >= MAX_LEVEL ? 'Level MAX' : `Level up to ${hero.level + 1} — <b>${cost}</b> Ash<br><small>+HP${next ? ', ' + next : ''}${(hero.level + 1) % 4 === 0 ? ', + a feat draft' : ''}</small>`, disabled: hero.level >= MAX_LEVEL || g.run.ash < cost, action: () => { g.levelUp(hero); return true; } }];
        o.push({ html: `Kindle an Ember — <b>${900 + 300 * g.run.depthIndex}</b> Ash<br><small>+1 party life</small>`, disabled: g.run.ash < 900 + 300 * g.run.depthIndex, action: () => { g.run.ash -= 900 + 300 * g.run.depthIndex; g.run.embers++; audio.play('shrine'); this.refreshHud(); return true; } });
        o.push({ html: 'Leave', action: () => false });
        return o;
      },
    });
  }

  openShop(hero) {
    const g = this.game;
    if (!g.shopStock) g.shopStock = new Set();
    this.openPanel(hero, {
      title: 'Ossa the Ash-Merchant',
      sub: () => `Party Ash: <b>${g.run.ash}</b>`,
      options: () => SHOP_ITEMS.map((it) => {
        const cost = Math.round(it.cost * (1 + g.run.depthIndex * 0.25));
        return { html: `<img class="px shop-ic" src="${url(it.icon)}"> <b>${it.name}</b> — ${cost} Ash<br><small>${it.desc}</small>`, disabled: g.run.ash < cost, action: () => { g.run.ash -= cost; this.buy(it.id, hero); audio.play('coins', { vol: 0.8 }); this.refreshHud(); return it.id !== 'boon'; } };
      }).concat([{ html: 'Leave', action: () => false }]),
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
    g.log(`${hero.label} buys ${SHOP_ITEMS.find((i) => i.id === id).name}.`, hero.color);
  }

  openAltar(hero) {
    const g = this.game;
    if (g.altarRolled.has(hero)) { this.toast(`${hero.label} has already tempted fate here.`); return; }
    this.openPanel(hero, {
      title: "The Dicer's Altar",
      sub: () => 'Roll the d20. <b>1</b>: a curse. <b>2–9</b>: Ash. <b>10–17</b>: a boon. <b>18–19</b>: a rare boon. <b>20</b>: legendary.',
      options: () => [
        { html: `${icon('dice-twenty-faces-twenty', '#ff7ad0')} Roll the bones`, action: () => { g.altarRolled.add(hero); this.altarRoll(hero); return false; } },
        { html: 'Walk away', action: () => false },
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
        g.ui.banner('Cursed', `${hero.label} is Hexed (-1 AC, -1 to hit)`, 2); audio.play('error');
      } else if (r < 10) { const a = 40 * r + 60 * g.run.depthIndex; g.run.ash += a; g.ui.banner('Fortune', `+${a} Ash`, 1.6); audio.play('coins'); }
      else if (r < 18) this.openDraft(hero, draftBoons(hero, { depth: g.run.depthIndex }));
      else if (r < 20) this.openDraft(hero, draftBoons(hero, { depth: g.run.depthIndex, minRarity: 'rare' }));
      else { this.openDraft(hero, draftBoons(hero, { minRarity: 'legendary' })); g.ui.banner('NATURAL 20', 'The dice adore you', 2); }
      this.refreshHud();
    }, 900);
  }

  // ------------------------------------------------------------ pause & end
  showPause() {
    this.onBack = () => this.game.resume();
    this.setScreen('pause', () => this.menu([
      { label: 'Resume', action: () => this.game.resume() },
      { label: 'Options', action: () => this.showOptions(() => this.showPause()) },
      { label: 'Abandon run', action: () => { this.game.paused = false; this.game.abandon(); } },
    ], { title: 'Paused', sub: this.game.run ? `Seed ${this.game.run.seed} · ${this.game.run.depth.name} · Room ${this.game.run.roomIndex}` : '' }));
  }

  showEnd(won, marks) {
    const g = this.game, r = g.run;
    this.closeAllPanels();
    this.layer.boss.innerHTML = ''; this.bossEl = null;
    const mins = Math.floor((Date.now() - r.startTime) / 60000);
    this.setScreen('end', () => {
      const w = h('div', 'menu end');
      w.innerHTML = `<div class="menu-title ${won ? 'won' : 'lost'}">${won ? 'The Oath is Fulfilled' : 'The Oath is Broken'}</div>
        <div class="menu-sub">${won ? 'Cindermaw lies cold. The Abyss sleeps.' : `Fell in ${r.depth.name}, room ${r.roomIndex}.`} · ${mins} min · ${r.roomsCleared} rooms · ${r.bossesSlain} bosses · seed ${r.seed}</div>
        <div class="end-heroes">${g.heroes.map((x) => `<div class="eh" style="--pc:${x.color}"><b>P${x.slot + 1} ${x.cls.name}</b> Lv ${x.level}<br>Damage ${x.stats.dealt} · Kills ${x.stats.kills}<br>Crits ${x.stats.crits} · Nat 20s ${x.stats.nat20}<br>Revives ${x.stats.revives} · Downs ${x.stats.downs}<div class="eb">${x.boons.map((b) => `<img class="px" title="${b.name}" src="${url(b.icon)}">`).join('')}</div></div>`).join('')}</div>
        <div class="marks">+${marks} Oath Marks ✦ <small>(total ${meta.data.marks})</small></div>`;
      w.appendChild(this.menu([{ label: 'Return to the Shrine', action: () => this.game.toTitle() }]));
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
