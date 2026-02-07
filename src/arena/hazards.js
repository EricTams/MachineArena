// Hazard system -- saw blades and energy balls

import * as THREE from 'three';
import { getArenaDimensions, getArenaPhysicsScale, applyForceAtPosition, applyTorque } from './arenaPhysics.js';
import { applyDamageToPart } from './weaponSystem.js';

// ---------------------------------------------------------------------------
// Saw blade constants
// ---------------------------------------------------------------------------
const SAW_RADIUS = 4;
const SAW_SPIN_SPEED = 6;          // rad/s
const SAW_MOVE_SPEED = 12;         // world units/s along wall
const SAW_DAMAGE = 3;
const SAW_HIT_COOLDOWN = 0.5;      // seconds between hits per ship
const SAW_PUSH_FORCE = 800;        // tangential impulse magnitude
const SAW_TORQUE = 50;             // angular impulse on hit
const SAW_INSET = 1;               // distance from wall inner edge to saw center

// ---------------------------------------------------------------------------
// Energy ball constants
// ---------------------------------------------------------------------------
const ENERGY_RADIUS = 2;
const ENERGY_SPEED = 8;            // world units/s (left → right)
const ENERGY_DAMAGE = 4;
const ENERGY_PUSH_FORCE = 1200;    // radial impulse magnitude
// Energy ball schedule: period = full traversal time (width + 2*radius) / speed
// Computed at init time per ball. No separate respawn delay -- balls run on a clock.

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------
let sceneRef = null;
let hazardGroup = null;            // THREE.Group holding all hazard meshes
const sawBlades = [];
const energyBalls = [];
const pathLines = [];              // visual path lines for energy arena

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Creates hazards for the given arena config
 * @param {THREE.Scene} scene
 * @param {object} arenaConfig - Arena type config from arenaTypes.js
 */
function initHazards(scene, arenaConfig) {
    sceneRef = scene;
    hazardGroup = new THREE.Group();
    scene.add(hazardGroup);

    for (const def of arenaConfig.hazards) {
        if (def.type === 'sawblade') createSawBlade(def);
        if (def.type === 'energyball') createEnergyBallRow(def);
    }
}

/**
 * Updates hazard positions and animations
 * @param {number} dt - Delta time in seconds
 */
function updateHazards(dt) {
    updateSawBlades(dt);
    updateEnergyBalls(dt);
}

/**
 * Checks hazard collisions against all ships, applies damage + impulse
 * @param {Array} ships
 * @returns {Array} Ships destroyed this frame
 */
function checkHazardCollisions(ships) {
    const destroyed = [];
    for (const ship of ships) {
        if (!ship || ship.destroyed || !ship.body) continue;
        checkSawCollisions(ship, destroyed);
        checkEnergyCollisions(ship, destroyed);
    }
    return destroyed;
}

/**
 * Removes all hazard visuals and clears state
 */
function cleanupHazards() {
    if (hazardGroup && sceneRef) {
        hazardGroup.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        });
        sceneRef.remove(hazardGroup);
    }
    for (const line of pathLines) {
        if (line && sceneRef) {
            sceneRef.remove(line);
            if (line.geometry) line.geometry.dispose();
            if (line.material) line.material.dispose();
        }
    }
    hazardGroup = null;
    sceneRef = null;
    sawBlades.length = 0;
    energyBalls.length = 0;
    pathLines.length = 0;
}

/**
 * Returns an array of {x, y, vx, vy, radius} for all active hazards (saw blades + energy balls).
 * Used by the sensing system to feed hazard data to the ML pipeline.
 */
function getHazardSensingData() {
    const result = [];

    // Saw blades -- compute velocity from a small lookahead along the wall loop
    for (const saw of sawBlades) {
        const EPSILON = 0.01;
        const ahead = positionOnLoop(saw.waypoints, saw.distance + EPSILON, saw.totalLen);
        const dx = ahead.x - saw.x;
        const dy = ahead.y - saw.y;
        const len = Math.hypot(dx, dy) || 1;
        result.push({
            x: saw.x,
            y: saw.y,
            vx: (dx / len) * SAW_MOVE_SPEED,
            vy: (dy / len) * SAW_MOVE_SPEED,
            radius: SAW_RADIUS
        });
    }

    // Energy balls -- only include alive (visible) balls
    for (const ball of energyBalls) {
        if (!ball.alive) continue;
        result.push({
            x: ball.x,
            y: ball.y,
            vx: ENERGY_SPEED,
            vy: 0,
            radius: ENERGY_RADIUS
        });
    }

    return result;
}

export { initHazards, updateHazards, checkHazardCollisions, cleanupHazards, getHazardSensingData };

// ===========================================================================
// Saw Blade internals
// ===========================================================================

/** Builds the wall-loop waypoints (counter-clockwise) */
function buildWallLoopPath() {
    const { width, height } = getArenaDimensions();
    const hw = width / 2 - SAW_INSET;
    const hh = height / 2 - SAW_INSET;
    // CCW starting at bottom-right: up right edge → left across top → down left edge → right across bottom
    return [
        { x: hw, y: -hh },   // bottom-right
        { x: hw, y: hh },    // top-right
        { x: -hw, y: hh },   // top-left
        { x: -hw, y: -hh }   // bottom-left
    ];
}

/** Total perimeter length of the wall loop */
function wallLoopLength(waypoints) {
    let total = 0;
    for (let i = 0; i < waypoints.length; i++) {
        const a = waypoints[i];
        const b = waypoints[(i + 1) % waypoints.length];
        total += Math.hypot(b.x - a.x, b.y - a.y);
    }
    return total;
}

/** Position along the wall loop at a given distance from the start */
function positionOnLoop(waypoints, dist, totalLen) {
    let d = ((dist % totalLen) + totalLen) % totalLen;
    for (let i = 0; i < waypoints.length; i++) {
        const a = waypoints[i];
        const b = waypoints[(i + 1) % waypoints.length];
        const segLen = Math.hypot(b.x - a.x, b.y - a.y);
        if (d <= segLen) {
            const t = d / segLen;
            return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
        }
        d -= segLen;
    }
    return { ...waypoints[0] };
}

/** Creates an 8-pointed star Shape */
function createStarShape(outerR, innerR, points) {
    const shape = new THREE.Shape();
    const step = Math.PI / points;
    for (let i = 0; i < points * 2; i++) {
        const r = i % 2 === 0 ? outerR : innerR;
        const angle = i * step - Math.PI / 2;
        const x = Math.cos(angle) * r;
        const y = Math.sin(angle) * r;
        if (i === 0) shape.moveTo(x, y);
        else shape.lineTo(x, y);
    }
    shape.closePath();
    return shape;
}

function createSawBlade(def) {
    const waypoints = buildWallLoopPath();
    const totalLen = wallLoopLength(waypoints);
    const startDist = (def.offsetFraction ?? 0) * totalLen;

    // Mesh: 8-pointed star
    const starShape = createStarShape(SAW_RADIUS, SAW_RADIUS * 0.5, 8);
    const geometry = new THREE.ShapeGeometry(starShape);
    const material = new THREE.MeshStandardMaterial({
        color: 0xcc5500,
        emissive: 0x882200,
        emissiveIntensity: 0.6,
        metalness: 0.8,
        roughness: 0.3,
        side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.z = 0.15;
    hazardGroup.add(mesh);

    const saw = {
        mesh,
        waypoints,
        totalLen,
        distance: startDist,
        x: 0,
        y: 0,
        hitCooldowns: new Map()   // shipId → remaining cooldown
    };

    // Set initial position
    const pos = positionOnLoop(waypoints, saw.distance, totalLen);
    saw.x = pos.x;
    saw.y = pos.y;
    mesh.position.set(pos.x, pos.y, mesh.position.z);

    sawBlades.push(saw);
}

function updateSawBlades(dt) {
    for (const saw of sawBlades) {
        // Move along wall loop
        saw.distance += SAW_MOVE_SPEED * dt;
        const pos = positionOnLoop(saw.waypoints, saw.distance, saw.totalLen);
        saw.x = pos.x;
        saw.y = pos.y;
        saw.mesh.position.set(pos.x, pos.y, saw.mesh.position.z);

        // Spin
        saw.mesh.rotation.z += SAW_SPIN_SPEED * dt;

        // Tick cooldowns
        for (const [id, remaining] of saw.hitCooldowns) {
            const next = remaining - dt;
            if (next <= 0) saw.hitCooldowns.delete(id);
            else saw.hitCooldowns.set(id, next);
        }
    }
}

function checkSawCollisions(ship, destroyed) {
    const scale = getArenaPhysicsScale();
    const shipX = ship.body.position.x / scale;
    const shipY = -ship.body.position.y / scale;
    const shipId = ship.body.id;

    for (const saw of sawBlades) {
        if (saw.hitCooldowns.has(shipId)) continue;

        // Find hit part using circle overlap
        const hitPart = findPartInRadius(ship, saw.x, saw.y, SAW_RADIUS, scale);
        if (!hitPart) continue;

        // Apply damage
        const result = applyDamageToPart(ship, hitPart, SAW_DAMAGE);
        if (result.coreDestroyed && !destroyed.includes(ship)) {
            destroyed.push(ship);
        }

        // Tangential force: perpendicular to (ship - saw), rotated CCW
        const dx = shipX - saw.x;
        const dy = shipY - saw.y;
        const dist = Math.hypot(dx, dy) || 1;
        // CCW tangent of the radial direction
        const tangentX = -dy / dist;
        const tangentY = dx / dist;

        applyForceAtPosition(ship.body,
            { x: shipX, y: shipY },
            { x: tangentX * SAW_PUSH_FORCE, y: tangentY * SAW_PUSH_FORCE }
        );
        applyTorque(ship.body, SAW_TORQUE);

        saw.hitCooldowns.set(shipId, SAW_HIT_COOLDOWN);
    }
}

// ===========================================================================
// Energy Ball internals
// ===========================================================================

function createEnergyBallRow(def) {
    const { width } = getArenaDimensions();
    const hw = width / 2;
    const count = def.count ?? 1;
    const offset = def.startOffset ?? 0;       // 0–1 fraction of arena width
    const spacing = width / count;

    // Draw path line on the floor
    drawPathLine(def.pathY, hw);

    for (let i = 0; i < count; i++) {
        const startX = -hw + spacing * (i + 0.5) + offset * width;
        // Wrap into arena bounds
        const wrappedX = ((startX + hw) % width + width) % width - hw;
        spawnEnergyBall(wrappedX, def.pathY);
    }
}

function drawPathLine(y, hw) {
    const points = [new THREE.Vector3(-hw, y, -0.05), new THREE.Vector3(hw, y, -0.05)];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
        color: 0x00ccff,
        transparent: true,
        opacity: 0.25
    });
    const line = new THREE.Line(geometry, material);
    if (sceneRef) sceneRef.add(line);
    pathLines.push(line);
}

function spawnEnergyBall(x, pathY) {
    const { width } = getArenaDimensions();
    const hw = width / 2;

    // Fixed schedule period: time for a ball to cross from left edge to right edge
    const traversal = (width + ENERGY_RADIUS * 2) / ENERGY_SPEED;

    // How far along the traversal the starting x represents
    const startElapsed = (x - (-hw - ENERGY_RADIUS)) / ENERGY_SPEED;

    const geometry = new THREE.SphereGeometry(ENERGY_RADIUS, 16, 16);
    const material = new THREE.MeshStandardMaterial({
        color: 0x00eeff,
        emissive: 0x00ccff,
        emissiveIntensity: 0.9,
        transparent: true,
        opacity: 0.85
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, pathY, 0.15);
    hazardGroup.add(mesh);

    energyBalls.push({
        mesh,
        x,
        y: pathY,
        pathY,
        alive: true,
        elapsed: startElapsed,   // time into current cycle
        period: traversal        // fixed cycle length
    });
}

function updateEnergyBalls(dt) {
    const { width } = getArenaDimensions();
    const hw = width / 2;
    const spawnX = -hw - ENERGY_RADIUS;

    for (const ball of energyBalls) {
        ball.elapsed += dt;

        // Check if the schedule says it's time for a new cycle
        if (ball.elapsed >= ball.period) {
            ball.elapsed -= ball.period;
            ball.alive = true;
            ball.x = spawnX + ball.elapsed * ENERGY_SPEED;
            ball.mesh.position.set(ball.x, ball.y, ball.mesh.position.z);
            ball.mesh.visible = true;
            continue;
        }

        if (!ball.alive) continue;

        ball.x = spawnX + ball.elapsed * ENERGY_SPEED;
        ball.mesh.position.set(ball.x, ball.y, ball.mesh.position.z);
    }
}

function checkEnergyCollisions(ship, destroyed) {
    const scale = getArenaPhysicsScale();
    const shipX = ship.body.position.x / scale;
    const shipY = -ship.body.position.y / scale;

    for (const ball of energyBalls) {
        if (!ball.alive) continue;

        const hitPart = findPartInRadius(ship, ball.x, ball.y, ENERGY_RADIUS, scale);
        if (!hitPart) continue;

        // Apply damage
        const result = applyDamageToPart(ship, hitPart, ENERGY_DAMAGE);
        if (result.coreDestroyed && !destroyed.includes(ship)) {
            destroyed.push(ship);
        }

        // Impulse: away from ball center through ship center of mass
        const dx = shipX - ball.x;
        const dy = shipY - ball.y;
        const dist = Math.hypot(dx, dy) || 1;
        const dirX = dx / dist;
        const dirY = dy / dist;

        applyForceAtPosition(ship.body,
            { x: shipX, y: shipY },
            { x: dirX * ENERGY_PUSH_FORCE, y: dirY * ENERGY_PUSH_FORCE }
        );

        // Consume the ball (schedule clock keeps ticking -- next ball on time)
        ball.alive = false;
        ball.mesh.visible = false;
    }
}

// ===========================================================================
// Shared helpers
// ===========================================================================

/**
 * Finds the first ship part whose center is within `radius` of (cx, cy).
 * Returns the part object or null.
 */
function findPartInRadius(ship, cx, cy, radius, scale) {
    if (!ship.parts) return null;
    for (const part of ship.parts) {
        if (part.broken) continue;
        // Part center in world coords
        const partX = part.body.position.x / scale;
        const partY = -part.body.position.y / scale;
        const dx = partX - cx;
        const dy = partY - cy;
        if (dx * dx + dy * dy <= radius * radius) {
            return part;
        }
    }
    return null;
}
