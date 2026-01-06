// stores/exerciseStore.js

import { storage } from "../services/services.js";
import { Exercise } from "../models/exercise.js";

function newId(prefix = "ex") {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

const INDEX_KEY = "exercises:index";
const keyFor = (id) => `exercises:${id}`;

function readIndex() {
    const ids = storage.get(INDEX_KEY);
    return Array.isArray(ids) ? ids : [];
}

function writeIndex(ids) {
    storage.set(INDEX_KEY, ids);
}

function normalizeName(s) {
    return String(s ?? "")
        .trim()
        .replace(/\s+/g, " ")
        .toLowerCase();
}

export function createExerciseStore() {
    function list() {
        return readIndex()
            .map((id) => storage.get(keyFor(id))) // revived Exercise instances
            .filter(Boolean);
    }

    function getById(id) {
        return storage.get(keyFor(id));
    }

    function findByDescription(description) {
        const n = normalizeName(description);
        if (!n) return null;
        return list().find((ex) => normalizeName(ex.description) === n) ?? null;
    }

    function create({ description }) {
        const ex = new Exercise({ id: newId("ex"), description });
        storage.set(keyFor(ex.id), ex);

        const ids = readIndex();
        if (!ids.includes(ex.id)) {
            ids.push(ex.id);
            writeIndex(ids);
        }
        return ex;
    }

    function getOrCreateByDescription(description) {
        const clean = String(description ?? "").trim();
        if (!clean) throw new Error("Exercise description is required");
        return findByDescription(clean) ?? create({ description: clean });
    }

    function remove(id) {
        storage.remove(keyFor(id));
        writeIndex(readIndex().filter((x) => x !== id));
    }

    return { list, getById, findByDescription, create, getOrCreateByDescription, remove };
}