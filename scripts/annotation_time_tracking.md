# Estimating annotator time in HistomicsUI and VolView

Goal: a useful estimate of how long annotators spend annotating, not a full
activity log. Sessions are defined by inactivity: if an annotation (or a
user) goes quiet for longer than a gap threshold, the next edit starts a new
conceptual session.

## 1. What we can track today (history on, no other changes)

`large_image.annotation_history` is on by default. Every save from
HistomicsUI (POST / PUT / PATCH `annotation`) creates a new `_version`; the
superseded document is kept with `_active: False` and `_annotationId` pointing
at the live one, and every version's elements stay in `annotationelement`.

HistomicsUI saves on every `change:annotation` event (each element drawn,
moved, edited or deleted), coalescing only while a save is in flight. So the
version sequence is roughly a per-action trace of editing.

Per version we have:

| Field | What it tells us |
|---|---|
| `updated` | Server time of that save (server overwrites the client value) |
| `updatedId` | Who made that save |
| `created` / `creatorId` | Who created the annotation and when |
| `_version` | Global monotonic sequence number: orders saves across all annotations |
| `_elementCount` | Elements in that version |
| `_id` of inactive copies | ObjectId time = when that version was superseded (≈ next save, 1 s resolution) |
| `annotationelement` rows (`annotationId`, `_version`, `element.id`) | Full element contents per version; `element.id` is stable across versions so versions can be diffed |

Derived estimates:

- **Per-user sessions**: sort all `updated` times for a `updatedId`, split on
  gaps > threshold (15 min, as the history UI does), sum session spans. Pad
  each session's first save with one median inter-save interval (capped,
  default 5 min) to account for the work before it.
- **Per-annotation effort**: versions, editors, wall-clock span vs. active
  time, handoffs between users.
- **Per-version element deltas**: added / removed / modified element counts by
  diffing `element.id` sets and element content between consecutive versions
  → elements per minute, which elements took long.

Holes in this data:

- **Deletes have no timestamp or user.** `Annotation.remove()` only sets
  `_active: False`; nothing records when or by whom.
- **Metadata / access edits** bump `updated` on the live document without
  creating a history version, so the live version's `updated` can be later
  than its last element edit.
- **Viewing without editing** (panning, zooming, inspecting) leaves no trace.
- **Start of a session** and the tail after the last save are only estimable.
- **Pruning**: `DELETE /annotation/old` (`removeOldAnnotations`, keeps 5
  inactive versions by default) truncates the trace; results become lower
  bounds.
- `element.id` is a random GUID from the client, so it carries no time.

A pymongo script that implements the above (sessions, per-annotation summary,
element diffs, CSV export) is in `annotation_time.py`. Run it inside
the DSA girder container (
`docker exec -i dsa-girder-1 python - <options> < annotation_time.py`),
where Mongo and the assetstores are already reachable. It also covers VolView
session saves (next section).

## 1b. VolView annotations (`girder_volview`)

VolView annotations (rulers, rectangles, polygons, paint segmentations) are
not girder annotations. The `girder_volview` plugin stores them only when the
user clicks **Save** in VolView, which uploads a complete `session.volview.zip`
as a *new* girder file every time:

- **Item-scoped save** (`POST item/:id/volview`): the zip is added to the
  image item, so the item accumulates one `session.volview.zip` file per save.
- **Folder-scoped save** (`POST folder/:id/volview?metadata=…`, used for
  checked sets and grouped DICOM rows): each save creates a new item named
  `session*.volview.zip` in the folder, with `meta.linkedResources`
  (`items`, `folders`, or a `filter`) naming what the session was opened on.

Per save we have:

| Field | What it tells us |
|---|---|
| `file.created` / `file.creatorId` | When and by whom the save happened |
| `item.folderId`, `item.meta.linkedResources` | Which images the session covers (folder-scoped) |
| `file.size` | Rough size of the session (labelmaps dominate) |
| `manifest.json` inside the zip | `tools.{rulers,rectangles,polygons}.tools[]` with stable `id`s, `segmentations[].masks[]` with a labelmap file per mask (older versions: `segmentGroups[]` / `labelMaps[]`) |

Nothing in the manifest carries a time or a user; the only clock is the
file's `created`. The script treats each save as one edit event (like one
annotation version), chains saves of the same target (image item, or folder
plus `linkedResources`) into a lineage, and with `--elements` reads
the zips to diff tool sets (by `id`) and labelmap files (by CRC) between
consecutive saves. The script is meant to run inside the DSA girder
container, where it finds Mongo through `GIRDER_MONGO_URI` and reads the zips
through girder's own assetstore adapters, so no credentials are needed.

Holes specific to VolView:

- **No autosave.** HistomicsUI saves on every element change; VolView saves
  only when asked, so a 30-minute segmentation session may be a single event
  with an active time of zero. Such singular lineages can be dropped from the
  estimates with `--exclude-singular`.
- **Opening a session leaves no trace.** `GET item/:id/volview` and
  `GET folder/:id/volview` are ordinary reads; `meta.lastOpened` is read by
  the plugin but never written.
- **Deleting a session item removes it entirely**, taking its save history
  with it.
- **Labelmap edits are opaque**: we can tell a mask file changed between saves,
  not how much was painted.
- Sessions saved by the `session_builder` API (`session.volview.json`, no zip)
  look like saves by whoever ran the script.

## 2. What the stock `audit_logs` plugin would add

Girder's `audit_logs` plugin attaches a handler to the `girder_audit` logger
and stores one Mongo document per event in `audit_log_record`:

```
{type, details, ip, userId, when}
```

Girder core emits three event types:

| type | details | relevance |
|---|---|---|
| `rest.request` | `method`, `route` (tuple, e.g. `('annotation', ':id')`), `params`, `status` | Every REST call: annotation GET (open/view), PUT/PATCH (save), DELETE, metadata, history reverts, item/folder navigation |
| `document.create` | collection + `_id` | Redundant with `created` on annotations |
| `file.download` | file id, range | Not useful for annotation timing |

With it enabled we would additionally know:

- **When an annotation was deleted and by whom** (`DELETE annotation/:id`).
- **When a user opened an item / fetched annotations** (`GET item/:id`,
  `GET annotation/item/:id`, `GET annotation/:id`), giving a session start
  before the first save and a view-only presence signal.
- **Metadata and access changes** as separate, timestamped events.
- **Client IP**, which separates concurrent sessions from different machines.

Costs / caveats as it stands:

- It logs *every* REST request, including tile requests
  (`item/:id/tiles/zxy/...`), which HistomicsUI issues by the thousands.
  Large_image does not decorate its tile routes with `disableAuditLog`, so
  the collection grows fast; the plugin ships `girder audit-logs-cleanup
  --days=N --types=rest.request` to prune.
- It records the request, not the effect: a PUT that failed validation still
  appears (with its `status`).
- `params` includes request bodies, so annotation PUTs store the full element
  payload again — doubling what history already keeps.
- No notion of sessions; the same gap-based analysis has to be run on the
  records.

Net: it closes the delete and session-start holes, but it is a heavyweight
way to do it and tracks _everything_.

## 3. Lightweight ways to track sessions better

Ordered by effort; each is independent.

### a. Stamp deletions (large_image, ~5 lines)

In `Annotation.remove()` with history enabled, set `updated` and `updatedId`
on the document before marking it `_active: False`, or insert an inactive copy
as `save()` does. Then the history trace ends with a timed, attributed
delete. No client changes, no new collections.

### b. Filtered audit handler for annotation routes (HistomicsUI)

Girder already emits `rest.request` audit events for every call whether or
not the `audit_logs` plugin is installed. HistomicsUI can attach its own
`logging.Handler` to `girder.auditLogger` that keeps only what matters:

### c. Session heartbeat from the client (HistomicsUI client + one endpoint)

While the draw panel is active or an annotation is selected, the client sends
`POST histomicsui/annotation_session {itemId, annotationIds}` at most once
every N minutes (e.g. 2) and on page unload. The server upserts into a small
`annotation_session` collection:

```
{userId, itemId, start, lastActive, saves: n}
```

extending the latest document when `lastActive` is within the gap threshold,
otherwise starting a new one. This directly records "the user had this image
open for annotation from T1 to T2" including view-only time, at ~1 document
per session. It is the only option that captures time with no saves, but it
requires client code and a decision about what "active" means (tab focused,
mouse moving, etc.).

### d. Make the existing data easier to use (no new tracking)

- Surface a "history → sessions" summary in the annotation history UI, using
  the gap rule already assumed there.
- Add a `GET annotation/:id/history/summary` or folder-level endpoint that
  returns per-user session spans computed server-side, so the pymongo script
  isn't needed.
- Don't prune history
