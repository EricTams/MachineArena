// Stage progression - tracks which stage the player is on
//
// Delegates to the run module so that stage progress is tied to the
// current run. Keeps the same API surface so callers don't need to change.

import { getRunStage, advanceRunStage, retreatRunStage, getRunCompletedStages } from './run.js';

/**
 * Gets the player's current stage (the one they should fight next).
 * @returns {number} Stage number (starts at 1)
 */
function getCurrentStage() {
    return getRunStage();
}

/**
 * Advances to the next stage after a win.
 * Marks the current stage as completed and increments.
 * @returns {number} The new current stage
 */
function advanceStage() {
    return advanceRunStage();
}

/**
 * Goes back one stage (minimum 1). For debug/testing only.
 * @returns {number} The new current stage
 */
function retreatStage() {
    return retreatRunStage();
}

/**
 * Gets the set of all completed stages.
 * @returns {Set<number>} Completed stage numbers
 */
function getCompletedStages() {
    return getRunCompletedStages();
}

export {
    getCurrentStage,
    advanceStage,
    retreatStage,
    getCompletedStages
};
