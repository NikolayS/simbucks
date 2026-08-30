export function createBus() {
  const map = new Map();
  return {
    on(name, fn) { if (!map.has(name)) map.set(name, new Set()); map.get(name).add(fn); return () => this.off(name, fn); },
    off(name, fn) { const s = map.get(name); if (s) s.delete(fn); },
    emit(name, payload) {
      const s = map.get(name);
      if (!s) return;
      for (const fn of [...s]) { try { fn(payload); } catch (e) { console.error(`[bus:${name}]`, e); } }
    },
  };
}
