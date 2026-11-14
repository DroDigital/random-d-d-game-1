// Control hints for new players. Each player gets their own hint bubble above
// their HUD panel, showing the right key or button for *their* device, shown
// when it becomes relevant and dismissed once they've done the thing.
import { t } from '../i18n/index.js';
import { meta } from '../core/meta.js';

// done(hero, game): true once the player has performed the action
// when(hero, game): the hint is relevant right now
const HINTS = [
  { id: 'move', keys: ['move'], text: 'Move around', when: () => true, done: (h) => h.counters.moved > 8 },
  { id: 'attack', keys: ['attack'], text: 'Attack', when: (h, g) => g.combatActive, done: (h) => h.counters.attacks >= 3 },
  { id: 'dodge', keys: ['dodge'], text: 'Roll through the red markings', when: (h, g) => g.enemies.some((e) => e.alive && e.state === 'windup' && e.distTo(h) < 8), done: (h) => h.counters.dodges >= 2, urgent: true },
  { id: 'lock', keys: ['lock'], text: 'Lock on: tap to switch target, hold to release', when: (h, g) => h.canLock && g.combatActive && g.enemies.some((e) => e.alive && !e.hidden), done: (h) => h.counters.lock >= 1 },
  { id: 'heavy', keys: ['heavy'], text: 'Heavy attack: slower, breaks poise', when: (h, g) => g.combatActive && h.counters.attacks >= 5, done: (h) => h.counters.heavy >= 2 },
  { id: 'skills', keys: ['skill1', 'skill2'], text: 'Use your skills', when: (h, g) => g.combatActive && h.counters.attacks >= 8, done: (h) => h.counters.skills >= 2 },
  { id: 'potion', keys: ['potion'], text: 'Low on health: drink a potion', when: (h) => h.hp < h.maxHp * 0.45 && h.potions > 0, done: (h) => h.counters.potions >= 1, urgent: true },
  { id: 'revive', keys: ['interact'], text: 'Hold near a downed ally to revive them', when: (h, g) => g.heroes.some((o) => o !== h && (o.downed || o.dead)), done: (h) => h.counters.revives >= 1, urgent: true },
  { id: 'stamina', keys: [], text: 'Out of stamina: stop attacking for a moment', when: (h) => h.exhausted, done: () => false, info: 5 },
  { id: 'shrine', keys: ['interact'], text: 'Rest at the shrine to heal and save', when: (h, g) => g.roomType === 'shrine' && !g.shrineRested, done: (h, g) => g.shrineRested },
  { id: 'doors', keys: [], text: 'Walk into a door to choose your path', when: (h, g) => g.cleared && g.doors.some((d) => d.open) && !g.ui.anyPanelOpen() && g.roomType !== 'shrine', done: () => false, info: 6 },
];
const SHOW_TIMES = 2; // in "auto" mode a hint retires after players have completed it this many times

export class Hints {
  constructor(ui) { this.ui = ui; this.state = new Map(); }

  get mode() { return (meta.data.settings && meta.data.settings.hints) || 'auto'; }

  reset() { this.state.clear(); }

  retired(id) { return this.mode === 'auto' && ((meta.data.hintsDone || {})[id] || 0) >= SHOW_TIMES; }

  complete(id) {
    meta.data.hintsDone = meta.data.hintsDone || {};
    meta.data.hintsDone[id] = (meta.data.hintsDone[id] || 0) + 1;
    meta.save();
  }

  update(dt, game) {
    if (this.mode === 'off' || game.mode !== 'play' || game.paused) { for (const e of this.ui.hudEls) this.paint(e, null); return; }
    for (const e of this.ui.hudEls) {
      const h = e.hero;
      let st = this.state.get(h);
      if (!st) { st = { done: new Set(), current: null, t: 0, cool: 1.5 }; this.state.set(h, st); }
      // finish the current hint
      if (st.current) {
        const hint = st.current;
        st.t += dt;
        const finished = hint.done(h, game);
        if (finished || (hint.info && st.t > hint.info) || (!hint.urgent && !hint.when(h, game) && st.t > 3)) {
          if (finished) this.complete(hint.id);
          st.done.add(hint.id); st.current = null; st.cool = 2.5;
        }
      } else if (h.canAct && !this.ui.panelFor(h)) {
        st.cool -= dt;
        if (st.cool <= 0) {
          // urgent hints jump the queue
          const pool = HINTS.filter((x) => !st.done.has(x.id) && !this.retired(x.id) && !(x.done(h, game)) && x.when(h, game));
          const next = pool.find((x) => x.urgent) || pool[0];
          if (next) { st.current = next; st.t = 0; }
        }
      }
      this.paint(e, h.canAct && !this.ui.panelFor(h) ? st.current : null);
    }
  }

  paint(e, hint) {
    const el = e.hint;
    if (!el) return;
    const id = hint ? hint.id : '';
    if (el.dataset.id === id) return;
    el.dataset.id = id;
    if (!hint) { el.classList.remove('show'); return; }
    const glyphs = hint.keys.map((k) => this.ui.glyph(e.hero.ctrl, k)).join(' ');
    el.innerHTML = `${glyphs ? glyphs + ' ' : ''}<span>${t(hint.text)}</span>`;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    el.classList.toggle('urgent', !!hint.urgent);
  }
}
