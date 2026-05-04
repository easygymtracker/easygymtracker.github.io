// src/export/profileExport.js

/**
 * Profile measurements export format:
 * - Internal IDs are omitted; re-generated on import
 * - Field names use the canonical storage names (recordedAt / weightKg / bodyFatPct / muscleKg)
 */
export function buildProfileExportV1({ profileStore }) {
    const entries = profileStore.listEntries().map(({ recordedAt, weightKg, bodyFatPct, muscleKg }) => ({
        recordedAt,
        weightKg: weightKg ?? null,
        bodyFatPct: bodyFatPct ?? null,
        muscleKg: muscleKg ?? null,
    }));

    return {
        format: "GymAppProfileExport",
        formatVersion: 1,
        exportedAt: new Date().toISOString(),
        app: {
            name: "Easy Gym Routine Tracker",
            storageNamespace: "gymapp_v1",
        },
        measurements: entries,
    };
}

export function profileExportFilename() {
    const date = new Date().toISOString().slice(0, 10);
    return `gym-profile-${date}.gymprofile.json`;
}

export function downloadProfileJson({ data }) {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = profileExportFilename();
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
