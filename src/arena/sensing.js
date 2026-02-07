// Sensing system - computes perception data for ML/apprenticeship learning
// Outputs fixed-size, normalized data suitable for neural network input
//
// =============================================================================
// COORDINATE SYSTEM - READ THIS BEFORE MODIFYING ROTATION CODE
// =============================================================================
//
// Ship local space:
//   +Y = FORWARD (the direction the ship flies)
//   +X = RIGHT
//   -Y = BACK
//   -X = LEFT
//
// There are TWO different angle values used in this code:
//
//   1. shipAngle = -ship.body.angle
//      - This is the ROTATION ANGLE for transforming vectors
//      - Use this with rotateVector() to convert local <-> world coordinates
//      - Example: rotateVector(localVec, shipAngle) converts local to world
//      - Example: rotateVector(worldVec, -shipAngle) converts world to local
//
//   2. shipForward = shipAngle + Math.PI/2
//      - This is the DIRECTION the ship is facing as an atan2 angle
//      - Use this for computing relative angles to targets
//      - In atan2 convention: 0 = +X (right), π/2 = +Y (up)
//      - Since ship forward is +Y, shipForward = shipAngle + π/2
//
// COMMON MISTAKE: Using shipForward for vector rotation. This adds an extra
// 90° rotation and breaks everything. Always use shipAngle for rotateVector().
//
// =============================================================================

import { normalizeAngle, rotateVector, length, normalize, dot } from '../math.js';
import { getArenaPhysicsScale, getArenaDimensions } from './arenaPhysics.js';

// Configuration constants
const MAX_ENEMIES = 4;
const MAX_HAZARDS = 4;
const MAX_BLOCKERS = 4;
const ARENA_DIAGONAL = Math.sqrt(80 * 80 + 60 * 60);  // ~100 units
const MAX_VELOCITY = 20;  // Tune based on actual gameplay
const MAX_BLOCKER_RADIUS = 10;  // Largest expected blocker size
const SECTOR_COUNT = 8;  // Threat radar sectors

// Total size of flattened sensing state (v2: mouse section removed, 94 → 90)
const SENSING_STATE_SIZE = 90;

// ============================================================================
// Main Sensing Function
// ============================================================================

/**
 * Computes complete sensing state for a ship
 * @param {object} ship - The ship to compute sensing for
 * @param {Array} allShips - All ships in the arena (for enemy detection)
 * @param {Array} hazards - Array of hazard objects (future use)
 * @param {Array} blockers - Array of blocker objects {x, y, radius}
 * @param {Array} projectiles - Array of active projectiles
 * @returns {object} Complete sensing state
 */
function computeSensingState(ship, allShips, hazards, blockers, projectiles) {
    const scale = getArenaPhysicsScale();
    const dimensions = getArenaDimensions();
    
    // Get ship world position and facing
    const shipPos = {
        x: ship.body.position.x / scale,
        y: -ship.body.position.y / scale
    };
    const shipVel = {
        x: ship.body.velocity.x / scale,
        y: -ship.body.velocity.y / scale
    };
    // ROTATION ANGLE - for vector transforms (see header comment)
    // Use with rotateVector() to convert between local and world coordinates
    const shipAngle = -ship.body.angle;
    
    // DIRECTION ANGLE - for atan2 angle comparisons (see header comment)
    // The atan2 angle where the ship is pointing (ship forward = +Y = atan2 π/2)
    const shipForward = shipAngle + Math.PI / 2;
    
    // Compute each section
    const self = computeSelfState(ship, shipPos, shipVel, shipAngle, dimensions);
    const walls = computeWallDistances(shipPos, shipAngle, dimensions);
    const threats = computeThreatRadar(ship, shipPos, shipAngle, shipForward, projectiles);
    
    // Compute enemy sensing (filter out self, sort by distance)
    const enemyResult = computeEnemiesSensing(ship, shipPos, shipVel, shipAngle, shipForward, allShips);
    
    // Compute hazard sensing (future - empty for now)
    const hazardSensing = computeHazardsSensing(shipPos, shipVel, shipAngle, shipForward, hazards || []);
    
    // Compute blocker sensing
    const blockerSensing = computeBlockersSensing(shipPos, shipAngle, shipForward, blockers || []);
    
    return {
        self,
        walls,
        threats,
        enemies: enemyResult.sensing,
        hazards: hazardSensing,
        blockers: blockerSensing,
        // AIDEV-NOTE: enemyWorldData is a side-channel of raw world-space enemy
        // data (pos, vel, facing) used by recording and ML inference for aim
        // reconstruction. NOT included in the flattened NN input.
        enemyWorldData: enemyResult.worldData
    };
}

// ============================================================================
// Self State
// ============================================================================

/**
 * Computes self state (velocity, position, etc.)
 */
function computeSelfState(ship, shipPos, shipVel, shipAngle, dimensions) {
    // Rotate velocity into ship's frame (use -shipAngle to go from world to local)
    const localVel = rotateVector(shipVel, -shipAngle);
    
    // Normalize velocities
    // In ship local space: +Y = forward, +X = right
    const velocityForward = clamp(localVel.y / MAX_VELOCITY, -1, 1);
    const velocityRight = clamp(localVel.x / MAX_VELOCITY, -1, 1);
    
    // Angular velocity (rad/s, normalize by some reasonable max like 5 rad/s)
    const angularVelocity = clamp(-ship.body.angularVelocity / 5, -1, 1);
    
    // Health (future - use 1.0 for now)
    const health = 1.0;
    
    // Position normalized to arena bounds
    const halfWidth = dimensions.width / 2;
    const halfHeight = dimensions.height / 2;
    const posX = clamp(shipPos.x / halfWidth, -1, 1);
    const posY = clamp(shipPos.y / halfHeight, -1, 1);
    
    return {
        velocityForward,
        velocityRight,
        angularVelocity,
        health,
        posX,
        posY
    };
}

// ============================================================================
// Wall Distances
// ============================================================================

/**
 * Computes distances to arena walls in ship-relative directions
 */
function computeWallDistances(shipPos, shipAngle, dimensions) {
    const halfWidth = dimensions.width / 2;
    const halfHeight = dimensions.height / 2;
    
    // Arena bounds
    const minX = -halfWidth;
    const maxX = halfWidth;
    const minY = -halfHeight;
    const maxY = halfHeight;
    
    // Compute distance in each ship-relative direction
    // In ship local space: Front = +Y, Back = -Y, Right = +X, Left = -X
    // Use shipAngle to rotate local directions to world directions
    const frontDir = rotateVector({ x: 0, y: 1 }, shipAngle);
    const backDir = rotateVector({ x: 0, y: -1 }, shipAngle);
    const rightDir = rotateVector({ x: 1, y: 0 }, shipAngle);
    const leftDir = rotateVector({ x: -1, y: 0 }, shipAngle);
    
    // Ray-cast to find wall distance in each direction
    const front = raycastToWalls(shipPos, frontDir, minX, maxX, minY, maxY);
    const back = raycastToWalls(shipPos, backDir, minX, maxX, minY, maxY);
    const right = raycastToWalls(shipPos, rightDir, minX, maxX, minY, maxY);
    const left = raycastToWalls(shipPos, leftDir, minX, maxX, minY, maxY);
    
    // Normalize by arena diagonal
    return {
        front: clamp(front / ARENA_DIAGONAL, 0, 1),
        back: clamp(back / ARENA_DIAGONAL, 0, 1),
        left: clamp(left / ARENA_DIAGONAL, 0, 1),
        right: clamp(right / ARENA_DIAGONAL, 0, 1)
    };
}

/**
 * Raycast from position in direction to find distance to arena walls
 */
function raycastToWalls(pos, dir, minX, maxX, minY, maxY) {
    let minT = Infinity;
    
    // Check each wall
    if (dir.x !== 0) {
        // Left wall (x = minX)
        const tLeft = (minX - pos.x) / dir.x;
        if (tLeft > 0) minT = Math.min(minT, tLeft);
        
        // Right wall (x = maxX)
        const tRight = (maxX - pos.x) / dir.x;
        if (tRight > 0) minT = Math.min(minT, tRight);
    }
    
    if (dir.y !== 0) {
        // Bottom wall (y = minY)
        const tBottom = (minY - pos.y) / dir.y;
        if (tBottom > 0) minT = Math.min(minT, tBottom);
        
        // Top wall (y = maxY)
        const tTop = (maxY - pos.y) / dir.y;
        if (tTop > 0) minT = Math.min(minT, tTop);
    }
    
    return minT === Infinity ? ARENA_DIAGONAL : minT;
}

// ============================================================================
// Threat Radar
// ============================================================================

/**
 * Computes 8-sector threat radar from incoming projectiles
 */
function computeThreatRadar(ship, shipPos, shipAngle, shipForward, projectiles) {
    const sectorThreats = new Array(SECTOR_COUNT).fill(0);
    
    if (!projectiles || projectiles.length === 0) {
        return arrayToThreatObject(sectorThreats);
    }
    
    // Filter and score projectiles
    for (const proj of projectiles) {
        // Skip own projectiles
        if (proj.shooter === ship) continue;
        
        // Check if approaching
        const toShip = { x: shipPos.x - proj.x, y: shipPos.y - proj.y };
        const approaching = proj.vx * toShip.x + proj.vy * toShip.y;
        if (approaching <= 0) continue;
        
        // Compute threat score
        const threat = computeThreatScore(proj, shipPos);
        if (threat <= 0) continue;
        
        // Direction projectile is coming FROM (opposite of its velocity)
        const fromAngle = Math.atan2(-proj.vy, -proj.vx);
        // Convert to ship-relative using shipForward (the atan2 direction of ship's front)
        const relAngle = normalizeAngle(fromAngle - shipForward);
        // Map to sector (0 = front, going clockwise: 1=frontRight, 2=right, etc.)
        // relAngle: -PI to PI, where 0 = directly ahead
        // Clockwise means negative relAngle increases sector index
        const sectorAngle = Math.PI / 4;  // 45° per sector
        let sectorIndex = Math.round(-relAngle / sectorAngle);
        if (sectorIndex < 0) sectorIndex += 8;
        sectorIndex = sectorIndex % 8;
        
        // Aggregate using max
        sectorThreats[sectorIndex] = Math.max(sectorThreats[sectorIndex], threat);
    }
    
    return arrayToThreatObject(sectorThreats);
}

/**
 * Computes threat score for a single projectile
 */
function computeThreatScore(proj, shipPos) {
    const dx = shipPos.x - proj.x;
    const dy = shipPos.y - proj.y;
    const vx = proj.vx;
    const vy = proj.vy;
    const speed2 = vx * vx + vy * vy;
    
    if (speed2 < 0.01) return 0;  // Stationary projectile
    
    // Time to closest approach: t = dot(toShip, vel) / speed^2
    const t = Math.max(0, (dx * vx + dy * vy) / speed2);
    
    // Closest approach position
    const closestX = proj.x + vx * t;
    const closestY = proj.y + vy * t;
    
    // Miss distance
    const missDistance = Math.sqrt(
        (shipPos.x - closestX) ** 2 + (shipPos.y - closestY) ** 2
    );
    
    // Threat score: high if close pass, soon
    const proximityFactor = Math.max(0, 1 - missDistance / 5);  // 0-1
    const urgencyFactor = Math.max(0, 1 - t / 2);               // 0-1
    
    return proximityFactor * urgencyFactor;
}

/**
 * Converts threat array to named object
 */
function arrayToThreatObject(arr) {
    return {
        front: arr[0],
        frontRight: arr[1],
        right: arr[2],
        backRight: arr[3],
        back: arr[4],
        backLeft: arr[5],
        left: arr[6],
        frontLeft: arr[7]
    };
}

// ============================================================================
// Enemy Sensing
// ============================================================================

/**
 * Computes sensing data for all enemies.
 * Returns both normalized sensing features (for NN input) and raw world-space
 * data (for aim label computation during recording and aim reconstruction
 * during ML inference).
 *
 * @returns {{ sensing: Array, worldData: Array }}
 */
function computeEnemiesSensing(ship, shipPos, shipVel, shipAngle, shipForward, allShips) {
    const scale = getArenaPhysicsScale();
    
    // Filter to enemies only (different team, not destroyed)
    const enemies = allShips.filter(s => 
        s !== ship && 
        s.team !== ship.team && 
        !s.destroyed &&
        s.body
    );
    
    // Compute sensing + world data for each enemy
    const entries = enemies.map(enemy => {
        const enemyPos = {
            x: enemy.body.position.x / scale,
            y: -enemy.body.position.y / scale
        };
        const enemyVel = {
            x: enemy.body.velocity.x / scale,
            y: -enemy.body.velocity.y / scale
        };
        const enemyAngle = -enemy.body.angle;
        const enemyForward = enemyAngle + Math.PI / 2;
        
        const sensing = computeEntitySensing(
            shipPos, shipVel, shipAngle, shipForward,
            enemyPos, enemyVel, enemyForward,
            true  // includeFacingData
        );
        const world = {
            present: 1,
            pos: enemyPos,
            vel: enemyVel,
            forwardAngle: enemyForward
        };
        return { sensing, world };
    });
    
    // Sort by distance (nearest first)
    entries.sort((a, b) => a.sensing.distance - b.sensing.distance);
    
    // Pad to MAX_ENEMIES
    while (entries.length < MAX_ENEMIES) {
        entries.push({
            sensing: createEmptyEnemySlot(),
            world: createEmptyEnemyWorldSlot()
        });
    }
    
    const trimmed = entries.slice(0, MAX_ENEMIES);
    return {
        sensing: trimmed.map(e => e.sensing),
        worldData: trimmed.map(e => e.world)
    };
}

/**
 * Computes sensing data for a single entity (enemy or hazard)
 * @param {object} shipPos - Ship world position
 * @param {object} shipVel - Ship world velocity
 * @param {number} shipAngle - Ship rotation angle (for vector transforms)
 * @param {number} shipForward - Ship forward direction as atan2 angle (for angle comparisons)
 * @param {object} entityPos - Entity world position
 * @param {object} entityVel - Entity world velocity
 * @param {number} entityForward - Entity forward direction as atan2 angle
 * @param {boolean} includeFacingData - Whether to compute facing-based lead data
 */
function computeEntitySensing(shipPos, shipVel, shipAngle, shipForward, entityPos, entityVel, entityForward, includeFacingData) {
    // Distance
    const dx = entityPos.x - shipPos.x;
    const dy = entityPos.y - shipPos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const distance = clamp(dist / ARENA_DIAGONAL, 0, 1);
    
    // Angle from ship's forward (using atan2 angles)
    const worldAngle = Math.atan2(dy, dx);
    // Positive = entity is to the left (CCW), Negative = entity is to the right (CW)
    const angleFromForward = normalizeAngle(worldAngle - shipForward) / Math.PI;
    
    // Relative velocity
    const relVel = {
        x: entityVel.x - shipVel.x,
        y: entityVel.y - shipVel.y
    };
    // Rotate into ship's frame using -shipAngle
    const localRelVel = rotateVector(relVel, -shipAngle);
    // In ship local space: +Y = forward, +X = right
    // localRelVel.y > 0 means entity is moving forward relative to us (away from us)
    // We want positive = entity coming toward us, so negate
    const relVelocityToward = clamp(-localRelVel.y / MAX_VELOCITY, -1, 1);
    // localRelVel.x > 0 means entity is moving to our right
    const relVelocityCross = clamp(localRelVel.x / MAX_VELOCITY, -1, 1);
    
    // How directly the entity is facing us (dot product of their forward with direction to us)
    const entityToShip = normalize({ x: shipPos.x - entityPos.x, y: shipPos.y - entityPos.y });
    const entityFacingDir = { x: Math.cos(entityForward), y: Math.sin(entityForward) };
    const facingUs = clamp((dot(entityFacingDir, entityToShip) + 1) / 2, 0, 1);  // 0-1
    
    const result = {
        present: 1,
        distance,
        angleFromForward,
        relVelocityToward,
        relVelocityCross,
        facingUs
    };
    
    if (includeFacingData) {
        // facingOffsetToEnemy: angle between ship's forward and direction to enemy
        // AIDEV-NOTE: This equals angleFromForward; kept for consistent 9-feature enemy layout
        const facingOffsetToEnemy = angleFromForward;
        
        // Lead amounts based on ship's forward direction (not mouse)
        // Project a point along ship's forward at enemy's distance as the "aim point"
        const { leadVelocity, leadFacing } = computeFacingLead(
            shipPos, shipForward, dist, entityPos, entityVel, entityForward
        );
        
        result.facingOffsetToEnemy = facingOffsetToEnemy;
        result.facingLeadVelocity = leadVelocity;
        result.facingLeadFacing = leadFacing;
    }
    
    return result;
}

/**
 * Computes how much the ship's forward direction leads an enemy.
 * Uses a point along the ship's forward vector (at enemy distance) as the aim point.
 *
 * Returns two values:
 *   leadVelocity: projection of (aim point - enemy) onto enemy velocity direction
 *   leadFacing:   projection of (aim point - enemy) onto enemy facing direction
 *
 * Positive = leading ahead, Negative = trailing behind, 0 = on target or stationary
 *
 * @param {object} shipPos - Ship world position
 * @param {number} shipForward - Ship forward direction as atan2 angle
 * @param {number} dist - Raw distance from ship to entity
 * @param {object} entityPos - Entity world position
 * @param {object} entityVel - Entity world velocity
 * @param {number} entityForward - Entity forward direction as atan2 angle
 */
function computeFacingLead(shipPos, shipForward, dist, entityPos, entityVel, entityForward) {
    // Aim point: ship position + forward direction * distance to enemy
    const forwardDir = { x: Math.cos(shipForward), y: Math.sin(shipForward) };
    const aimPoint = {
        x: shipPos.x + forwardDir.x * dist,
        y: shipPos.y + forwardDir.y * dist
    };
    
    // Vector from entity to aim point
    const entityToAim = {
        x: aimPoint.x - entityPos.x,
        y: aimPoint.y - entityPos.y
    };
    
    // Velocity-based lead: project onto movement direction
    const enemySpeed = length(entityVel);
    let leadVelocity = 0;
    if (enemySpeed > 0.1) {
        const velocityDir = normalize(entityVel);
        leadVelocity = clamp(dot(entityToAim, velocityDir) / 10, -1, 1);
    }
    
    // Facing-based lead: project onto facing direction
    const facingDir = { x: Math.cos(entityForward), y: Math.sin(entityForward) };
    const leadFacing = clamp(dot(entityToAim, facingDir) / 10, -1, 1);
    
    return { leadVelocity, leadFacing };
}

// ============================================================================
// Hazard Sensing
// ============================================================================

/**
 * Computes sensing data for hazards
 */
function computeHazardsSensing(shipPos, shipVel, shipAngle, shipForward, hazards) {
    // Compute sensing for each hazard
    const hazardData = hazards.map(hazard => {
        const hazardPos = { x: hazard.x, y: hazard.y };
        const hazardVel = { x: hazard.vx || 0, y: hazard.vy || 0 };
        
        const sensing = computeEntitySensing(
            shipPos, shipVel, shipAngle, shipForward,
            hazardPos, hazardVel, 0,  // No facing for hazards
            false  // No facing lead data
        );
        
        // Remove facing lead fields (not computed for hazards)
        delete sensing.facingOffsetToEnemy;
        delete sensing.facingLeadVelocity;
        delete sensing.facingLeadFacing;
        // Remove facingUs for hazards
        delete sensing.facingUs;
        
        return sensing;
    });
    
    // Sort by distance
    hazardData.sort((a, b) => a.distance - b.distance);
    
    // Pad to MAX_HAZARDS
    while (hazardData.length < MAX_HAZARDS) {
        hazardData.push(createEmptyHazardSlot());
    }
    
    return hazardData.slice(0, MAX_HAZARDS);
}

// ============================================================================
// Blocker Sensing
// ============================================================================

/**
 * Computes sensing data for blockers (static circular obstacles)
 */
function computeBlockersSensing(shipPos, shipAngle, shipForward, blockers) {
    const blockerData = blockers.map(blocker => {
        const dx = blocker.x - shipPos.x;
        const dy = blocker.y - shipPos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        // Distance to center
        const distance = clamp(dist / ARENA_DIAGONAL, 0, 1);
        
        // Angle from ship's forward (using shipForward for atan2 angle comparison)
        const worldAngle = Math.atan2(dy, dx);
        const angleFromForward = normalizeAngle(worldAngle - shipForward) / Math.PI;
        
        // Normalized radius
        const radius = clamp((blocker.radius || 1) / MAX_BLOCKER_RADIUS, 0, 1);
        
        return {
            present: 1,
            distance,
            angleFromForward,
            radius
        };
    });
    
    // Sort by distance
    blockerData.sort((a, b) => a.distance - b.distance);
    
    // Pad to MAX_BLOCKERS
    while (blockerData.length < MAX_BLOCKERS) {
        blockerData.push(createEmptyBlockerSlot());
    }
    
    return blockerData.slice(0, MAX_BLOCKERS);
}

// ============================================================================
// Empty Slot Helpers
// ============================================================================

function createEmptyEnemySlot() {
    return {
        present: 0,
        distance: 0,
        angleFromForward: 0,
        relVelocityToward: 0,
        relVelocityCross: 0,
        facingUs: 0,
        facingOffsetToEnemy: 0,
        facingLeadVelocity: 0,
        facingLeadFacing: 0
    };
}

function createEmptyEnemyWorldSlot() {
    return {
        present: 0,
        pos: { x: 0, y: 0 },
        vel: { x: 0, y: 0 },
        forwardAngle: 0
    };
}

function createEmptyHazardSlot() {
    return {
        present: 0,
        distance: 0,
        angleFromForward: 0,
        relVelocityToward: 0,
        relVelocityCross: 0
    };
}

function createEmptyBlockerSlot() {
    return {
        present: 0,
        distance: 0,
        angleFromForward: 0,
        radius: 0
    };
}

// ============================================================================
// Flatten for Neural Network
// ============================================================================

/**
 * Flattens sensing state into a fixed-size Float32Array for NN input
 */
function flattenSensingState(state) {
    const values = [];
    
    // Self (6 values)
    values.push(state.self.velocityForward);
    values.push(state.self.velocityRight);
    values.push(state.self.angularVelocity);
    values.push(state.self.health);
    values.push(state.self.posX);
    values.push(state.self.posY);
    
    // Walls (4 values)
    values.push(state.walls.front);
    values.push(state.walls.back);
    values.push(state.walls.left);
    values.push(state.walls.right);
    
    // Threats (8 values)
    values.push(state.threats.front);
    values.push(state.threats.frontRight);
    values.push(state.threats.right);
    values.push(state.threats.backRight);
    values.push(state.threats.back);
    values.push(state.threats.backLeft);
    values.push(state.threats.left);
    values.push(state.threats.frontLeft);
    
    // Enemies (4 * 9 = 36 values)
    for (const enemy of state.enemies) {
        values.push(enemy.present);
        values.push(enemy.distance);
        values.push(enemy.angleFromForward);
        values.push(enemy.relVelocityToward);
        values.push(enemy.relVelocityCross);
        values.push(enemy.facingUs);
        values.push(enemy.facingOffsetToEnemy);
        values.push(enemy.facingLeadVelocity);
        values.push(enemy.facingLeadFacing);
    }
    
    // Hazards (4 * 5 = 20 values)
    for (const hazard of state.hazards) {
        values.push(hazard.present);
        values.push(hazard.distance);
        values.push(hazard.angleFromForward);
        values.push(hazard.relVelocityToward);
        values.push(hazard.relVelocityCross);
    }
    
    // Blockers (4 * 4 = 16 values)
    for (const blocker of state.blockers) {
        values.push(blocker.present);
        values.push(blocker.distance);
        values.push(blocker.angleFromForward);
        values.push(blocker.radius);
    }
    
    return new Float32Array(values);
}

// ============================================================================
// Utility
// ============================================================================

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

// ============================================================================
// Exports
// ============================================================================

export {
    computeSensingState,
    flattenSensingState,
    SENSING_STATE_SIZE,
    MAX_ENEMIES,
    MAX_HAZARDS,
    MAX_BLOCKERS,
    ARENA_DIAGONAL
};
