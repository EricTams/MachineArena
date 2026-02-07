// Matter.js physics world for bin simulation

import { PHYSICS_SCALE, worldToPhysics, getBodyWorldPos, setBodyWorldPos } from './physicsCoords.js';

// Matter.js is loaded globally from CDN
const Engine = Matter.Engine;
const World = Matter.World;
const Bodies = Matter.Bodies;
const Body = Matter.Body;

let engine = null;
let world = null;

// Physics configuration
const GRAVITY_Y = 1; // Gravity strength

/**
 * Creates the Matter.js physics world
 */
function createPhysicsWorld() {
    engine = Engine.create();
    world = engine.world;
    
    // Set gravity (positive Y is down in Matter.js)
    engine.gravity.y = GRAVITY_Y;
    engine.gravity.x = 0;
}

/**
 * Steps the physics simulation
 * @param {number} deltaTime - Time since last frame in seconds
 */
function stepPhysics(deltaTime) {
    if (!engine) return;
    
    // Matter.js expects milliseconds, cap delta to avoid instability
    const cappedDelta = Math.min(deltaTime * 1000, 33.33); // Max ~30fps worth
    Engine.update(engine, cappedDelta);
}

/**
 * Creates a physics body for a piece in the bin
 * @param {number} x - World X position
 * @param {number} y - World Y position
 * @param {number} width - Width in world units
 * @param {number} height - Height in world units
 * @param {object} options - Additional Matter.js body options
 * @returns {Matter.Body} The created body
 */
function createPieceBody(x, y, width, height, options = {}) {
    // Convert world units to physics units
    const physPos = worldToPhysics(x, y);
    const pWidth = width * PHYSICS_SCALE;
    const pHeight = height * PHYSICS_SCALE;
    
    const body = Bodies.rectangle(physPos.x, physPos.y, pWidth, pHeight, {
        restitution: 0.2,
        friction: 0.5,
        frictionAir: 0.02,
        ...options
    });
    
    World.add(world, body);
    return body;
}

/**
 * Removes a physics body from the world
 * @param {Matter.Body} body - The body to remove
 */
function removePieceBody(body) {
    if (body && world) {
        World.remove(world, body);
    }
}

/**
 * Gets the world position from a physics body
 * @param {Matter.Body} body - The physics body
 * @returns {{x: number, y: number, angle: number}} World position and rotation
 */
function getBodyWorldPosition(body) {
    return getBodyWorldPos(body);
}

/**
 * Sets the world position of a physics body
 * @param {Matter.Body} body - The physics body
 * @param {number} x - World X position
 * @param {number} y - World Y position
 */
function setBodyWorldPosition(body, x, y) {
    setBodyWorldPos(body, x, y);
}

/**
 * Sets whether a body is static (immovable)
 * @param {Matter.Body} body - The physics body
 * @param {boolean} isStatic - True to make static
 */
function setBodyStatic(body, isStatic) {
    Body.setStatic(body, isStatic);
}

/**
 * Sets the angle of a physics body
 * @param {Matter.Body} body - The physics body
 * @param {number} angle - World angle in radians
 */
function setBodyAngle(body, angle) {
    Body.setAngle(body, -angle); // Flip angle for physics coordinates
}

/**
 * Resets a body's velocity to zero
 * @param {Matter.Body} body - The physics body
 */
function resetBodyVelocity(body) {
    Body.setVelocity(body, { x: 0, y: 0 });
    Body.setAngularVelocity(body, 0);
}

function getEngine() { return engine; }
function getWorld() { return world; }
function getPhysicsScale() { return PHYSICS_SCALE; }

export {
    createPhysicsWorld,
    stepPhysics,
    createPieceBody,
    removePieceBody,
    getBodyWorldPosition,
    setBodyWorldPosition,
    setBodyStatic,
    setBodyAngle,
    resetBodyVelocity,
    getEngine,
    getWorld,
    getPhysicsScale
};
