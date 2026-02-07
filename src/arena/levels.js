// Level definitions - enemy configurations for each level
// Player always spawns at bottom of arena, enemies spawn toward top

// Arena is 80x60 units, centered at origin
// Y ranges from -30 (bottom) to +30 (top)
// X ranges from -40 (left) to +40 (right)

const LEVELS = {
    1: {
        name: "Level 1: Speeder",
        description: "A fast enemy with random movements",
        enemies: [
            {
                preset: "speeder",
                controller: "random",
                spawnX: 0,
                spawnY: 15
            }
        ],
        playerSpawn: { x: 0, y: -20 }
    },
    2: {
        name: "Level 2: Tank",
        description: "A heavy armored enemy - slow but tough",
        enemies: [
            {
                preset: "tank",
                controller: "random",
                spawnX: 0,
                spawnY: 15
            }
        ],
        playerSpawn: { x: 0, y: -20 }
    }
    // AIDEV-TODO: Add more levels as needed
};

/**
 * Gets a level definition by ID
 * @param {number} levelId - Level ID
 * @returns {object|null} Level definition or null if not found
 */
function getLevel(levelId) {
    return LEVELS[levelId] ?? null;
}

/**
 * Gets all available level IDs
 * @returns {number[]} Array of level IDs
 */
function getLevelIds() {
    return Object.keys(LEVELS).map(Number);
}

/**
 * Gets level info for UI display
 * @returns {Array} Array of {id, name} objects
 */
function getLevelList() {
    return Object.entries(LEVELS).map(([id, level]) => ({
        id: Number(id),
        name: level.name
    }));
}

export {
    LEVELS,
    getLevel,
    getLevelIds,
    getLevelList
};
