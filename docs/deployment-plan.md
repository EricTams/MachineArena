# GitHub Pages Deployment + Firebase Sharing

## Overview

Get Machine Arena deployed to GitHub Pages, then add Firebase Firestore for sharing ship designs and ML weights with other players. Work proceeds in five phases, each building on the last.

## Status

- [ ] Phase 1: Git repo + GitHub Pages
- [ ] Phase 2: Sci-fi name generator + player identity
- [ ] Phase 3: Local ship save/load + offline opponents
- [ ] Phase 4: Portable weight export/import
- [ ] Phase 5: Firebase integration (auto-upload + community browser)

## Dependency Graph

```
Phase 1 (Git + GitHub Pages)
  └─► Phase 2 (Player Identity)
        ├─► Phase 3 (Local Ship Save + Offline Opponents)
        └─► Phase 4 (Weight Export/Import)
              └──┐
Phase 3 ─────────┴─► Phase 5 (Firebase)
```

Phases 3 and 4 can run in parallel. Phase 5 depends on both.

---

## Phase 1: Git Repo + GitHub Pages

**Goal:** Get the game playable at `https://<username>.github.io/MachineArena/`

- Initialize git repo, create `.gitignore` (OS files, editor files, etc.)
- The app is already static with no build step -- all deps come from CDN in `index.html`
- Push to GitHub, enable Pages on `main` branch (root `/`)
- Verify the site loads and plays correctly

**Note:** The import map in `index.html` uses bare module specifiers for Three.js pointing to unpkg CDN. Should resolve fine on GitHub Pages but needs verification.

---

## Phase 2: Player Identity -- Sci-Fi Name Generator

**Goal:** Give each player a memorable, unique identity with zero friction.

### Name Generator (`src/naming.js`)

- "Adjective Adjective Noun" format (e.g. "Crimson Volatile Sentinel")
- Sci-fi arena word lists (~40-50 adjectives, ~30-40 nouns)
- First launch: show generated name with "Reroll" button, confirm with "Accept"
- Store accepted name in `localStorage` key `'playerName'`
- On subsequent visits, skip the prompt -- load silently

### Sanitization

- `sanitizeForDocId(name)`: lowercase, replace spaces with hyphens, strip non-alphanumeric chars, truncate to 60 chars
- Applied silently for Firestore document IDs -- player always sees their pretty display name
- Example: "Crimson Volatile Sentinel" -> `"crimson-volatile-sentinel"`

---

## Phase 3: Local Save/Load for Ship Designs + Offline Opponents

**Goal:** Persist ship layouts in IndexedDB. Enable offline training against saved ships.

### Ship Persistence (`src/shipPersistence.js`)

- Save/load ship layouts + associated weights to IndexedDB
- Each saved entry: `{ shipName, playerName, layout, levelNum, topology, weightsBase64, modelConfig, timestamp }`
- New IndexedDB object store `'savedShips'` in existing `MachineArenaML` database (bump version)
- UI: "Save Ship" button, "My Ships" dropdown to load saved designs

### Offline Opponent Training

- "My Ships" list doubles as an opponent selector
- "Fight Against" loads a locally saved ship + weights into the arena as an ML-controlled enemy
- Works fully offline -- no Firebase needed

---

## Phase 4: Portable Weight Export/Import

**Goal:** Make ML weights exportable as JSON-friendly blobs for Firebase upload.

- `exportModelAsJson()` -- extracts topology + weights from the TF.js model, serializes to JSON (topology JSON + base64-encoded weight data)
- `importModelFromJson(json)` -- reconstructs a TF.js model from exported format
- Model is small (~11K float32 params, ~44KB) -- fits in a Firestore document
- No manual UI buttons (Phase 3 save bundles weights with ships) -- functions exposed for Phase 5

---

## Phase 5: Firebase Integration

**Goal:** Auto-upload ship + weights at end of each arena fight. Community opponent browser.

### Firebase Setup

- Firebase project (free Spark plan), Firestore Database
- Security rules: reads from anyone, writes require a `playerName` field (honor system)
- Firebase SDK via CDN (no build step)

### Firestore Schema -- Collection: `fighters`

```
Document ID: {sanitizedPlayerName}_{shipName}_{levelNum}

{
  playerName: string,        // display name
  shipName: string,
  levelNum: number,          // which level this was trained on
  layout: array,             // ship design
  topology: object,          // TF.js model topology JSON
  weightsBase64: string,     // base64-encoded weight buffer (~44KB)
  modelConfig: object,       // learning rate, schema version, etc.
  updatedAt: timestamp
}
```

- Upsert semantics -- each fight overwrites previous version for that player+ship+level
- Players climb a ladder of 5-15 levels; each level snapshot is preserved
- Example ID: `"crimson-volatile-sentinel_gunboat_3"`

### Auto-Upload Flow

1. Player name already set from Phase 2 (localStorage)
2. At **end of each arena fight**, automatically:
   - Serialize current ship layout
   - Export current model weights (Phase 4 functions)
   - Upsert `fighters` document to Firestore
3. Fire-and-forget in background -- does not block gameplay
4. Offline/failure: log warning, don't disrupt

### Community Browser UI

- "Opponents" panel: fetches `fighters` from Firestore
- Shows player name, ship name, level number, last updated
- "Fight" button loads opponent's ship + weights as ML-controlled enemy
