// ML Controller - Uses a trained TF.js model to control a ship
//
// Follows the same controller interface as PlayerController and RandomController:
//   { type, getInput(ship, deltaTime), postUpdate() }
//
// The model receives flattened sensing (62 floats) and outputs action (12 floats).
// Discrete outputs are thresholded at 0.5. Aim is predicted as an absolute
// position in dot-product form relative to the ship (no accumulator, no drift).

/* global tf */

import { flattenSensingState, ARENA_DIAGONAL } from '../arena/sensing.js';
import { getArenaPhysicsScale } from '../arena/arenaPhysics.js';
import { rotateVector } from '../math.js';

const DISCRETE_THRESHOLD = 0.5;
const AIM_HALF_RANGE = ARENA_DIAGONAL / 2;

// ============================================================================
// ML Controller factory
// ============================================================================

/**
 * Creates an ML controller that uses a trained model for inference
 * @param {tf.Sequential} model - Trained TF.js model
 * @returns {object} Controller instance matching the ship controller interface
 */
function createMlController(model) {
    let sensingState = null;
    let lastAimTarget = null;

    return {
        type: 'ml',

        /**
         * Runs model inference on current sensing state to produce input
         * @param {object} ship - The ship being controlled
         * @param {number} deltaTime - Time since last frame (unused)
         * @returns {object} Input state
         */
        getInput(ship, deltaTime) {
            if (!sensingState || !ship.body) {
                return emptyInput();
            }

            const prediction = predict(model, sensingState);
            const input = predictionToInput(prediction, ship);
            lastAimTarget = input.aimTarget;
            return input;
        },

        postUpdate() {
            // Nothing to clear for ML controller
        },

        /** Updates the sensing state used for next inference */
        setSensingState(state) {
            sensingState = state;
        },

        /** Returns the last predicted aim target (world coords) for weapon aiming */
        getLastAimTarget() {
            return lastAimTarget;
        }
    };
}

// ============================================================================
// Inference
// ============================================================================

/**
 * Runs model.predict on flattened sensing state
 * @returns {Float32Array} Raw prediction values (sigmoid outputs in [0,1])
 */
function predict(model, sensingState) {
    return tf.tidy(() => {
        const flat = flattenSensingState(sensingState);
        const input = tf.tensor2d(flat, [1, flat.length]);
        const output = model.predict(input);
        return output.dataSync(); // Float32Array
    });
}

/**
 * Converts raw model prediction to a controller input object.
 * Reconstructs world-space aim directly from predicted dot products + distance.
 */
function predictionToInput(pred, ship) {
    const forward  = pred[0] >= DISCRETE_THRESHOLD;
    const back     = pred[1] >= DISCRETE_THRESHOLD;
    const left     = pred[2] >= DISCRETE_THRESHOLD;
    const right    = pred[3] >= DISCRETE_THRESHOLD;
    const turnLeft = pred[4] >= DISCRETE_THRESHOLD;
    const turnRight = pred[5] >= DISCRETE_THRESHOLD;
    const turnTowardActive = pred[6] >= DISCRETE_THRESHOLD;
    const fastTurn = pred[7] >= DISCRETE_THRESHOLD;
    const fire     = pred[8] >= DISCRETE_THRESHOLD;

    // Unscale dot-product direction outputs from sigmoid [0,1] to [-1,1]
    const dotForward = pred[9] * 2 - 1;
    const dotRight   = pred[10] * 2 - 1;
    // aimDist: stored as [-1,1] in training data, scaled to [0,1] for sigmoid.
    // Round-trip: (pred * 2 - 1 + 1) / 2 = pred. So pred[11] is the [0,1] distance.
    const aimDist    = pred[11];

    // Reconstruct ship-local aim offset from dot products + distance
    // dotForward = cos(angle from forward), dotRight = sin(angle from forward)
    // Ship local: +Y = forward, +X = right
    const angle = Math.atan2(dotRight, dotForward);
    const worldDist = aimDist * AIM_HALF_RANGE;
    const localAim = {
        x: Math.sin(angle) * worldDist,   // right component
        y: Math.cos(angle) * worldDist    // forward component
    };

    // Rotate from ship-local to world space and add to ship position
    const shipAngle = -ship.body.angle;
    const worldOffset = rotateVector(localAim, shipAngle);

    const scale = getArenaPhysicsScale();
    const shipX = ship.body.position.x / scale;
    const shipY = -ship.body.position.y / scale;

    const aimTarget = {
        x: shipX + worldOffset.x,
        y: shipY + worldOffset.y
    };

    return {
        forward,
        back,
        left,
        right,
        turnLeft,
        turnRight,
        turnToward: turnTowardActive ? aimTarget : null,
        fastTurn,
        fire,
        aimTarget
    };
}

function emptyInput() {
    return {
        forward: false,
        back: false,
        left: false,
        right: false,
        turnLeft: false,
        turnRight: false,
        turnToward: null,
        fastTurn: false,
        fire: false,
        aimTarget: null
    };
}

export { createMlController };
