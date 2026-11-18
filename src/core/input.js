// Local multiplayer input: two keyboard layouts + up to 4 gamepads.
// Each device is a "controller" with an identical virtual pad interface.

const KB_LAYOUTS = {
  kb1: {
    name: 'Keyboard (left)',
    up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'],
    attack: ['Space'], heavy: ['KeyC'], dodge: ['ShiftLeft'], skill1: ['KeyQ'], skill2: ['KeyE'],
    potion: ['KeyR'], interact: ['KeyF'], lock: ['Tab', 'KeyV'], pause: ['Escape'], back: ['Escape', 'Backspace'], confirm: ['Space', 'KeyF'],
    glyph: { attack: 'SPACE', heavy: 'C', dodge: 'SHIFT', skill1: 'Q', skill2: 'E', potion: 'R', interact: 'F', lock: 'TAB', move: 'WASD', confirm: 'SPACE', back: 'ESC' },
  },
  kb2: {
    name: 'Keyboard (right)',
    up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'],
    attack: ['Slash', 'Numpad0'], heavy: ['Comma', 'Numpad3'], dodge: ['Period', 'Numpad1'], skill1: ['Semicolon', 'Numpad4'], skill2: ['Quote', 'Numpad5'],
    potion: ['BracketRight', 'Numpad6'], interact: ['Enter', 'NumpadEnter'], lock: ['KeyL', 'Numpad7'], pause: ['Backspace'], back: ['Backspace', 'NumpadDecimal'], confirm: ['Slash', 'Numpad0', 'Enter', 'NumpadEnter'],
    glyph: { attack: '/', heavy: ',', dodge: '.', skill1: ';', skill2: "'", potion: ']', interact: 'ENTER', lock: 'L', move: 'ARROWS', confirm: '/', back: 'BKSP' },
  },
};

const PAD_GLYPH = { attack: 'X', heavy: 'RT', dodge: 'A', skill1: 'LB', skill2: 'RB', potion: 'Y', interact: 'B', lock: 'R3', move: 'L-STICK', confirm: 'A', back: 'B' };
const PAD_BTN = { attack: [2], heavy: [7], dodge: [0], skill1: [4], skill2: [5], potion: [3], interact: [1], lock: [11], pause: [9], confirm: [0], back: [1] };
// PlayStation pads (DualSense / DualShock). Browsers normally expose them with the
// "standard" layout (PAD_BTN above), but on some platforms the pad arrives as raw
// HID: buttons in HID usage order (Square, Cross, Circle, Triangle, L1, R1, L2, R2,
// Create, Options, L3, R3, PS, Touchpad) and the d-pad as a hat switch on axes[9].
const SONY_RAW_BTN = { attack: [0], heavy: [7], dodge: [1], skill1: [4], skill2: [5], potion: [3], interact: [2], lock: [11], pause: [9], confirm: [1], back: [2] };
const HAT = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]]; // N NE E SE S SW W NW
const hatDir = (v) => { if (typeof v !== 'number' || Math.abs(v) > 1.2) return null; return HAT[Math.round((v + 1) * 3.5)] || null; }; // neutral reads as ~1.29 -> null
const isSonyRaw = (p) => p.mapping !== 'standard' && /054c|dualsense|dualshock|playstation/i.test(p.id || '');
const ACTIONS = ['attack', 'heavy', 'dodge', 'skill1', 'skill2', 'potion', 'interact', 'lock', 'pause', 'confirm', 'back', 'up', 'down', 'left', 'right'];

const keys = new Set();
const tapped = new Set(); // keys pressed since the last poll (so quick taps are never lost on slow frames)
window.addEventListener('keydown', (e) => {
  keys.add(e.code); if (!e.repeat) tapped.add(e.code);
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Slash', 'Quote', 'Tab', 'Enter'].includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

class Controller {
  constructor(id, type, index = -1) {
    this.id = id; this.type = type; this.padIndex = index;
    this.layout = KB_LAYOUTS[id] || null;
    this.held = {}; this.prev = {};
    this.move = { x: 0, y: 0 }; this.aim = null;
    this.connected = true;
    this.navRepeat = 0; this.navDir = null;
    for (const a of ACTIONS) { this.held[a] = false; this.prev[a] = false; }
  }
  get glyph() { return this.layout ? this.layout.glyph : PAD_GLYPH; }
  get label() { return this.layout ? this.layout.name : `Gamepad ${this.padIndex + 1}`; }
  poll(pads, dt) {
    for (const a of ACTIONS) this.prev[a] = this.held[a];
    let mx = 0, my = 0;
    if (this.layout) {
      const L = this.layout;
      for (const a of ACTIONS) this.held[a] = (L[a] || []).some((k) => keys.has(k) || tapped.has(k));
      // a key tapped and released within one frame still counts as a fresh press
      for (const a of ACTIONS) if ((L[a] || []).some((k) => tapped.has(k) && !keys.has(k))) this.prev[a] = false;
      mx = (this.held.right ? 1 : 0) - (this.held.left ? 1 : 0);
      my = (this.held.down ? 1 : 0) - (this.held.up ? 1 : 0);
      const len = Math.hypot(mx, my); if (len > 0) { mx /= len; my /= len; }
      this.aim = null;
    } else {
      const p = pads[this.padIndex];
      this.connected = !!p;
      if (!p) { for (const a of ACTIONS) this.held[a] = false; this.move.x = this.move.y = 0; return; }
      const dz = (v) => (Math.abs(v) < 0.2 ? 0 : v);
      mx = dz(p.axes[0] || 0); my = dz(p.axes[1] || 0);
      const dp = (i) => !!(p.buttons[i] && p.buttons[i].pressed);
      const sony = isSonyRaw(p);
      if (sony) {
        // raw PlayStation pad: d-pad is a hat switch; buttons 12/13 are PS and touchpad, not d-pad
        const hat = hatDir(p.axes[9]); if (hat) { mx = hat[0]; my = hat[1]; }
      } else {
        if (dp(14)) mx = -1; if (dp(15)) mx = 1; if (dp(12)) my = -1; if (dp(13)) my = 1;
      }
      const btnMap = sony ? SONY_RAW_BTN : PAD_BTN;
      for (const a of ACTIONS) this.held[a] = (btnMap[a] || []).some((i) => dp(i));
      this.held.up = my < -0.5; this.held.down = my > 0.5; this.held.left = mx < -0.5; this.held.right = mx > 0.5;
      const ax = dz(p.axes[2] || 0), ay = dz(p.axes[3] || 0);
      this.aim = Math.hypot(ax, ay) > 0.35 ? { x: ax, y: ay } : null;
      const len = Math.hypot(mx, my); if (len > 1) { mx /= len; my /= len; }
    }
    this.move.x = mx; this.move.y = my;
    // menu navigation with key-repeat
    let dir = null;
    if (this.held.up) dir = 'up'; else if (this.held.down) dir = 'down'; else if (this.held.left) dir = 'left'; else if (this.held.right) dir = 'right';
    this.nav = null;
    if (dir) {
      if (dir !== this.navDir) { this.nav = dir; this.navRepeat = 0.35; }
      else { this.navRepeat -= dt; if (this.navRepeat <= 0) { this.nav = dir; this.navRepeat = 0.12; } }
    }
    this.navDir = dir;
  }
  pressed(a) { return this.held[a] && !this.prev[a]; }
  released(a) { return !this.held[a] && this.prev[a]; }
  consume(a) { this.prev[a] = true; }
}

export const input = {
  controllers: [new Controller('kb1', 'keyboard'), new Controller('kb2', 'keyboard')],
  padControllers: {},
  poll(dt) {
    const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()) : [];
    pads.forEach((p, i) => {
      if (p && !this.padControllers[i]) {
        const c = new Controller('pad' + i, 'gamepad', i);
        this.padControllers[i] = c; this.controllers.push(c);
      }
    });
    for (const c of this.controllers) c.poll(pads, dt);
    tapped.clear();
  },
  byId(id) { return this.controllers.find((c) => c.id === id); },
  anyPressed(a) { return this.controllers.find((c) => c.connected && c.pressed(a)); },
  anyNav() { const c = this.controllers.find((c) => c.connected && c.nav); return c ? c.nav : null; },
  rumble(id, strength = 0.5, ms = 120) {
    const c = this.byId(id);
    if (!c || c.type !== 'gamepad') return;
    const p = navigator.getGamepads()[c.padIndex];
    try { p && p.vibrationActuator && p.vibrationActuator.playEffect('dual-rumble', { duration: ms, strongMagnitude: strength, weakMagnitude: strength * 0.6 }); } catch (e) { /* unsupported */ }
  },
};
