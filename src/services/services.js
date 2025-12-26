import { LocalStorageAdapter } from "../storage/localStorageAdapter.js";
import { JsonSerializer } from "../storage/jsonSerializer.js";
import { StorageService } from "../storage/storageService.js";

import { Exercise } from "../models/exercise.js";
import { Routine } from "../models/routine.js";
import { SetSeries } from "../models/setSeries.js";
import { RepGroup } from "../models/repGroup.js";

const adapter = new LocalStorageAdapter("gymapp_v1");

const serializer = new JsonSerializer({
  schemaVersion: 1,
  typeRevivers: {
    Exercise: (obj) => Exercise.fromJSON(obj),
    Routine: (obj) => Routine.fromJSON(obj),
    SetSeries: (obj) => SetSeries.fromJSON(obj),
    RepGroup: (obj) => RepGroup.fromJSON(obj),
  },
  // migrate: (payload, fromV, toV) => payload, // add when needed
});

export const storage = new StorageService(adapter, serializer);