# GitHub Pages Deployment + Firebase Sharing

## Overview

Get Machine Arena deployed to GitHub Pages, then add Firebase Firestore for sharing ship designs and ML weights with other players. Work proceeds in five phases, each building on the last.

## Status

- [x] Phase 1: Git repo + GitHub Pages
- [x] Phase 2: Sci-fi name generator + player identity
- [x] Phase 3: Local ship save/load + offline opponents
- [x] Phase 4: Portable weight export/import
- [x] Phase 5: Firebase integration (auto-upload + community browser)
- [x] Phase 6: Stage-based PvP ladder with auto-training

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

- Upsert semantics -- each fight overwrites previous version for that player+ship+stage
- `levelNum` field doubles as stage number for the PvP ladder
- Example ID: `"crimson-volatile-sentinel_gunboat_3"`

### Auto-Upload Flow

1. Player name already set from Phase 2 (localStorage)
2. At **end of a won stage fight**, automatically:
   - Stop recording player actions
   - Auto-train ML model from recorded data (~15 epochs, 1-3s)
   - Export fresh model weights (Phase 4 functions)
   - Upsert `fighters` document to Firestore tagged with the stage number
3. Upload runs in background after training completes
4. Offline/failure: log warning, don't disrupt

### Community Browser UI

- "Opponents" panel: fetches `fighters` from Firestore
- Shows player name, ship name, stage number, last updated
- "Fight" button loads opponent's ship + weights as ML-controlled enemy

---

## Phase 6: Stage-Based PvP Ladder

**Goal:** Replace preset levels with a stage-based PvP system where players fight other players' uploaded fighters.

### Player Journey

1. Design ship on grid
2. Click FIGHT -- system fetches a random Stage N opponent from Firebase
3. If no opponents found (or offline): fall back to a preset ship with random AI
4. Fight in arena -- player actions auto-recorded behind the scenes
5. Fight ends -- brief "Training AI..." spinner while model trains automatically
6. **Win**: Ship+weights uploaded as Stage N fighter, Stage N+1 unlocked, VICTORY banner
7. **Lose**: AI still learns from the fight, DEFEATED banner with Retry option

### Stage Progression

- Stages start at 1 and go as high as the player climbs (no cap)
- Stage N opponents are players who beat Stage N-1 (difficulty scales naturally)
- Progress persisted in `localStorage` key `'currentStage'`
- Completed stages tracked in `localStorage` key `'completedStages'`

### Auto-Training

- Recording starts automatically when arena fight begins (no R key needed)
- Training runs automatically when fight ends (win or lose)
- ~15 epochs, takes 1-3 seconds with a brief loading spinner
- R key and ML panel remain available as power-user/debug tools
