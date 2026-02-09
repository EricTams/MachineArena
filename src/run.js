// Run module - manages a single playthrough ("run")
//
// A run ties together the ship name, stage progression, money, and a version
// stamp. Bumping RUN_VERSION invalidates all old runs, forcing a fresh start.

const RUN_STORAGE_KEY = 'currentRun';

// Bump this to invalidate all existing runs (forces players to start fresh)
const RUN_VERSION = 1;

// Every new run starts with this much money
const STARTING_MONEY = 15;

// ============================================================================
// Core run CRUD
// ============================================================================

/**
 * Returns the current run object from localStorage, or null if none exists.
 * @returns {{ shipName: string, stage: number, completedStages: number[], money: number, runVersion: number } | null}
 */
function getCurrentRun() {
    try {
        const raw = localStorage.getItem(RUN_STORAGE_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

/**
 * Returns true if a valid run exists with a matching runVersion.
 * @returns {boolean}
 */
function hasValidRun() {
    const run = getCurrentRun();
    return run !== null && run.runVersion === RUN_VERSION;
}

/**
 * Creates and persists a brand-new run.
 * Overwrites any previous run data.
 * @param {string} shipName - Three-word ship name for this run
 */
function startNewRun(shipName) {
    const run = {
        shipName,
        stage: 1,
        completedStages: [],
        money: STARTING_MONEY,
        runVersion: RUN_VERSION
    };
    localStorage.setItem(RUN_STORAGE_KEY, JSON.stringify(run));

    // Clear legacy standalone keys so they don't confuse anything
    localStorage.removeItem('currentStage');
    localStorage.removeItem('completedStages');
    localStorage.removeItem('shipName');

    console.log(`New run started: "${shipName}" (stage 1, ${STARTING_MONEY} credits)`);
}

/** Persists the run object (internal helper). */
function _saveRun(run) {
    localStorage.setItem(RUN_STORAGE_KEY, JSON.stringify(run));
}

/**
 * Removes the current run from localStorage.
 */
function clearRun() {
    localStorage.removeItem(RUN_STORAGE_KEY);
}

// ============================================================================
// Stage helpers (read/write stage within the run)
// ============================================================================

/**
 * Gets the current stage from the active run.
 * Falls back to 1 if no run exists.
 * @returns {number}
 */
function getRunStage() {
    const run = getCurrentRun();
    return run ? run.stage : 1;
}

/**
 * Advances the run to the next stage after a win.
 * Marks the current stage as completed.
 * @returns {number} The new stage number
 */
function advanceRunStage() {
    const run = getCurrentRun();
    if (!run) return 1;

    if (!run.completedStages.includes(run.stage)) {
        run.completedStages.push(run.stage);
    }
    run.stage += 1;
    _saveRun(run);
    console.log(`Advanced to Stage ${run.stage}`);
    return run.stage;
}

/**
 * Goes back one stage (minimum 1). For debug/testing only.
 * @returns {number} The new stage number
 */
function retreatRunStage() {
    const run = getCurrentRun();
    if (!run) return 1;

    run.stage = Math.max(1, run.stage - 1);
    _saveRun(run);
    console.log(`Retreated to Stage ${run.stage}`);
    return run.stage;
}

/**
 * Gets the set of completed stages from the active run.
 * @returns {Set<number>}
 */
function getRunCompletedStages() {
    const run = getCurrentRun();
    if (!run) return new Set();
    return new Set(run.completedStages);
}

// ============================================================================
// Ship name helper
// ============================================================================

/**
 * Returns the ship name for the current run, or 'unnamed' if no run.
 * @returns {string}
 */
function getRunShipName() {
    const run = getCurrentRun();
    return run ? run.shipName : 'unnamed';
}

// ============================================================================
// Money helpers
// ============================================================================

/**
 * Returns the player's current money in the active run.
 * @returns {number}
 */
function getRunMoney() {
    const run = getCurrentRun();
    return run ? run.money : 0;
}

/**
 * Spends money (subtracts amount). Returns false if insufficient funds.
 * @param {number} amount
 * @returns {boolean} true if successful
 */
function spendMoney(amount) {
    const run = getCurrentRun();
    if (!run || run.money < amount) return false;
    run.money -= amount;
    _saveRun(run);
    return true;
}

/**
 * Adds money to the current run.
 * @param {number} amount
 */
function addMoney(amount) {
    const run = getCurrentRun();
    if (!run) return;
    run.money += amount;
    _saveRun(run);
}

// ============================================================================
// Inventory helpers (grid layout + bin pieces)
// ============================================================================

/**
 * Saves the player's current inventory (grid layout + bin piece types) into the run.
 * Call this after any buy, sell, drop, or rotate so pieces survive a reload.
 * @param {Array<{type: string, col: number, row: number, angle: number}>} gridLayout
 * @param {string[]} binPieceTypes - Array of piece type strings in the bin
 */
function saveInventory(gridLayout, binPieceTypes) {
    const run = getCurrentRun();
    if (!run) return;
    run.gridLayout = gridLayout;
    run.binPieces = binPieceTypes;
    _saveRun(run);
}

/**
 * Returns the saved inventory from the current run, or null if none exists.
 * @returns {{ gridLayout: Array, binPieces: string[] } | null}
 */
function getRunInventory() {
    const run = getCurrentRun();
    if (!run || !run.gridLayout) return null;
    return {
        gridLayout: run.gridLayout,
        binPieces: run.binPieces || []
    };
}

// ============================================================================
// Exports
// ============================================================================

export {
    RUN_VERSION,
    STARTING_MONEY,
    getCurrentRun,
    hasValidRun,
    startNewRun,
    clearRun,
    getRunStage,
    advanceRunStage,
    retreatRunStage,
    getRunCompletedStages,
    getRunShipName,
    getRunMoney,
    spendMoney,
    addMoney,
    saveInventory,
    getRunInventory
};
