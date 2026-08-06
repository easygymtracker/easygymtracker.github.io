// services/services.js

import { LocalStorageAdapter } from "../storage/localStorageAdapter.js";
import { JsonSerializer } from "../storage/jsonSerializer.js";
import { StorageService } from "../storage/storageService.js";

import { Exercise } from "../models/exercise.js";
import { Routine } from "../models/routine.js";
import { SetSeries } from "../models/setSeries.js";
import { RepGroup } from "../models/repGroup.js";
import { WorkoutSession } from "../models/workoutSession.js";

import { isGoogleDriveConfigured } from "../config/googleDrive.js";
import { markLocalDataChanged } from "./cloudBackupPreference.js";

const adapter = new LocalStorageAdapter("gymapp_v1");

const serializer = new JsonSerializer({
    schemaVersion: 1,
    typeRevivers: {
        Exercise: (obj) => Exercise.fromJSON(obj),
        Routine: (obj) => Routine.fromJSON(obj),
        SetSeries: (obj) => SetSeries.fromJSON(obj),
        RepGroup: (obj) => RepGroup.fromJSON(obj),
        WorkoutSession: (obj) => WorkoutSession.fromJSON(obj),
    },
    // migrate: (payload, fromV, toV) => payload, // add when needed
});

// onWrite stamps "this device changed at ..." so the backup UI can warn before a
// restore silently discards work that never reached Drive.
//
// Left unset in a build without a Drive client ID: the hook is Drive-only
// bookkeeping, and a local-only deployment should not carry it on every write.
export const storage = new StorageService(adapter, serializer, {
    onWrite: isGoogleDriveConfigured() ? markLocalDataChanged : undefined,
});