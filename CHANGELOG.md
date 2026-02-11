# Changelog

## v0.2.1 — Feb 10, 2026

### TL;DR

Landing screen now shows a per-stage opponent count table so players can see where fighters are available before starting. All thruster thrust values doubled across every tier for faster, punchier combat. Arena freezes during post-fight auto-training so the simulation doesn't keep running in the background. Torque physics fixed to use inertia instead of mass, and several shop-drag interaction bugs squashed.

---

### New Features

#### Landing Screen — Stage Opponent Counts
- **Two-column layout**: landing content is now split into a left column (pilot name, run info, buttons) and a right column (stage opponent table)
- **Per-stage table**: shows Compatible, Outdated, and Total fighter counts for each stage, color-coded (green/yellow/red) by compatible count
- CSS for `#landing-stage-counts`, `#stage-counts-table`, loading state, and responsive column layout

#### `src/firebase.js` — `fetchFighterCountsByStage()`
- New function that pulls all fighters from Firestore and returns a `{ stageNum: { total, compatible } }` map
- Compatible = fighter's `schemaVersion` matches current `SCHEMA_VERSION`
- Imports `SCHEMA_VERSION` from `src/ml/schema.js`

#### `src/arena/arena.js` — Arena Pause
- New `paused` flag in `arenaState`; when true, `updateArena()` skips simulation entirely (scene stays rendered but frozen)
- New exported `pauseArena()` function; reset on `exitArena()`

---

### Balance Changes

#### Thruster Thrust Values — 2x Across All Tiers
- **Rustbucket Pusher** (starter): 0.35 → 0.7
- **Ignis Slow-Burn** (starter): 0.7 → 1.4
- **Inferno 470** (common): 0.9 → 1.8
- **Gemini Sidecar** (common): 0.5/0.5 → 1.0/1.0 (main + side)
- **Torrent Retrojet** (uncommon): 0.7/0.7 → 1.4/1.4 (main + back)
- **Volkov KR-7** (uncommon): 0.95 → 1.9
- **Axiom PD-7** (rare): 1.0 → 2.0

---

### Bug Fixes

#### `src/arena/arenaPhysics.js` — Torque Calculation
- `applyTorque()` now divides by `body.inertia` instead of `body.mass` — correct rotational physics

#### `src/input.js` — Shop Drag Interactions
- Shop panel `pointerEvents` set to `'none'` during drag so mouse events pass through to the canvas
- Shop-bought pieces always place on drop (removed accidental sell-on-drop behavior)
- Removed sell-zone hover highlight during shop-drag (only applies to existing pieces)
- Pointer events restored on `mouseUp`

---

### Integration

#### `src/main.js`
- Imports `pauseArena` and `fetchFighterCountsByStage`
- Calls `pauseArena()` before auto-training in both custom-fight and stage-fight end handlers — prevents simulation from continuing during training
- Builds and populates the stage-counts table on the landing screen when online

---

## v0.2 — Feb 9, 2026

### TL;DR

Added a full run-based progression system with a shop, money/credits economy, and tiered equipment. Players now start with cheap starter gear and earn credits by winning stage fights to buy better parts from a randomized shop. Cannons and thrusters come in four rarity tiers (starter, common, uncommon, rare), each with unique stats, behaviors, and 3D meshes. The landing screen supports continuing an existing run or starting fresh.

---

### New Files (10)

#### `src/run.js` — Run Progression System
- Manages a single playthrough ("run") persisted in localStorage
- Tracks ship name, current stage, completed stages, money, and inventory
- Starts new runs with 15 credits; bumping `RUN_VERSION` invalidates old saves
- Functions: `startNewRun`, `hasValidRun`, `getCurrentRun`, `clearRun`
- Stage helpers: `getRunStage`, `advanceRunStage`, `retreatRunStage`
- Money helpers: `getRunMoney`, `spendMoney`, `addMoney`
- Inventory helpers: `saveInventory`, `getRunInventory` (grid layout + bin pieces)

#### `src/shop.js` — Shop Panel (725 lines)
- Always-visible HTML panel on the right side during design mode
- 6 randomized item slots per roll, weighted by rarity: starter 50%, common 30%, uncommon 15%, rare 5%
- Reroll costs 1 credit; free reroll on stage win
- Click-to-buy creates the piece and starts dragging it immediately (via custom event)
- Drag-to-sell zone with refund at half cost (rounded up); cannot sell the core
- Rich tooltips showing stats, tier, description on hover
- Credits flash animation on buy/sell; red flash on insufficient funds
- Item pool built dynamically from all block + equipment definitions

#### `src/pieces/cannons/starterCannons.js` — Starter Cannons
- **Popgun** — 1x2, 2 credits. Rapid-fire peashooter: 1 damage, fast reload (1.0s), high spread (0.15), short range
- **Ferros SP-1** — 2x1, 3 credits. Budget single-shot: 3 damage, slow reload (2.8s), sloppy accuracy, wide footprint

#### `src/pieces/cannons/commonCannons.js` — Common Cannons
- **Thumper** — 1x1, 4 credits. Reliable mid-range workhorse: 3 damage, 2.0s reload, tight spread (replaces old generic `cannon`)
- **Volk-42** — 1x1, 5 credits. 2-round burst cannon: 2 damage per shot, military look

#### `src/pieces/cannons/uncommonCannons.js` — Uncommon Cannons
- **Hailfire** — 2x1, 12 credits. 3-round burst suppression: 3 damage/shot, wide 120-degree arc
- **Drake LP-30** — 1x2, 11 credits. Precision sniper: 6 damage, 34 projectile speed, 0.02 spread, narrow 45-degree arc

#### `src/pieces/cannons/rareCannons.js` — Rare Cannons
- **Hyperion RG-X** — 1x4, 28 credits. Railgun: 18 damage, 60 speed, penetrating shots, 4.5s reload, zero spread

#### `src/pieces/thrusters/starterThrusters.js` — Starter Thrusters
- **Rustbucket Pusher** — 1 credit. Cheap and heavy (0.7 mass), weak thrust (0.35)
- **Ignis Slow-Burn** — 3 credits. Ramp-up behavior: starts at 20% thrust, reaches full 0.7 force after 1.0s

#### `src/pieces/thrusters/commonThrusters.js` — Common Thrusters
- **Inferno 470** — 3 credits. High thrust (0.9) but overheats if used >60% of last 10 seconds; 3s cooldown when overheated
- **Gemini Sidecar** — 4 credits. Dual-nozzle: 0.5 main thrust + 0.5 perpendicular side thrust from one mount

#### `src/pieces/thrusters/uncommonThrusters.js` — Uncommon Thrusters
- **Torrent Retrojet** — 5 credits. 0.7 thrust + built-in reverse nozzle (0.7 back thrust)
- **Volkov KR-7** — 6 credits. Near-rare power (0.95), short ramp-up (0.5s from 40%)

#### `src/pieces/thrusters/rareThrusters.js` — Rare Thrusters
- **Axiom PD-7** — 12 credits. The original thruster, now rare: 1.0 thrust, 0.3 mass, zero drawbacks

---

### Modified Files (14)

#### `index.html`
- **Landing screen redesign**: Continue/New Run buttons when a valid run exists; new ship name + Start New Run when no run
- New elements: `#landing-run-info`, `#landing-new-ship`, `#landing-continue-btns`
- Added `#money-display` in toolbar (green credits counter)
- Added `#shop-panel` container div
- CSS for secondary buttons, run info display, money display
- Version timestamp updated to Feb 9, 2026 9:12 AM

#### `src/main.js`
- Imports new modules: `run.js`, `shop.js`; new imports from `bin.js`, `piece.js`, `naming.js`
- **Landing screen rewrite**: detects valid run, shows appropriate UI (continue vs new run), reroll generates ship names
- **Ship presets overhauled**: `starter` preset uses scrap blocks + popgun + rustbucket thrusters; old starter renamed to `balanced` with Axiom PD-7s; gunboat uses Torrent Retrojets; speeder uses Inferno 470s; tank uses mix of Rustbucket, Volkov, Ignis
- **Inventory persistence**: on load, restores saved grid layout + bin pieces from run, or saves current state for new runs
- **Shop integration**: `initShop()` on setup, `showShop()`/`hideShop()` toggled with design mode, `rollShop()` on stage win
- **Money display**: `updateMoneyDisplay()` refreshes toolbar credits; +10 credits on stage win
- `showDesignMode()` now toggles shop panel and money display visibility

#### `src/stages.js`
- Completely refactored: removed direct localStorage usage
- Now delegates to `run.js` functions (`getRunStage`, `advanceRunStage`, `retreatRunStage`, `getRunCompletedStages`)
- Same API surface so callers don't need changes

#### `src/pieces/equipment.js`
- **Central registry**: spreads all tier definitions from 8 sub-files into one `EQUIPMENT_DEFINITIONS` object
- **Legacy type migration**: maps old `'thruster'` -> `'thruster_axiom_pd7'`, `'cannon'` -> `'cannon_thumper'` for backward compatibility
- **Type helpers**: `isThrusterType()`, `isCannonType()`, `getEquipmentType()`, `resolveLegacyType()`
- **Mesh routing**: `createEquipmentMesh()` routes to appropriate tier mesh builder; fallback generic meshes for unknown types
- Fallback cannon/thruster meshes support multi-cell mounting plates

#### `src/pieces/piece.js`
- `createPiece()` and `createPieceForGrid()` resolve legacy types before lookup
- `getPieceDefinition()` resolves legacy types
- New `getGridZ()` function: equipment renders at z=0.2, blocks/core at z=0
- `generatePieceId()` now exported (shared counter prevents duplicate IDs)
- `spawnInitialParts()` updated to use starter-tier pieces (scrap blocks, popgun, rustbuckets)

#### `src/pieces/blocks.js`
- **New block types**: `block_scrap_1x1` (starter, 3 HP), `block_scrap_2x1` (starter, 7 HP), `block_armor_1x1` (uncommon, 12 HP)
- All blocks now have `tier`, `cost`, and optional `description` fields
- Mesh creation uses tier-based visual tweaks: starter blocks are thinner/rougher, uncommon blocks are thicker/shinier

#### `src/arena/arenaShip.js`
- Uses `isThrusterType()` / `isCannonType()` instead of string equality checks
- **Virtual thrusters**: side thrust (Gemini) and back thrust (Torrent) inject additional thruster entries with `isVirtual: true`
- Thruster runtime state: `activeTime`, `firedThisFrame`, `usageHistory`, `overheated`, `cooldownTimer`, `rampUp`, `overheat` config
- Cannons now track `spread`, `burstCount`, `burstDelay`, `penetrating`, `burstRemaining`, `burstTimer`

#### `src/arena/thrustSystem.js`
- New `isThrusterInactive()` — checks disabled OR overheated
- New `getRampUpMultiplier()` — linear interpolation from startPercent to 1.0 over rampTime
- `applyThrusterForce()` now marks `firedThisFrame`, applies ramp-up multiplier, skips inactive thrusters
- New `updateThrusterState()` (called once per frame after thrust application):
  - Ramp-up tracking: increments `activeTime` while firing, resets on stop
  - Overheat tracking: sliding window usage ratio, triggers cooldown when over threshold
  - Virtual thruster sync: disables when parent is disabled

#### `src/arena/weaponSystem.js`
- **Burst firing**: `updateCannonReloads()` handles burst shot scheduling with `burstRemaining`/`burstTimer`
- **Spread**: random deviation within `[-spread, +spread]` applied to firing angle
- **Penetrating projectiles**: continue through parts, damage decremented by HP absorbed; removed when damage reaches 0
- `spawnProjectile()` accepts `penetrating` parameter, stored on projectile
- `checkProjectileCollisions()` uses `shouldRemove` flag instead of `hit` for penetrating logic
- Equipment type checks use `isThrusterType()`/`isCannonType()`

#### `src/arena/arena.js`
- Imports and calls `updateThrusterState(ship, deltaTime)` each frame after controller updates

#### `src/input.js`
- **Shop drag-to-buy**: listens for `shop-piece-bought` custom event, starts dragging the new piece
- **Sell zone integration**: `onMouseMove` and `onMouseUp` check `isInsideSellZone()` and call `handleSellPiece()`
- `findPieceAtPosition()` now does two passes: equipment first (renders on top), then blocks — fixes pick priority

#### `src/layout.js`
- Uses shared `generatePieceId()` from `piece.js` instead of local counter
- Mesh Z position uses `getGridZ()` for proper equipment-above-block layering

#### `src/placement.js`
- Uses `getGridZ()` for mesh Z positions across `placePieceOnGrid`, `dropPiece`, `rotatePiece`
- Physics body dimensions always use `piece.definition.width/height` (fixes cumulative swap bug on repeated pick-ups)
- `dropPiece()` and `rotatePiece()` now call `saveInventory()` to persist changes

#### `src/statsPanel.js`
- New `buildBlockStats()` section: shows tier and HP for blocks
- Equipment stats show tier and cost
- Cannon stats: unchanged fields plus new spread/burst info
- Thruster stats: shows side thrust, back thrust, ramp-up time/start power, overheat threshold/cooldown
