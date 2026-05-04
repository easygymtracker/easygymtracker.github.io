GymApp Routine Export Format (v1)
================================

Cloudflare Web Analytics Setup
------------------------------

Traffic tracking is integrated through a lightweight Cloudflare Web Analytics loader in `index.html`.

To enable it:

1. Get your token from Cloudflare Web Analytics.
2. Open `index.html` and set:

```html
<meta name="cf-analytics-token" content="YOUR_CLOUDFLARE_TOKEN" />
```

Notes:

- If the token is empty, analytics stays disabled.
- The loader skips localhost/127.0.0.1/::1 automatically, so local testing does not pollute production stats.

This document describes the fixed, portable export format used by
Dimple Gym Routine Tracker to download and later import routines across devices.

The format is designed to be:
- Stable (versioned, explicit)
- Portable (no device-local IDs)
- Import-friendly (rebuilds routines and exercises safely)
- Human-readable (plain JSON)


Structured JSON for SEO (JSON-LD)
---------------------------------

The website also uses structured JSON in the form of JSON-LD for search engines.

This is different from the routine export format above:

- The export format is app data meant for import/export between devices.
- JSON-LD is metadata meant for crawlers like Google, Bing, and social platforms.

JSON-LD is usually embedded in HTML inside a script tag like this:

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "Easy Gym Routine Tracker",
  "applicationCategory": "HealthApplication",
  "operatingSystem": "Web",
  "url": "https://easygymtracker.github.io/",
  "description": "A local-first web app for planning gym routines, logging sessions, and tracking progress privately on your own device.",
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "USD"
  },
  "featureList": [
    "Local-first routine storage",
    "Workout session tracking",
    "Unilateral and bilateral set support",
    "Progress history charts"
  ]
}
</script>
```

What the fields mean:

- `@context`
  Tells crawlers which vocabulary is being used. Here it is Schema.org.

- `@type`
  Describes what this page or entity is. For the homepage we use `SoftwareApplication`.

- `name`, `description`, `url`
  Core identity fields for the product/page.

- `applicationCategory`, `operatingSystem`
  Extra classification that helps search engines understand the app.

- `offers`
  Pricing metadata. In this case the app is represented as free.

- `featureList`
  A concise list of product capabilities.

In this project, the public routes update JSON-LD dynamically so that:

- `/` exposes a `SoftwareApplication`
- `/features` exposes a `WebPage`
- `/privacy` exposes a `PrivacyPolicy`

That structured data is added at runtime in the SPA bootstrap and is intended to match the visible page content.


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