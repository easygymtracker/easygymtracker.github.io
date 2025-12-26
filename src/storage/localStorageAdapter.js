export class LocalStorageAdapter {
  constructor(namespace = "gymapp") {
    this.ns = namespace;
  }

  _k(key) {
    return `${this.ns}:${key}`;
  }

  get(key) {
    const raw = localStorage.getItem(this._k(key));
    return raw ?? null;
  }

  set(key, value) {
    localStorage.setItem(this._k(key), value);
  }

  remove(key) {
    localStorage.removeItem(this._k(key));
  }

  keys(prefix = "") {
    const fullPrefix = this._k(prefix);
    const out = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(fullPrefix)) out.push(k.slice(this.ns.length + 1)); // strip "ns:"
    }
    return out;
  }
}