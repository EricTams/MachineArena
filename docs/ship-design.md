# Ship Design

Design decisions for the ship designer: grid, parts bin, piece types, placement, and physics. Inspired by Backpack Battles; the main addition is a **core** (if it dies, the ship dies). Implementation must follow this doc and [tech-stack.md](tech-stack.md).

---

## 1. Overview and inspiration

- **Summary:** Grid-based ship designer with a parts bin below (or beside) the grid. Player designs the ship on the grid; unplaced or displaced pieces live in the bin.
- **Placement:** Placement rules and behavior are the same in the designer and in the arena. **One code path** for placement—no separate logic for "initial" vs "placed" vs "arena."

---

## 2. Layout

- **Grid:** A logical grid (coordinates/cells) where the player designs the ship. Pieces snap to the grid. Implementation uses game/physics coordinates and validity checks—**not** an HTML grid (no tables or divs as the grid).
- **Parts bin:** Region below (or beside) the grid. Anything not placed on the grid lives here and is **physically simulated** (Matter.js). Unplaced loot and displaced or overflow pieces end up here.

---

## 3. Physics and placement states

- **On grid:** A piece that is validly placed on the grid has **no physics** (fixed; part of the ship).
- **In bin / displaced:** A piece in the bin or that has fallen off (e.g. block removed) is **physically simulated** (gravity, stacking, collision).
- **Place block on existing block:** Displaces the old block (it pops out). Any equipment that no longer fits goes to the bin. Displaced block and overflow are simulated in the bin. No nested containers.

---

## 4. Piece types

- **Blocks:** Structural; provide buildable space (analogue of Backpack Battles "bags"). Main purpose: innate stats and providing space. May have extra properties.
- **Equipment:** Can only be placed **on** blocks (not on empty grid). When the supporting block is removed or displaced, equipment falls into the bin and is simulated there.

---

## 5. Core

- Every ship has a **core**. It has the basic things required for the ship to run.
- **If the core is destroyed, the ship is dead.**
- All ships start with a core in the designer.

---

## 6. Piece representation

- **Position and orientation:** All pieces have position and orientation (for placement and simulation).
- **Graphics vs simulation:** Pieces may have complex 3D art (Three.js) but **simulate as simple convex shapes** (e.g. for Matter.js). Low-poly discrete pieces per [tech-stack.md](tech-stack.md) remain valid for destructible FX.
- **Stats:** Numerical values that describe what a block (or equipment) does. Exact stat set deferred to implementation; this doc only states that pieces have numerical stats.

---

## 7. Designer to arena

- When going from designer to arena, all blocks (and their equipment) are **glued into one collision object** (or equivalent) for the arena.
- Placement rules and piece data are unchanged; only the physics representation changes (single rigid body vs per-piece fixed/bin state).

---

## 8. Single placement path (requirement)

- **All placement code must go through one path.** Same rules and logic for: initial ship/core setup, player-placed pieces in the designer, and ship state in the arena.
- No duplicate placement logic for "initial" vs "placed" vs "arena."

---

## 9. References

- [tech-stack.md](tech-stack.md): Matter.js (2D physics), Three.js (3D rendering), platform and hosting constraints.
