// src/storage/jsonserializer.js
// Centralizes JSON stringify/parse + optional versioning and type revival.

export class JsonSerializer {
  /**
   * @param {object} options
   * @param {number} [options.schemaVersion=1]
   * @param {(payload: any, fromVersion: number, toVersion: number) => any} [options.migrate]
   * @param {Record<string, (obj:any)=>any>} [options.typeRevivers]
   *
   * typeRevivers example:
   * {
   *   Exercise: (obj) => Exercise.fromJSON(obj),
   *   Routine: (obj) => Routine.fromJSON(obj)
   * }
   */
  constructor({ schemaVersion = 1, migrate, typeRevivers = {} } = {}) {
    this.schemaVersion = schemaVersion;
    this.migrate = migrate;
    this.typeRevivers = typeRevivers;
  }

  /**
   * Accepts a model instance that implements toJSON(), or a plain object.
   * Wraps it with metadata so you can evolve schema later.
   */
  serialize(value) {
    const payload = this._toPlain(value);

    const envelope = {
      __meta: {
        schemaVersion: this.schemaVersion,
        savedAt: new Date().toISOString(),
      },
      payload,
    };

    try {
      return JSON.stringify(envelope);
    } catch (err) {
      throw new Error(`JsonSerializer.serialize failed: ${err?.message ?? err}`);
    }
  }

  /**
   * Returns either a revived model (if typeRevivers matches) or a plain object.
   */
  deserialize(raw) {
    if (raw == null) return null;

    let envelope;
    try {
      envelope = JSON.parse(raw);
    } catch (err) {
      throw new Error(`JsonSerializer.deserialize invalid JSON: ${err?.message ?? err}`);
    }

    // Backward compatibility: if it wasn't wrapped in an envelope, treat as payload directly.
    const hasMeta = envelope && typeof envelope === "object" && envelope.__meta && "payload" in envelope;
    let payload = hasMeta ? envelope.payload : envelope;

    const fromVersion = hasMeta ? Number(envelope.__meta.schemaVersion ?? 0) : 0;
    const toVersion = this.schemaVersion;

    if (this.migrate && fromVersion !== toVersion) {
      payload = this.migrate(payload, fromVersion, toVersion);
    }

    return this._revive(payload);
  }

  /**
   * Like deserialize but always returns a plain object (no revival).
   */
  deserializePlain(raw) {
    const value = this.deserialize(raw);
    return this._toPlain(value);
  }

  // ----------------- internals -----------------

  _toPlain(value) {
    if (value && typeof value.toJSON === "function") return value.toJSON();
    return value;
  }

  _revive(payload) {
    // If payload includes a "type" field and we have a reviver, revive it.
    const t = payload?.type;
    const reviver = t ? this.typeRevivers[t] : null;
    if (reviver) return reviver(payload);

    // If it’s an array, attempt to revive items recursively
    if (Array.isArray(payload)) {
      return payload.map((x) => this._revive(x));
    }

    // For plain objects, you *could* recursively revive nested objects, but
    // most apps revive at repository/model level. Keeping this conservative.
    return payload;
  }
}