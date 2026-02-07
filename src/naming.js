// Naming module - sci-fi "Adjective Adjective Noun" player name generator
//
// Generates memorable player names, persists to localStorage,
// and provides sanitization for use as document IDs.

const STORAGE_KEY = 'playerName';
const MAX_DOC_ID_LENGTH = 60;

// ============================================================================
// Sci-fi word lists
// ============================================================================

const ADJECTIVES = [
    'Crimson', 'Phantom', 'Volatile', 'Silent', 'Orbital',
    'Fractal', 'Plasma', 'Void', 'Chrome', 'Neon',
    'Feral', 'Rogue', 'Quantum', 'Burning', 'Frozen',
    'Iron', 'Savage', 'Hollow', 'Warp', 'Obsidian',
    'Radiant', 'Jagged', 'Spectral', 'Molten', 'Blight',
    'Cobalt', 'Ashen', 'Primal', 'Dread', 'Lunar',
    'Solar', 'Bitter', 'Rapid', 'Toxic', 'Arc',
    'Barren', 'Gilded', 'Rusted', 'Storm', 'Null',
    'Vivid', 'Bleak', 'Swift', 'Fierce', 'Bright'
];

const NOUNS = [
    'Sentinel', 'Wraith', 'Vanguard', 'Corsair', 'Reaver',
    'Specter', 'Titan', 'Drifter', 'Harbinger', 'Marauder',
    'Raptor', 'Nomad', 'Anvil', 'Shard', 'Warden',
    'Cipher', 'Vector', 'Talon', 'Nexus', 'Fang',
    'Bulwark', 'Revenant', 'Scourge', 'Beacon', 'Aegis',
    'Comet', 'Pylon', 'Striker', 'Phantom', 'Forge',
    'Lance', 'Conduit', 'Monolith', 'Eclipse', 'Surge'
];

// ============================================================================
// Name generation
// ============================================================================

/** Picks a random element from an array */
function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Generates a random "Adjective Adjective Noun" name.
 * Ensures the two adjectives are different.
 * @returns {string} e.g. "Crimson Volatile Sentinel"
 */
function generateName() {
    const adj1 = pickRandom(ADJECTIVES);
    let adj2 = pickRandom(ADJECTIVES);
    while (adj2 === adj1) {
        adj2 = pickRandom(ADJECTIVES);
    }
    const noun = pickRandom(NOUNS);
    return `${adj1} ${adj2} ${noun}`;
}

// ============================================================================
// Sanitization
// ============================================================================

/**
 * Sanitizes a display name for use as a Firestore document ID segment.
 * Lowercase, spaces to hyphens, strip non-alphanumeric/hyphen, truncate.
 * @param {string} name - Display name
 * @returns {string} e.g. "crimson-volatile-sentinel"
 */
function sanitizeForDocId(name) {
    return name
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .slice(0, MAX_DOC_ID_LENGTH);
}

// ============================================================================
// Persistence (localStorage)
// ============================================================================

/**
 * Returns the stored player name, or null if not set yet.
 * @returns {string|null}
 */
function getPlayerName() {
    return localStorage.getItem(STORAGE_KEY);
}

/**
 * Saves the player name to localStorage.
 * @param {string} name - Display name to store
 */
function setPlayerName(name) {
    localStorage.setItem(STORAGE_KEY, name);
}

/**
 * Whether the player still needs to choose a name (first visit).
 * @returns {boolean}
 */
function needsPlayerName() {
    return !getPlayerName();
}

export {
    generateName,
    sanitizeForDocId,
    getPlayerName,
    setPlayerName,
    needsPlayerName
};
