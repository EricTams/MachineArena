// Prediction tracker - runs a pre-fight model alongside the player during
// recorded fights to measure how well the existing model predicts the
// player's actions. Results are displayed on the training results screen.
//
// Usage:
//   initTracker(model)          -- call at fight start (if a trained model exists)
//   trackFrame(sensing, input, ship, mousePos)  -- call each recorded frame
//   getTrackingSummary()        -- call after fight ends, returns comparison metrics
//   disposeTracker()            -- call to clean up the model + data

/* global tf */

import { flattenSensingState, ARENA_DIAGONAL } from '../arena/sensing.js';
import { getArenaPhysicsScale } from '../arena/arenaPhysics.js';
import { flattenAction } from './recording.js';
import {
    DISCRETE_ACTION_INDICES, CONTINUOUS_ACTION_INDICES,
    ACTION_NAMES
} from './schema.js';

const AIM_HALF_RANGE = ARENA_DIAGONAL / 2;

// ============================================================================
// State
// ============================================================================

let trackerModel = null;       // tf.Sequential loaded at fight start
let predictedFrames = [];      // Float32Array[] -- raw model predictions (sigmoid [0,1])
let actualFrames = [];         // Float32Array[] -- flattened actual actions (scaled to [0,1])

// ============================================================================
// Public API
// ============================================================================

/**
 * Initialises the prediction tracker with a pre-fight model.
 * Call once at fight start when a trained model is available.
 * @param {tf.Sequential} model - The trained model to use for predictions
 */
function initTracker(model) {
    trackerModel = model;
    predictedFrames = [];
    actualFrames = [];
    console.log('Prediction tracker initialised');
}

/**
 * Returns true if a tracker model is active.
 */
function hasTracker() {
    return trackerModel !== null;
}

/**
 * Tracks one frame: runs inference on the sensing state and records both
 * the model's prediction and the player's actual action.
 * Mirrors the same action-flattening logic as recording.js so the vectors
 * are directly comparable.
 * @param {object} sensingState - Structured sensing state
 * @param {object} input - Player controller input
 * @param {object} ship - The player ship
 * @param {object} mousePos - Mouse world position {x, y}
 */
function trackFrame(sensingState, input, ship, mousePos) {
    if (!trackerModel || !ship || !ship.body) return;

    // --- Model prediction (sigmoid outputs in [0,1]) ---
    const prediction = predict(trackerModel, sensingState);
    predictedFrames.push(new Float32Array(prediction));

    // --- Actual action (flattened the same way as recording.js) ---
    const weaponActive = isAnyCannonOnCooldown(ship);
    const mouseAim = computeMouseAim(mousePos, ship);
    const action = flattenAction(input, weaponActive, mouseAim);

    // Scale continuous channels to [0,1] to match sigmoid output range
    const scaled = new Float32Array(action);
    for (const idx of CONTINUOUS_ACTION_INDICES) {
        scaled[idx] = (action[idx] + 1) / 2;
    }
    actualFrames.push(scaled);
}

/**
 * Computes a summary comparing the model's predictions to actual player actions.
 * Call after the fight ends (after stopRecording).
 * @returns {object|null} Summary metrics, or null if no frames were tracked
 */
function getTrackingSummary() {
    const n = predictedFrames.length;
    if (n === 0) return null;

    // Per-action discrete accuracy
    const perAction = {};
    let totalCorrect = 0;
    let totalChecks = 0;

    for (const idx of DISCRETE_ACTION_INDICES) {
        let correct = 0;
        for (let i = 0; i < n; i++) {
            const pred = predictedFrames[i][idx] >= 0.5 ? 1 : 0;
            const actual = actualFrames[i][idx] >= 0.5 ? 1 : 0;
            if (pred === actual) correct++;
        }
        const name = ACTION_NAMES[idx];
        perAction[name] = correct / n;
        totalCorrect += correct;
        totalChecks += n;
    }

    const overallAccuracy = totalChecks > 0 ? totalCorrect / totalChecks : 0;

    // Aim MSE (continuous channels, both already in [0,1])
    let aimSumSq = 0;
    let aimCount = 0;
    for (const idx of CONTINUOUS_ACTION_INDICES) {
        for (let i = 0; i < n; i++) {
            const diff = predictedFrames[i][idx] - actualFrames[i][idx];
            aimSumSq += diff * diff;
            aimCount++;
        }
    }
    const aimMSE = aimCount > 0 ? aimSumSq / aimCount : 0;

    return {
        overallAccuracy,
        perAction,
        aimMSE,
        totalFrames: n
    };
}

/**
 * Disposes the tracker model and clears collected data.
 */
function disposeTracker() {
    if (trackerModel) {
        trackerModel.dispose();
        trackerModel = null;
    }
    predictedFrames = [];
    actualFrames = [];
}

// ============================================================================
// Internal helpers
// ============================================================================

/** Runs model.predict on flattened sensing state */
function predict(model, sensingState) {
    return tf.tidy(() => {
        const flat = flattenSensingState(sensingState);
        const input = tf.tensor2d(flat, [1, flat.length]);
        const output = model.predict(input);
        return output.dataSync();
    });
}

function isAnyCannonOnCooldown(ship) {
    if (!ship || !ship.cannons) return false;
    return ship.cannons.some(c => !c.disabled && c.reloadTimer > 0);
}

/**
 * Computes the current mouse position as dot products relative to the ship.
 * Mirrors recording.js computeMouseAim().
 */
function computeMouseAim(mousePos, ship) {
    if (!mousePos || !ship || !ship.body) {
        return { dotForward: 0, dotRight: 0, dist: 0 };
    }

    const scale = getArenaPhysicsScale();
    const shipX = ship.body.position.x / scale;
    const shipY = -ship.body.position.y / scale;
    const shipAngle = -ship.body.angle;
    const shipForward = shipAngle + Math.PI / 2;

    const dx = mousePos.x - shipX;
    const dy = mousePos.y - shipY;
    const rawDist = Math.sqrt(dx * dx + dy * dy);

    if (rawDist < 1e-6) {
        return { dotForward: 0, dotRight: 0, dist: 0 };
    }

    const dirX = dx / rawDist;
    const dirY = dy / rawDist;

    const fwdX = Math.cos(shipForward);
    const fwdY = Math.sin(shipForward);
    const rightX = Math.cos(shipForward - Math.PI / 2);
    const rightY = Math.sin(shipForward - Math.PI / 2);

    const dotForward = dirX * fwdX + dirY * fwdY;
    const dotRight = dirX * rightX + dirY * rightY;
    const dist = clamp(rawDist / AIM_HALF_RANGE, 0, 1);

    return { dotForward, dotRight, dist };
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

export {
    initTracker,
    hasTracker,
    trackFrame,
    getTrackingSummary,
    disposeTracker
};
