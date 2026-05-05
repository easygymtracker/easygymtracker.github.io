import { storage } from "../services/services.js";
import { WorkoutSession } from "../models/workoutSession.js";

const ENTRIES_KEY = "workoutSessions:entries";

function readEntries() {
    const entries = storage.get(ENTRIES_KEY);
    return Array.isArray(entries) ? entries : [];
}

function writeEntries(entries) {
    storage.set(ENTRIES_KEY, entries);
}

export function createWorkoutSessionStore() {
    function listSessions() {
        return readEntries()
            .slice()
            .sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")));
    }

    function addSession(sessionData) {
        const session = sessionData instanceof WorkoutSession
            ? sessionData
            : new WorkoutSession(sessionData);

        const entries = readEntries();
        entries.push(session);
        writeEntries(entries);
        return session;
    }

    function getById(id) {
        return listSessions().find((entry) => entry.id === id) ?? null;
    }

    function updateSession(id, patch) {
        const entries = readEntries();
        const index = entries.findIndex((entry) => entry.id === id);
        if (index === -1) return null;

        const current = entries[index];
        const next = new WorkoutSession({
            ...current,
            ...patch,
            id: current.id,
            createdAt: current.createdAt,
        });

        entries[index] = next;
        writeEntries(entries);
        return next;
    }

    function removeSession(id) {
        writeEntries(readEntries().filter((entry) => entry.id !== id));
    }

    function clearAll() {
        writeEntries([]);
    }

    return { listSessions, addSession, getById, updateSession, removeSession, clearAll };
}
