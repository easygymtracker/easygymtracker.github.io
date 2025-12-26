// storageService.js
// Combines a string-based storage adapter (e.g. LocalStorageAdapter)
// with a JsonSerializer (serialize/deserialize), so the rest of the app
// reads/writes objects/models instead of raw JSON strings.

export class StorageService {
  /**
   * @param {object} adapter  Must implement: get(key)->string|null, set(key,string), remove(key), keys(prefix)->string[]
   * @param {object} serializer Must implement: serialize(value)->string, deserialize(raw)->any
   */
  constructor(adapter, serializer) {
    if (!adapter) throw new Error("StorageService: adapter is required");
    if (!serializer) throw new Error("StorageService: serializer is required");

    this.adapter = adapter;
    this.serializer = serializer;
  }

  /** Read a value (revived model or plain object, depending on serializer). */
  get(key) {
    const raw = this.adapter.get(key);
    if (raw == null) return null;
    return this.serializer.deserialize(raw);
  }

  /** Write any serializable value (model with toJSON() or plain object). */
  set(key, value) {
    const raw = this.serializer.serialize(value);
    this.adapter.set(key, raw);
  }

  /** Delete a key. */
  remove(key) {
    this.adapter.remove(key);
  }

  /** List keys (within adapter namespace), optionally filtered by prefix. */
  keys(prefix = "") {
    return this.adapter.keys(prefix);
  }

  /** Convenience: read multiple keys. */
  getMany(keys) {
    return keys.map((k) => this.get(k));
  }

  /** Convenience: write multiple entries. */
  setMany(entries) {
    // entries: Array<[key, value]>
    for (const [k, v] of entries) this.set(k, v);
  }
}