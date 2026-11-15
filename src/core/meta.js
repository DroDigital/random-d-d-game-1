// Persistent meta-progression (Oath Marks, unlocks, records, settings) in localStorage.
const KEY = 'ashen-oath-save-v1'; // kept from the working title so existing saves carry over
const DEFAULT = { marks: 0, unlocked: [], runs: 0, wins: 0, bestDepth: 0, kills: 0, vows: [], settings: null, seen: [] };

function read() {
  try { const s = localStorage.getItem(KEY); if (s) return { ...DEFAULT, ...JSON.parse(s) }; } catch (e) { /* private mode */ }
  return { ...DEFAULT };
}

export const meta = {
  data: read(),
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* ignore */ } },
  has(id) { return this.data.unlocked.includes(id); },
  unlock(id, cost) {
    if (this.has(id) || this.data.marks < cost) return false;
    this.data.marks -= cost; this.data.unlocked.push(id); this.save(); return true;
  },
  reset() { this.data = { ...DEFAULT }; this.save(); },
};
