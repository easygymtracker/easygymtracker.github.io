// stores/routineStore.js

import { storage } from "../services/services.js";
import { Routine } from "../models/routine.js";

function newId(prefix = "rt") {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

const INDEX_KEY = "routines:index";
const keyFor = (id) => `routines:${id}`;

function readIndex() {
    const ids = storage.get(INDEX_KEY);
    return Array.isArray(ids) ? ids : [];
}

function writeIndex(ids) {
    storage.set(INDEX_KEY, ids);
}

export function createRoutineStore() {
    function list() {
        return readIndex()
            .map((id) => storage.get(keyFor(id))) // revived Routine instances via JsonSerializer.typeRevivers
            .filter(Boolean);
    }

    function getById(id) {
        return storage.get(keyFor(id)); // Routine | null
    }

    function create({ name, description = "" }) {
        const routine = new Routine({
            id: newId("rt"),
            name,
            description,
            series: [],
        });

        storage.set(keyFor(routine.id), routine);

        const ids = readIndex();
        if (!ids.includes(routine.id)) {
            ids.push(routine.id);
            writeIndex(ids);
        }

        return routine;
    }

    function update(routine) {
        // routine can be a Routine instance or a plain object with the same shape.
        const model = routine instanceof Routine ? routine : new Routine(routine);

        storage.set(keyFor(model.id), model);

        // Ensure it's indexed (in case it was imported/added without index)
        const ids = readIndex();
        if (!ids.includes(model.id)) {
            ids.push(model.id);
            writeIndex(ids);
        }

        return model;
    }

    function remove(id) {
        storage.remove(keyFor(id));
        writeIndex(readIndex().filter((x) => x !== id));
    }

    function clearAll() {
        const ids = readIndex();
        ids.forEach((id) => storage.remove(keyFor(id)));
        writeIndex([]);
    }

    return { list, getById, create, update, remove, clearAll };
}