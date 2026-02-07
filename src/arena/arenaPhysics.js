// Arena physics - zero-gravity simulation with boundary walls

import { PHYSICS_SCALE, worldToPhysics, getBodyWorldPos, setBodyWorldPos } from '../physicsCoords.js';

// Matter.js is loaded globally from CDN
const Engine = Matter.Engine;
const World = Matter.World;
const Bodies = Matter.Bodies;
const Body = Matter.Body;
const Composite = Matter.Composite;

// Arena configuration
const ARENA_WIDTH = 80;
const ARENA_HEIGHT = 60;
const WALL_THICKNESS = 2;

let arenaEngine = null;
let arenaWorld = null;
let walls = [];

/**
 * Creates the arena physics world with zero gravity
 */
function createArenaPhysics() {
    arenaEngine = Engine.create();
    arenaWorld = arenaEngine.world;
    
    // Zero gravity for space simulation
    arenaEngine.gravity.y = 0;
    arenaEngine.gravity.x = 0;
    
    // Create boundary walls
    createArenaWalls();
    
    return { engine: arenaEngine, world: arenaWorld };
}

/**
 * Creates the arena boundary walls
 */
function createArenaWalls() {
    const halfWidth = ARENA_WIDTH / 2;
    const halfHeight = ARENA_HEIGHT / 2;
    const halfThick = WALL_THICKNESS / 2;
    
    // Convert to physics coordinates
    const scale = PHYSICS_SCALE;
    
    // Top wall
    const topWall = Bodies.rectangle(
        0, 
        -(halfHeight + halfThick) * scale,
        ARENA_WIDTH * scale,
        WALL_THICKNESS * scale,
        { isStatic: true, label: 'wall_top' }
    );
    
    // Bottom wall
    const bottomWall = Bodies.rectangle(
        0,
        (halfHeight + halfThick) * scale,
        ARENA_WIDTH * scale,
        WALL_THICKNESS * scale,
        { isStatic: true, label: 'wall_bottom' }
    );
    
    // Left wall
    const leftWall = Bodies.rectangle(
        -(halfWidth + halfThick) * scale,
        0,
        WALL_THICKNESS * scale,
        (ARENA_HEIGHT + WALL_THICKNESS * 2) * scale,
        { isStatic: true, label: 'wall_left' }
    );
    
    // Right wall
    const rightWall = Bodies.rectangle(
        (halfWidth + halfThick) * scale,
        0,
        WALL_THICKNESS * scale,
        (ARENA_HEIGHT + WALL_THICKNESS * 2) * scale,
        { isStatic: true, label: 'wall_right' }
    );
    
    walls = [topWall, bottomWall, leftWall, rightWall];
    World.add(arenaWorld, walls);
}

/**
 * Steps the arena physics simulation
 * @param {number} deltaTime - Time since last frame in seconds
 */
function stepArenaPhysics(deltaTime) {
    if (!arenaEngine) return;
    
    const cappedDelta = Math.min(deltaTime * 1000, 33.33);
    Engine.update(arenaEngine, cappedDelta);
}

/**
 * Adds a body to the arena world
 * @param {Matter.Body} body - The body to add
 */
function addToArena(body) {
    if (arenaWorld && body) {
        World.add(arenaWorld, body);
    }
}

/**
 * Removes a body from the arena world
 * @param {Matter.Body} body - The body to remove
 */
function removeFromArena(body) {
    if (arenaWorld && body) {
        World.remove(arenaWorld, body);
    }
}

/**
 * Applies a force to a body at a specific world position
 * This creates torque if the position is offset from center of mass
 * @param {Matter.Body} body - The physics body
 * @param {object} worldPos - World position {x, y} to apply force at
 * @param {object} force - Force vector {x, y} in world units
 */
function applyForceAtPosition(body, worldPos, force) {
    // Convert world position to physics position
    const physPos = worldToPhysics(worldPos.x, worldPos.y);
    
    // Convert force to physics scale (flip Y)
    const physForce = {
        x: force.x * PHYSICS_SCALE * 0.001, // Scale down for reasonable acceleration
        y: -force.y * PHYSICS_SCALE * 0.001
    };
    
    Body.applyForce(body, physPos, physForce);
}

/**
 * Applies torque to rotate a body
 * @param {Matter.Body} body - The physics body
 * @param {number} torque - Torque value in world space (positive = counter-clockwise)
 */
function applyTorque(body, torque) {
    // Convert world convention (positive = CCW) to Matter.js convention (positive = CW)
    const physicsTorque = -torque;
    const angularAccel = physicsTorque / body.mass;
    Body.setAngularVelocity(body, body.angularVelocity + angularAccel * 0.016);
}

/**
 * Gets the world position from a physics body
 * @param {Matter.Body} body - The physics body
 * @returns {{x: number, y: number, angle: number}} World position and rotation
 */
function getArenaBodyPosition(body) {
    return getBodyWorldPos(body);
}

/**
 * Sets the position of a physics body in world coordinates
 * @param {Matter.Body} body - The physics body
 * @param {number} x - World X position
 * @param {number} y - World Y position
 */
function setArenaBodyPosition(body, x, y) {
    setBodyWorldPos(body, x, y);
}

/**
 * Clears the arena physics world
 */
function clearArenaPhysics() {
    if (arenaWorld) {
        World.clear(arenaWorld, false);
        walls = [];
    }
    if (arenaEngine) {
        Engine.clear(arenaEngine);
    }
    arenaEngine = null;
    arenaWorld = null;
}

function getArenaEngine() { return arenaEngine; }
function getArenaWorld() { return arenaWorld; }
function getArenaPhysicsScale() { return PHYSICS_SCALE; }
function getArenaDimensions() { return { width: ARENA_WIDTH, height: ARENA_HEIGHT }; }

export {
    createArenaPhysics,
    stepArenaPhysics,
    addToArena,
    removeFromArena,
    applyForceAtPosition,
    applyTorque,
    getArenaBodyPosition,
    setArenaBodyPosition,
    clearArenaPhysics,
    getArenaEngine,
    getArenaWorld,
    getArenaPhysicsScale,
    getArenaDimensions
};
