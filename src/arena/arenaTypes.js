// Arena type definitions -- name, visual theme, and hazard configuration

const ARENA_TYPES = {
    base: {
        name: 'The Forge',
        theme: {
            wallColor: 0x4444aa,
            gridColor1: 0x333355,
            gridColor2: 0x222244,
            markerColor: 0x666688,
            backgroundColor: 0x1a1a2e
        },
        hazards: []
    },
    saw: {
        name: 'The Shredder',
        theme: {
            wallColor: 0xaa4422,
            gridColor1: 0x442211,
            gridColor2: 0x331a0d,
            markerColor: 0x886633,
            backgroundColor: 0x2e1a1a
        },
        hazards: [
            { type: 'sawblade', path: 'wallLoop', direction: -1, offsetFraction: 0 },
            { type: 'sawblade', path: 'wallLoop', direction: -1, offsetFraction: 0.5 }
        ]
    },
    energy: {
        name: 'The Conduit',
        theme: {
            wallColor: 0x227788,
            gridColor1: 0x113344,
            gridColor2: 0x0d2233,
            markerColor: 0x33aa88,
            backgroundColor: 0x0d1a2e
        },
        hazards: [
            { type: 'energyball', pathY: 10, count: 1, startOffset: 0 },
            { type: 'energyball', pathY: -10, count: 1, startOffset: 0.5 }
        ]
    }
};

const ARENA_KEYS = Object.keys(ARENA_TYPES);

/**
 * Gets an arena type config by key
 * @param {string} key - Arena key ('base', 'saw', 'energy')
 * @returns {object|null} Arena config or null
 */
function getArenaType(key) {
    return ARENA_TYPES[key] ?? null;
}

/**
 * Picks a random arena type key
 * @returns {string} Random arena key
 */
function getRandomArenaType() {
    return ARENA_KEYS[Math.floor(Math.random() * ARENA_KEYS.length)];
}

/**
 * Resolves an arena type string, handling 'random'
 * @param {string} key - Arena key or 'random'
 * @returns {object} { key, config } with the resolved arena key and its config
 */
function resolveArenaType(key) {
    const resolvedKey = key === 'random' ? getRandomArenaType() : key;
    const config = getArenaType(resolvedKey);
    if (!config) {
        console.warn(`Unknown arena type "${key}", falling back to base`);
        return { key: 'base', config: ARENA_TYPES.base };
    }
    return { key: resolvedKey, config };
}

export { ARENA_TYPES, getArenaType, getRandomArenaType, resolveArenaType };
