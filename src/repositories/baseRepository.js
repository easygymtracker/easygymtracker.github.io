export class BaseRepository {
    constructor({ entityName, storage }) {
        this.entity = entityName;   // e.g. "exercise"
        this.storage = storage;     // StorageService
        this.indexKey = `${this.entity}:__index`;
    }

    _itemKey(id) {
        return `${this.entity}:${id}`;
    }

    _readIndex() {
        const ids = this.storage.get(this.indexKey);
        return Array.isArray(ids) ? ids : [];
    }

    _writeIndex(ids) {
        this.storage.set(this.indexKey, ids);
    }

    _addToIndex(id) {
        const ids = this._readIndex();
        if (!ids.includes(id)) {
            ids.push(id);
            this._writeIndex(ids);
        }
    }

    _removeFromIndex(id) {
        const ids = this._readIndex().filter((x) => x !== id);
        this._writeIndex(ids);
    }

    create(modelInstance) {
        const id = modelInstance.id;
        this.storage.set(this._itemKey(id), modelInstance);
        this._addToIndex(id);
        return id;
    }

    getById(id) {
        return this.storage.get(this._itemKey(id));
    }

    list() {
        return this._readIndex()
            .map((id) => this.getById(id))
            .filter(Boolean);
    }

    update(modelInstance) {
        const id = modelInstance.id;
        const existing = this.getById(id);
        if (!existing) throw new Error(`${this.entity} not found: ${id}`);
        this.storage.set(this._itemKey(id), modelInstance);
        return id;
    }

    delete(id) {
        this.storage.remove(this._itemKey(id));
        this._removeFromIndex(id);
    }

    clearAll() {
        const ids = this._readIndex();
        ids.forEach((id) => this.storage.remove(this._itemKey(id)));
        this._writeIndex([]);
    }
}