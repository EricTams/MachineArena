// ML Controller - Uses a trained TF.js model to control a ship
//
// Follows the same controller interface as PlayerController and RandomController:
//   { type, getInput(ship, deltaTime), postUpdate() }
//
// The model receives flattened sensing (86 floats) and outputs action (17 floats).
// Discrete outputs are thresholded at 0.5. Aim is reconstructed from:
//   target selection (argmax one-hot) + velocity/facing leads + ship-relative residual.

/* global tf */

import { flattenSensingState, ARENA_DIAGONAL } from '../arena/sensing.js';
import { getArenaPhysicsScale } from '../arena/arenaPhysics.js';
import { rotateVector, length, normalize } from '../math.js';
import { MAX_LEAD_DISTANCE, MIN_ENEMY_SPEED } from './schema.js';

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
            const input = predictionToInput(prediction, ship, sensingState.enemyWorldData);
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
 * Reconstructs aim as: structured (target + leads) + residual.
 */
function predictionToInput(pred, ship, enemyWorldData) {
    const forward  = pred[0] >= DISCRETE_THRESHOLD;
    const back     = pred[1] >= DISCRETE_THRESHOLD;
    const left     = pred[2] >= DISCRETE_THRESHOLD;
    const right    = pred[3] >= DISCRETE_THRESHOLD;
    const turnLeft = pred[4] >= DISCRETE_THRESHOLD;
    const turnRight = pred[5] >= DISCRETE_THRESHOLD;
    const turnTowardActive = pred[6] >= DISCRETE_THRESHOLD;
    const fastTurn = pred[7] >= DISCRETE_THRESHOLD;
    const fire     = pred[8] >= DISCRETE_THRESHOLD;

    // Target selection: argmax of one-hot slots, only if above threshold
    const targetIdx = pickTarget(pred);

    // Unscale continuous outputs from sigmoid [0,1] to [-1,1]
    const leadVelocity = pred[13] * 2 - 1;
    const leadFacing   = pred[14] * 2 - 1;
    const residualX    = pred[15] * 2 - 1;
    const residualY    = pred[16] * 2 - 1;

    // Reconstruct world-space aim from structured + residual
    const aimTarget = reconstructWorldAim(
        ship, enemyWorldData, targetIdx,
        leadVelocity, leadFacing, residualX, residualY
    );

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

/**
 * Picks the target enemy slot from one-hot prediction outputs.
 * Returns the slot with highest activation above DISCRETE_THRESHOLD, or -1.
 */
function pickTarget(pred) {
    let bestIdx = -1;
    let bestVal = DISCRETE_THRESHOLD;
    for (let i = 0; i < 4; i++) {
        if (pred[9 + i] > bestVal) {
            bestVal = pred[9 + i];
            bestIdx = i;
        }
    }
    return bestIdx;
}

// ============================================================================
// Aim reconstruction
// ============================================================================

/**
 * Reconstructs the world-space aim target from model predictions.
 * finalAim = structuredAim (enemy + leads) + residual (ship-local correction)
 */
function reconstructWorldAim(ship, enemyWorldData, targetIdx, leadVel, leadFace, resX, resY) {
    const scale = getArenaPhysicsScale();
    const shipPosX = ship.body.position.x / scale;
    const shipPosY = -ship.body.position.y / scale;
    const shipAngle = -ship.body.angle;

    // Structured aim: enemy position + lead offsets (falls back to ship pos)
    let structX = shipPosX;
    let structY = shipPosY;

    const hasTarget = targetIdx >= 0
        && enemyWorldData
        && enemyWorldData[targetIdx]
        && enemyWorldData[targetIdx].present;

    if (hasTarget) {
        const enemy = enemyWorldData[targetIdx];
        structX = enemy.pos.x;
        structY = enemy.pos.y;

        // Velocity lead
        const speed = length(enemy.vel);
        if (speed > MIN_ENEMY_SPEED) {
            const velDir = normalize(enemy.vel);
            structX += leadVel * MAX_LEAD_DISTANCE * velDir.x;
            structY += leadVel * MAX_LEAD_DISTANCE * velDir.y;
        }

        // Facing lead
        const faceDir = { x: Math.cos(enemy.forwardAngle), y: Math.sin(enemy.forwardAngle) };
        structX += leadFace * MAX_LEAD_DISTANCE * faceDir.x;
        structY += leadFace * MAX_LEAD_DISTANCE * faceDir.y;
    }

    // Residual: ship-local [-1,1] → world offset
    const localRes = { x: resX * AIM_HALF_RANGE, y: resY * AIM_HALF_RANGE };
    const worldRes = rotateVector(localRes, shipAngle);

    return {
        x: structX + worldRes.x,
        y: structY + worldRes.y
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
