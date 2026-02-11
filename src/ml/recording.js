// Recording module - captures (sensing, action) pairs during gameplay
//
// Each frame of recording stores a flattened sensing state (62 floats)
// and a flattened action vector (12 floats). Frames are grouped into
// runs (one run per recording session).
//
// Aim labels use absolute dot-product encoding (schema v9):
//   aimDotForward, aimDotRight, aimDist -- current mouse position
//   relative to the ship's position, forward, and right directions.

import { flattenSensingState, ARENA_DIAGONAL } from '../arena/sensing.js';
import { getArenaPhysicsScale } from '../arena/arenaPhysics.js';
import { ACTION_SIZE } from './schema.js';

const AIM_HALF_RANGE = ARENA_DIAGONAL / 2;

// Recording state
let recording = false;
let currentRun = null;   // { sensing: Float32Array[], action: Float32Array[] }
let completedRuns = [];  // Array of completed runs

function isRecording() {
    return recording;
}

function startRecording() {
    currentRun = { sensing: [], action: [] };
    recording = true;
    console.log('ML recording started');
}

function stopRecording() {
    if (!recording) return;
    recording = false;
    if (currentRun && currentRun.sensing.length > 0) {
        completedRuns.push(currentRun);
        console.log(`ML recording stopped. Run ${completedRuns.length}: ${currentRun.sensing.length} frames`);
    } else {
        console.log('ML recording stopped (no frames captured)');
    }
    currentRun = null;
}

function toggleRecording() {
    if (recording) stopRecording();
    else startRecording();
}

/**
 * Records one frame of (sensing, action) data.
 * Aim is encoded as absolute dot-product position relative to the ship.
 * @param {object} sensingState - Structured sensing state from computeSensingState()
 * @param {object} input - Controller input object from getInput()
 * @param {object} ship - The ship being recorded
 * @param {object} mousePos - Mouse position in world coords {x, y}
 */
function recordFrame(sensingState, input, ship, mousePos) {
    if (!recording || !currentRun) return;

    const sense = flattenSensingState(sensingState);
    const weaponActive = isAnyCannonOnCooldown(ship);

    // Compute absolute mouse aim position relative to ship
    const mouseAim = computeMouseAim(mousePos, ship);
    const action = flattenAction(input, weaponActive, mouseAim);

    currentRun.sensing.push(sense);
    currentRun.action.push(action);
}

/**
 * Computes the current mouse position as dot products relative to the ship.
 * Same encoding as the input mouse sensing features.
 * @param {object|null} mousePos - Mouse world position {x, y}
 * @param {object} ship - The ship
 * @returns {{ dotForward: number, dotRight: number, dist: number }}
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

    // Normalized direction from ship to mouse
    const dirX = dx / rawDist;
    const dirY = dy / rawDist;

    // Ship's forward and right unit vectors
    const fwdX = Math.cos(shipForward);
    const fwdY = Math.sin(shipForward);
    const rightX = Math.cos(shipForward - Math.PI / 2);
    const rightY = Math.sin(shipForward - Math.PI / 2);

    const dotForward = dirX * fwdX + dirY * fwdY;
    const dotRight = dirX * rightX + dirY * rightY;
    const dist = clamp(rawDist / AIM_HALF_RANGE, 0, 1);

    return { dotForward, dotRight, dist };
}

/**
 * Checks if any cannon on the ship is on cooldown (recently fired).
 * Used as the "weapon active" training label instead of the single-frame fire click.
 */
function isAnyCannonOnCooldown(ship) {
    if (!ship || !ship.cannons) return false;
    return ship.cannons.some(c => !c.disabled && c.reloadTimer > 0);
}

// ============================================================================
// Action flattening
// ============================================================================

/**
 * Flattens controller input into a fixed-size Float32Array (schema v9).
 * Action[0-8] discrete, [9-11] absolute aim dot-product encoding.
 */
function flattenAction(input, weaponActive, mouseAim) {
    const action = new Float32Array(ACTION_SIZE);
    action[0] = input.forward ? 1 : 0;
    action[1] = input.back ? 1 : 0;
    action[2] = input.left ? 1 : 0;
    action[3] = input.right ? 1 : 0;
    action[4] = input.turnLeft ? 1 : 0;
    action[5] = input.turnRight ? 1 : 0;
    action[6] = input.turnToward ? 1 : 0;
    action[7] = input.fastTurn ? 1 : 0;
    action[8] = weaponActive ? 1 : 0;
    // Continuous aim position (dot-product direction + distance)
    // All stored in [-1,1] range so the uniform training scaler works correctly.
    // dotForward and dotRight are naturally [-1,1].
    // dist is [0,1] so we map to [-1,1] here; the training scaler maps it back.
    action[9] = mouseAim.dotForward;
    action[10] = mouseAim.dotRight;
    action[11] = mouseAim.dist * 2 - 1;
    return action;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function getCompletedRuns() {
    return completedRuns;
}

function getRunCount() {
    return completedRuns.length;
}

function getTotalFrames() {
    return completedRuns.reduce((sum, run) => sum + run.sensing.length, 0);
}

function clearRuns() {
    if (recording) stopRecording();
    completedRuns = [];
    console.log('All ML runs cleared');
}

/**
 * Imports runs (e.g. from IndexedDB or file upload)
 * @param {Array} runs - Array of { sensing: Float32Array[], action: Float32Array[] }
 */
function importRuns(runs) {
    completedRuns.push(...runs);
    console.log(`Imported ${runs.length} run(s). Total: ${completedRuns.length}`);
}

export {
    isRecording,
    startRecording,
    stopRecording,
    toggleRecording,
    recordFrame,
    flattenAction,
    getCompletedRuns,
    getRunCount,
    getTotalFrames,
    clearRuns,
    importRuns
};
