import { storage } from "../services/services.js";

const ENTRIES_KEY = "profile:entries";

function newId(prefix = "pf") {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function readEntries() {
    const entries = storage.get(ENTRIES_KEY);
    return Array.isArray(entries) ? entries : [];
}

function writeEntries(entries) {
    storage.set(ENTRIES_KEY, entries);
}

export function createProfileStore() {
    function listEntries() {
        return readEntries()
            .slice()
            .sort((a, b) => String(b.recordedAt ?? "").localeCompare(String(a.recordedAt ?? "")));
    }

    function addEntry({ recordedAt, weightKg, bodyFatPct, muscleKg }) {
        const entry = {
            id: newId(),
            recordedAt,
            weightKg: weightKg ?? null,
            bodyFatPct: bodyFatPct ?? null,
            muscleKg: muscleKg ?? null,
            createdAt: new Date().toISOString(),
        };

        const entries = readEntries();
        entries.push(entry);
        writeEntries(entries);
        return entry;
    }

    function removeEntry(id) {
        writeEntries(readEntries().filter((entry) => entry.id !== id));
    }

    function clearAll() {
        writeEntries([]);
    }

    return { listEntries, addEntry, removeEntry, clearAll };
}