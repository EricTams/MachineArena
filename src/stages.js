// Stage progression - tracks which stage the player is on
//
// Stages are the PvP ladder: beat Stage N to unlock Stage N+1.
// Persisted in localStorage so progress survives page reloads.

const STORAGE_KEY = 'currentStage';
const COMPLETED_KEY = 'completedStages';

/**
 * Gets the player's current stage (the one they should fight next).
 * @returns {number} Stage number (starts at 1)
 */
function getCurrentStage() {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? parseInt(stored, 10) : 1;
}

/**
 * Advances to the next stage after a win.
 * Marks the current stage as completed and increments.
 * @returns {number} The new current stage
 */
function advanceStage() {
    const current = getCurrentStage();
    markStageCompleted(current);
    const next = current + 1;
    localStorage.setItem(STORAGE_KEY, String(next));
    console.log(`Advanced to Stage ${next}`);
    return next;
}

/**
 * Marks a stage as completed.
 * @param {number} stage - Stage number to mark
 */
function markStageCompleted(stage) {
    const completed = getCompletedStages();
    completed.add(stage);
    localStorage.setItem(COMPLETED_KEY, JSON.stringify([...completed]));
}

/**
 * Gets the set of all completed stages.
 * @returns {Set<number>} Completed stage numbers
 */
function getCompletedStages() {
    try {
        const stored = localStorage.getItem(COMPLETED_KEY);
        if (!stored) return new Set();
        return new Set(JSON.parse(stored));
    } catch {
        return new Set();
    }
}

export {
    getCurrentStage,
    advanceStage,
    getCompletedStages
};
