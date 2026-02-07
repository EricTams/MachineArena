// Controllers - Input abstraction layer for ships
// Controllers produce input state that drives ship movement and actions

import { applyDirectionalThrust, applyAngularThrust, applyAngularThrustDirection, applyRotationThrusters } from './thrustSystem.js';
import { getArenaPhysicsScale } from './arenaPhysics.js';
import { fireAllCannons } from './weaponSystem.js';
import { angleTo, angleDiff } from '../math.js';

/**
 * Creates an empty input state object
 * @returns {object} Empty input state
 */
function createEmptyInput() {
    return {
        forward: false,
        back: false,
        left: false,
        right: false,
        turnLeft: false,
        turnRight: false,
        turnToward: null,   // {x, y} world position to turn toward, or null
        fastTurn: false,    // If true, use thrusters to assist rotation
        fire: false,
        aimTarget: null     // {x, y} world position for aiming, or null
    };
}

/**
 * Applies input state to a ship (movement, rotation, firing)
 * @param {object} ship - Arena ship object
 * @param {object} input - Input state from a controller
 * @returns {Array} Active thrust info for debug visualization
 */
function applyInputToShip(ship, input) {
    if (!ship || !ship.body) return [];
    
    const activeThrusts = [];
    
    // Apply movement thrust based on directional inputs
    if (input.forward) {
        const thrusts = applyDirectionalThrust(ship, 'forward', 1.0);
        activeThrusts.push(...thrusts);
    }
    if (input.back) {
        const thrusts = applyDirectionalThrust(ship, 'back', 1.0);
        activeThrusts.push(...thrusts);
    }
    if (input.left) {
        const thrusts = applyDirectionalThrust(ship, 'left', 1.0);
        activeThrusts.push(...thrusts);
    }
    if (input.right) {
        const thrusts = applyDirectionalThrust(ship, 'right', 1.0);
        activeThrusts.push(...thrusts);
    }
    
    // Apply manual rotation from turnLeft/turnRight
    if (input.turnLeft) {
        applyAngularThrustDirection(ship, -1, 1.0);
        // Fast Turn: fire thrusters that help with CCW rotation
        if (input.fastTurn) {
            const thrusts = applyRotationThrusters(ship, -1, 1.0);
            activeThrusts.push(...thrusts);
        }
    }
    if (input.turnRight) {
        applyAngularThrustDirection(ship, 1, 1.0);
        // Fast Turn: fire thrusters that help with CW rotation
        if (input.fastTurn) {
            const thrusts = applyRotationThrusters(ship, 1, 1.0);
            activeThrusts.push(...thrusts);
        }
    }
    
    // Apply rotation toward target position
    if (input.turnToward) {
        const scale = getArenaPhysicsScale();
        const shipX = ship.body.position.x / scale;
        const shipY = -ship.body.position.y / scale;
        
        // Offset by -π/2 because ship's forward is +Y (top of designer), not +X
        const targetAngle = angleTo(shipX, shipY, input.turnToward.x, input.turnToward.y) - Math.PI / 2;
        
        applyAngularThrust(ship, targetAngle, 1.0);
        
        // Fast Turn: fire thrusters that help with rotation
        if (input.fastTurn) {
            // Calculate rotation direction needed (shortest path)
            const currentAngle = -ship.body.angle;
            const angDiff = angleDiff(targetAngle, currentAngle);
            
            // Fire thrusters that create torque in the needed direction
            // angDiff > 0 means need CCW (-1), angDiff < 0 means need CW (+1)
            if (Math.abs(angDiff) > 0.05) { // Dead zone ~3 degrees
                const rotationDirection = angDiff > 0 ? -1 : 1;
                const thrusts = applyRotationThrusters(ship, rotationDirection, 1.0);
                activeThrusts.push(...thrusts);
            }
        }
    }
    
    // Handle firing
    if (input.fire) {
        fireAllCannons(ship, input.aimTarget);
    }
    
    return activeThrusts;
}

// ============================================================================
// PlayerController - Wraps keyboard/mouse input for human player
// ============================================================================

/**
 * Creates a PlayerController that reads from raw input state
 * @param {function} getInputStateFn - Function that returns current raw input state
 * @returns {object} PlayerController instance
 */
function createPlayerController(getInputStateFn) {
    return {
        type: 'player',
        
        /**
         * Gets current input state from player's keyboard/mouse
         * @param {object} ship - The ship (unused for player, but matches interface)
         * @param {number} deltaTime - Time since last frame (unused)
         * @returns {object} Input state
         */
        getInput(ship, deltaTime) {
            const rawState = getInputStateFn();
            
            return {
                forward: rawState.forward,
                back: rawState.back,
                left: rawState.left,
                right: rawState.right,
                turnLeft: rawState.turnLeft,
                turnRight: rawState.turnRight,
                turnToward: rawState.rightMouseDown ? rawState.mousePosition : null,
                fastTurn: rawState.shiftHeld,  // Hold shift to enable fast turn
                fire: rawState.fireRequested,
                aimTarget: rawState.mousePosition
            };
        },
        
        /**
         * Called after input is processed (to clear one-shot inputs like fire)
         */
        postUpdate() {
            // Fire is handled by the raw input system clearing fireRequested
        }
    };
}

// ============================================================================
// RandomController - Random inputs for simple AI behavior
// ============================================================================

/**
 * Creates a RandomController with configurable behavior
 * @param {object} options - Configuration options
 * @returns {object} RandomController instance
 */
function createRandomController(options = {}) {
    const config = {
        moveChangeChance: options.moveChangeChance ?? 0.02,     // Chance per frame to change movement
        turnChangeChance: options.turnChangeChance ?? 0.03,    // Chance per frame to change turning
        fireChance: options.fireChance ?? 0.02,                // Chance per frame to fire
        moveBias: options.moveBias ?? 0.6,                     // Probability of moving when changing
        ...options
    };
    
    // Current random state
    const state = {
        forward: false,
        back: false,
        left: false,
        right: false,
        turnLeft: false,
        turnRight: false
    };
    
    return {
        type: 'random',
        
        /**
         * Gets randomized input state
         * @param {object} ship - The ship (can be used for context)
         * @param {number} deltaTime - Time since last frame
         * @returns {object} Input state
         */
        getInput(ship, deltaTime) {
            // Randomly change movement direction
            if (Math.random() < config.moveChangeChance) {
                // Clear current movement
                state.forward = false;
                state.back = false;
                state.left = false;
                state.right = false;
                
                // Maybe pick a new direction
                if (Math.random() < config.moveBias) {
                    const dir = Math.floor(Math.random() * 4);
                    switch (dir) {
                        case 0: state.forward = true; break;
                        case 1: state.back = true; break;
                        case 2: state.left = true; break;
                        case 3: state.right = true; break;
                    }
                }
            }
            
            // Randomly change turning
            if (Math.random() < config.turnChangeChance) {
                state.turnLeft = false;
                state.turnRight = false;
                
                const turnChoice = Math.random();
                if (turnChoice < 0.33) {
                    state.turnLeft = true;
                } else if (turnChoice < 0.66) {
                    state.turnRight = true;
                }
                // else: no turning
            }
            
            // Randomly fire
            const shouldFire = Math.random() < config.fireChance;
            
            return {
                forward: state.forward,
                back: state.back,
                left: state.left,
                right: state.right,
                turnLeft: state.turnLeft,
                turnRight: state.turnRight,
                turnToward: null,
                fire: shouldFire,
                aimTarget: null
            };
        },
        
        /**
         * Called after input is processed
         */
        postUpdate() {
            // Nothing to clear for random controller
        }
    };
}

/**
 * Creates a controller by type name
 * @param {string} type - Controller type ('player', 'random')
 * @param {object} options - Options for the controller
 * @returns {object} Controller instance
 */
function createController(type, options = {}) {
    switch (type) {
        case 'player':
            return createPlayerController(options.getInputStateFn);
        case 'random':
            return createRandomController(options);
        default:
            console.warn(`Unknown controller type: ${type}, defaulting to random`);
            return createRandomController(options);
    }
}

export {
    createEmptyInput,
    applyInputToShip,
    createPlayerController,
    createRandomController,
    createController
};
