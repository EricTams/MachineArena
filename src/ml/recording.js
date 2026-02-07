// Recording module - captures (sensing, action) pairs during gameplay
//
// Each frame of recording stores a flattened sensing state (86 floats)
// and a flattened action vector (17 floats). Frames are grouped into
// runs (one run per recording session).
//
// Aim labels use structured decomposition (schema v4):
//   target selection (one-hot) + velocity/facing lead + ship-relative residual

import { flattenSensingState, ARENA_DIAGONAL } from '../arena/sensing.js';
import { getArenaPhysicsScale } from '../arena/arenaPhysics.js';
import { normalizeAngle, rotateVector, length, normalize, dot } from '../math.js';
import { ACTION_SIZE, MAX_LEAD_DISTANCE, MIN_ENEMY_SPEED } from './schema.js';

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
 * Aim labels are decomposed into: target selection, velocity/facing lead, residual.
 * @param {object} sensingState - Structured sensing state from computeSensingState()
 * @param {object} input - Controller input object from getInput()
 * @param {object} ship - The ship being recorded
 * @param {object} mousePos - Mouse position in world coords {x, y}
 */
function recordFrame(sensingState, input, ship, mousePos) {
    if (!recording || !currentRun) return;

    const sense = flattenSensingState(sensingState);
    const weaponActive = isAnyCannonOnCooldown(ship);
    const shipPos = getShipWorldPos(ship);
    const shipAngle = -ship.body.angle;
    const enemyWorld = sensingState.enemyWorldData;

    const targetIdx = matchTargetEnemy(shipPos, mousePos, enemyWorld);
    const leads = computeAimLeads(mousePos, enemyWorld, targetIdx);
    const residual = computeAimResidual(shipPos, shipAngle, mousePos, enemyWorld, targetIdx, leads);
    const action = flattenAction(input, weaponActive, targetIdx, leads, residual);

    currentRun.sensing.push(sense);
    currentRun.action.push(action);
}

/**
 * Checks if any cannon on the ship is on cooldown (recently fired).
 * Used as the "weapon active" training label instead of the single-frame fire click.
 */
function isAnyCannonOnCooldown(ship) {
    if (!ship || !ship.cannons) return false;
    return ship.cannons.some(c => !c.disabled && c.reloadTimer > 0);
}

/** Returns ship world position {x, y} */
function getShipWorldPos(ship) {
    const scale = getArenaPhysicsScale();
    return {
        x: ship.body.position.x / scale,
        y: -ship.body.position.y / scale
    };
}

// ============================================================================
// Aim label computation
// ============================================================================

/**
 * Finds which enemy slot the mouse is closest to aiming at.
 * Uses angular proximity: the enemy whose world angle from ship is closest
 * to the mouse's world angle from ship.
 * @returns {number} Enemy slot index (0-3), or -1 if no enemies present
 */
function matchTargetEnemy(shipPos, mousePos, enemyWorldData) {
    if (!mousePos || !enemyWorldData) return -1;

    const mouseAngle = Math.atan2(mousePos.y - shipPos.y, mousePos.x - shipPos.x);
    let bestIdx = -1;
    let bestDiff = Infinity;

    for (let i = 0; i < enemyWorldData.length; i++) {
        if (!enemyWorldData[i].present) continue;
        const enemyAngle = Math.atan2(
            enemyWorldData[i].pos.y - shipPos.y,
            enemyWorldData[i].pos.x - shipPos.x
        );
        const diff = Math.abs(normalizeAngle(mouseAngle - enemyAngle));
        if (diff < bestDiff) {
            bestDiff = diff;
            bestIdx = i;
        }
    }
    return bestIdx;
}

/**
 * Projects the mouse-to-enemy offset onto enemy velocity and facing directions.
 * @returns {{ leadVelocity: number, leadFacing: number }} Normalized [-1, 1]
 */
function computeAimLeads(mousePos, enemyWorldData, targetIdx) {
    if (targetIdx < 0 || !mousePos) return { leadVelocity: 0, leadFacing: 0 };

    const enemy = enemyWorldData[targetIdx];
    const toMouse = { x: mousePos.x - enemy.pos.x, y: mousePos.y - enemy.pos.y };

    // Lead along velocity direction (zero if enemy nearly stationary)
    const speed = length(enemy.vel);
    let leadVelocity = 0;
    if (speed > MIN_ENEMY_SPEED) {
        const velDir = normalize(enemy.vel);
        leadVelocity = clamp(dot(toMouse, velDir) / MAX_LEAD_DISTANCE, -1, 1);
    }

    // Lead along facing direction
    const faceDir = { x: Math.cos(enemy.forwardAngle), y: Math.sin(enemy.forwardAngle) };
    const leadFacing = clamp(dot(toMouse, faceDir) / MAX_LEAD_DISTANCE, -1, 1);

    return { leadVelocity, leadFacing };
}

/**
 * Computes the residual: the difference between the actual mouse position and
 * the reconstructed structured aim, in ship-local coordinates.
 * @returns {{ x: number, y: number }} Normalized [-1, 1]
 */
function computeAimResidual(shipPos, shipAngle, mousePos, enemyWorldData, targetIdx, leads) {
    if (!mousePos) return { x: 0, y: 0 };

    // Reconstruct structured aim in world coords
    const structured = (targetIdx >= 0)
        ? reconstructStructuredAim(enemyWorldData[targetIdx], leads)
        : shipPos;  // No target: residual captures the full aim offset from ship

    // Residual = actual mouse - structured aim, converted to ship-local
    const residualWorld = { x: mousePos.x - structured.x, y: mousePos.y - structured.y };
    const residualLocal = rotateVector(residualWorld, -shipAngle);

    return {
        x: clamp(residualLocal.x / AIM_HALF_RANGE, -1, 1),
        y: clamp(residualLocal.y / AIM_HALF_RANGE, -1, 1)
    };
}

/**
 * Reconstructs the structured aim point from enemy position + lead offsets.
 * Shared logic used during both recording (label computation) and inference.
 * @returns {{ x: number, y: number }} World-space aim point
 */
function reconstructStructuredAim(enemy, leads) {
    let x = enemy.pos.x;
    let y = enemy.pos.y;

    // Velocity lead component
    const speed = length(enemy.vel);
    if (speed > MIN_ENEMY_SPEED) {
        const velDir = normalize(enemy.vel);
        x += leads.leadVelocity * MAX_LEAD_DISTANCE * velDir.x;
        y += leads.leadVelocity * MAX_LEAD_DISTANCE * velDir.y;
    }

    // Facing lead component
    const faceDir = { x: Math.cos(enemy.forwardAngle), y: Math.sin(enemy.forwardAngle) };
    x += leads.leadFacing * MAX_LEAD_DISTANCE * faceDir.x;
    y += leads.leadFacing * MAX_LEAD_DISTANCE * faceDir.y;

    return { x, y };
}

// ============================================================================
// Action flattening
// ============================================================================

/**
 * Flattens controller input into a fixed-size Float32Array (schema v4).
 * Action[8] is "weaponActive" (any cannon on cooldown).
 * Actions[9-12] are one-hot target selection, [13-14] leads, [15-16] residual.
 */
function flattenAction(input, weaponActive, targetIdx, leads, residual) {
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
    // One-hot target selection
    if (targetIdx >= 0 && targetIdx < 4) action[9 + targetIdx] = 1;
    // Continuous leads
    action[13] = leads.leadVelocity;
    action[14] = leads.leadFacing;
    // Continuous residual
    action[15] = residual.x;
    action[16] = residual.y;
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
