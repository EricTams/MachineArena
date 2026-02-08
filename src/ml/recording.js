// Recording module - captures (sensing, action) pairs during gameplay
//
// Each frame of recording stores a flattened sensing state (59 floats)
// and a flattened action vector (13 floats). Frames are grouped into
// runs (one run per recording session).
//
// Aim labels use structured decomposition (schema v7):
//   velocity/facing lead + ship-relative residual (single engaged enemy)

import { flattenSensingState, ARENA_DIAGONAL } from '../arena/sensing.js';
import { getArenaPhysicsScale } from '../arena/arenaPhysics.js';
import { rotateVector, length, normalize, dot } from '../math.js';
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
 * Aim labels are decomposed into: velocity/facing lead + residual.
 * The engaged enemy is always slot 0 (selected upstream by sensing).
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

    // Single engaged enemy is always slot 0 (engagement selection done in sensing)
    const hasEnemy = enemyWorld && enemyWorld[0] && enemyWorld[0].present;
    const leads = hasEnemy ? computeAimLeads(mousePos, enemyWorld[0]) : { leadVelocity: 0, leadFacing: 0 };
    const residual = computeAimResidual(shipPos, shipAngle, mousePos, hasEnemy ? enemyWorld[0] : null, leads);
    const action = flattenAction(input, weaponActive, leads, residual);

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
 * Projects the mouse-to-enemy offset onto enemy velocity and facing directions.
 * @param {object|null} mousePos - Mouse world position
 * @param {object} enemy - Single engaged enemy world data {pos, vel, forwardAngle}
 * @returns {{ leadVelocity: number, leadFacing: number }} Normalized [-1, 1]
 */
function computeAimLeads(mousePos, enemy) {
    if (!mousePos) return { leadVelocity: 0, leadFacing: 0 };

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
 * @param {object} shipPos - Ship world position
 * @param {number} shipAngle - Ship rotation angle
 * @param {object|null} mousePos - Mouse world position
 * @param {object|null} enemy - Engaged enemy world data, or null if no enemy
 * @param {object} leads - Computed aim leads
 * @returns {{ x: number, y: number }} Normalized [-1, 1]
 */
function computeAimResidual(shipPos, shipAngle, mousePos, enemy, leads) {
    if (!mousePos) return { x: 0, y: 0 };

    // Reconstruct structured aim in world coords
    const structured = enemy
        ? reconstructStructuredAim(enemy, leads)
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
 * Flattens controller input into a fixed-size Float32Array (schema v7).
 * Action[0-8] discrete, [9-10] leads, [11-12] residual.
 */
function flattenAction(input, weaponActive, leads, residual) {
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
    // Continuous leads
    action[9] = leads.leadVelocity;
    action[10] = leads.leadFacing;
    // Continuous residual
    action[11] = residual.x;
    action[12] = residual.y;
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
