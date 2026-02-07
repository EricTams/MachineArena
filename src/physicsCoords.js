// Physics coordinate conversion utilities
// Shared between bin physics (physics.js) and arena physics (arenaPhysics.js)

// Matter.js is loaded globally from CDN
const Body = Matter.Body;

/**
 * Scale factor for converting between world units and physics units
 * World: game coordinates (e.g., grid cells, world positions)
 * Physics: Matter.js internal units
 */
export const PHYSICS_SCALE = 50;

/**
 * Converts world coordinates to physics coordinates
 * @param {number} x - World X position
 * @param {number} y - World Y position
 * @returns {object} Physics position {x, y}
 */
export function worldToPhysics(x, y) {
    return {
        x: x * PHYSICS_SCALE,
        y: -y * PHYSICS_SCALE  // Flip Y (Matter.js Y is down)
    };
}

/**
 * Converts physics coordinates to world coordinates
 * @param {number} x - Physics X position
 * @param {number} y - Physics Y position
 * @returns {object} World position {x, y}
 */
export function physicsToWorld(x, y) {
    return {
        x: x / PHYSICS_SCALE,
        y: -y / PHYSICS_SCALE  // Flip Y back
    };
}

/**
 * Gets the world position and angle from a physics body
 * @param {Matter.Body} body - The physics body
 * @returns {{x: number, y: number, angle: number}} World position and rotation
 */
export function getBodyWorldPos(body) {
    return {
        x: body.position.x / PHYSICS_SCALE,
        y: -body.position.y / PHYSICS_SCALE,
        angle: -body.angle
    };
}

/**
 * Sets the world position of a physics body
 * @param {Matter.Body} body - The physics body
 * @param {number} x - World X position
 * @param {number} y - World Y position
 */
export function setBodyWorldPos(body, x, y) {
    Body.setPosition(body, {
        x: x * PHYSICS_SCALE,
        y: -y * PHYSICS_SCALE
    });
}
