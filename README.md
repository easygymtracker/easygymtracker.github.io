GymApp Routine Export Format (v1)
================================

This document describes the fixed, portable export format used by
Dimple Gym Routine Tracker to download and later import routines across devices.

The format is designed to be:
- Stable (versioned, explicit)
- Portable (no device-local IDs)
- Import-friendly (rebuilds routines and exercises safely)
- Human-readable (plain JSON)


Overview
--------

File extension: .gymroutine.json  
Encoding: UTF-8 JSON  
Top-level format ID: GymAppRoutineExport  
Current version: 1  

Each exported file contains exactly one routine.


Top-level structure
-------------------

Example:

{
  "format": "GymAppRoutineExport",
  "formatVersion": 1,
  "exportedAt": "2026-01-06T12:34:56.789Z",
  "app": {
    "name": "Dimple Gym Routine Tracker",
    "storageNamespace": "gymapp_v1"
  },
  "routine": { ... }
}

Fields:

- format  
  Identifies the file as a GymApp routine export

- formatVersion  
  Version of this export schema

- exportedAt  
  ISO-8601 date-time of export

- app.name  
  Exporting application name

- app.storageNamespace  
  Storage namespace of the exporting app

- routine  
  The exported routine object


Routine object
--------------

Example:

{
  "name": "Push Day A",
  "description": "Chest + triceps focus",
  "series": [ ... ]
}

Fields:

- name  
  Routine name

- description  
  Optional routine description

- series  
  Ordered list of set series


Set series
----------

Each set series represents a block of work for a single exercise.

Example:

{
  "description": "Working sets",
  "restSecondsAfter": 120,
  "exercise": {
    "description": "Bench Press"
  },
  "repGroups": [ ... ]
}

Fields:

- description  
  Optional series description

- restSecondsAfter  
  Rest after completing the series, in seconds

- exercise.description  
  Exercise name, used to relink exercises on import

- repGroups  
  List of rep groups belonging to this series

Note:
Internal exercise IDs are not exported.
On import, exercises are matched or created using their description.


Rep groups
----------

A rep group defines targets and performed history for an exercise.

Example:

{
  "laterality": "bilateral",
  "targetReps": 8,
  "targetWeight": 80,
  "restSecondsAfter": 180,
  "history": [ ... ]
}

Fields:

- laterality  
  "bilateral" or "unilateral"

- targetReps  
  Planned target repetitions, or null

- targetWeight  
  Planned target weight, or null

- restSecondsAfter  
  Rest after this rep group, in seconds

- history  
  List of performed session entries


Weight representation
---------------------

Weights can be represented in three ways:

Bilateral or simple weight:
80

Unilateral (left / right):
{ "left": 16, "right": 18 }

No target:
null


History entries
---------------

Each history entry represents a performed session.

Example:

{
  "dateTime": "2025-12-26T18:45:00.000Z",
  "reps": 8,
  "weight": 80
}

Rules:

- dateTime must be a valid ISO-8601 date-time string
- dateTime values must be unique within a rep group
- reps must be a positive number
- weight follows the same rules as target weight


Import behavior (recommended)
-----------------------------

When importing this format:

1. Validate the header:
   - format equals "GymAppRoutineExport"
   - formatVersion is supported

2. For each series:
   - Resolve exercise.description by:
     - finding an existing exercise by description, or
     - creating a new exercise if missing

3. Create a new routine with fresh local IDs

4. Rebuild set series and rep groups using exported data

5. Preserve history timestamps and values

This ensures:
- No ID collisions
- Safe merging with existing local data
- Full portability across devices


Versioning and future changes
-----------------------------

- New fields may be added in future versions
- Older importers should ignore unknown fields
- Breaking changes will increment formatVersion


Example file name
-----------------

push-day-a.gymroutine.json


Summary
-------

The GymApp Routine Export format is explicit, portable, and human-readable.

It allows routines to be safely shared, backed up, and restored without relying
on internal storage details or device-specific identifiers.