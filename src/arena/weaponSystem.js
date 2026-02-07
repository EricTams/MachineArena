// Weapon system - handles cannon firing, projectiles, aiming, and damage

import * as THREE from 'three';
import { getArenaPhysicsScale } from './arenaPhysics.js';
import { applyBrokenTint } from './arenaShip.js';
import { EQUIPMENT_DEFINITIONS } from '../pieces/equipment.js';
import { normalizeAngle, rotateVector, angleTo, getEquipmentForward } from '../math.js';

// Default cannon damage (used if not specified)
const DEFAULT_CANNON_DAMAGE = EQUIPMENT_DEFINITIONS.cannon.damage;

// Active projectiles in the arena
const projectiles = [];

// Scene reference for adding/removing projectile meshes
let sceneRef = null;

// Projectile visual settings
const PROJECTILE_RADIUS = 0.15;
const PROJECTILE_COLOR = 0xff6600;

/**
 * Initializes the weapon system
 * @param {THREE.Scene} scene - The scene for projectile visuals
 */
function initWeaponSystem(scene) {
    sceneRef = scene;
    projectiles.length = 0;
}

/**
 * Cleans up the weapon system
 */
function cleanupWeaponSystem() {
    // Remove all projectile meshes
    for (const proj of projectiles) {
        if (proj.mesh && sceneRef) {
            sceneRef.remove(proj.mesh);
            proj.mesh.geometry.dispose();
            proj.mesh.material.dispose();
        }
    }
    projectiles.length = 0;
    sceneRef = null;
}

/**
 * Updates reload timers for all cannons on a ship
 * @param {object} ship - Arena ship with cannons array
 * @param {number} deltaTime - Time since last frame in seconds
 */
function updateCannonReloads(ship, deltaTime) {
    if (!ship || !ship.cannons) return;
    
    for (const cannon of ship.cannons) {
        if (cannon.reloadTimer > 0) {
            cannon.reloadTimer -= deltaTime;
        }
    }
}


/**
 * Updates cannon aiming toward a target position
 * @param {object} ship - Arena ship with cannons array
 * @param {object} targetPos - Target world position {x, y}
 * @param {number} deltaTime - Time since last frame in seconds
 */
function updateCannonAiming(ship, targetPos, deltaTime) {
    if (!ship || !ship.cannons) return;
    
    // If no target, just update turret visuals with current aim offset
    if (!targetPos) {
        updateTurretVisuals(ship);
        return;
    }
    
    const scale = getArenaPhysicsScale();
    
    // Get ship world position and rotation
    const shipX = ship.body.position.x / scale;
    const shipY = -ship.body.position.y / scale;
    const shipAngle = -ship.body.angle;
    
    for (const cannon of ship.cannons) {
        // Calculate cannon world position
        const rotatedLocal = rotateVector(cannon.localPos, shipAngle);
        const cannonWorldX = shipX + rotatedLocal.x;
        const cannonWorldY = shipY + rotatedLocal.y;
        
        // Calculate angle from cannon to target in world space (atan2 convention: 0 = +X)
        const angleToTarget = angleTo(cannonWorldX, cannonWorldY, targetPos.x, targetPos.y);
        
        // Calculate the cannon's base world angle in atan2 convention
        // Equipment forward is +Y at angle 0, which is atan2 angle π/2
        // So we add π/2 to convert from equipment convention to atan2 convention
        const cannonBaseWorldAngle = shipAngle + cannon.localAngle + Math.PI / 2;
        
        // Calculate desired aim offset (how much to rotate from base angle)
        const desiredOffset = normalizeAngle(angleToTarget - cannonBaseWorldAngle);
        
        // Clamp desired offset to aiming arc (half arc on each side)
        const halfAimArc = cannon.aimingArc / 2;
        const clampedDesiredOffset = Math.max(-halfAimArc, Math.min(halfAimArc, desiredOffset));
        
        // Rotate toward desired offset at aiming speed
        const currentOffset = cannon.currentAimOffset;
        const offsetDiff = clampedDesiredOffset - currentOffset;
        const maxRotation = cannon.aimingSpeed * deltaTime;
        
        if (Math.abs(offsetDiff) <= maxRotation) {
            cannon.currentAimOffset = clampedDesiredOffset;
        } else {
            cannon.currentAimOffset += Math.sign(offsetDiff) * maxRotation;
        }
    }
    
    // Update turret mesh rotations to match aim offsets
    updateTurretVisuals(ship);
}

/**
 * Updates turret mesh rotations to match current aim offsets
 * @param {object} ship - Arena ship with cannons array
 */
function updateTurretVisuals(ship) {
    if (!ship || !ship.cannons) return;
    
    for (const cannon of ship.cannons) {
        if (cannon.turretMesh) {
            // Rotate turret around Z axis by the aim offset
            cannon.turretMesh.rotation.z = cannon.currentAimOffset;
        }
    }
}

/**
 * Attempts to fire all ready cannons on a ship
 * @param {object} ship - Arena ship with cannons array
 * @param {object} targetPos - Target position to check firing arc against (optional)
 * @returns {number} Number of cannons that fired
 */
function fireAllCannons(ship, targetPos) {
    if (!ship || !ship.cannons || ship.cannons.length === 0) return 0;
    
    let firedCount = 0;
    const scale = getArenaPhysicsScale();
    
    // Get ship world position and rotation
    const shipX = ship.body.position.x / scale;
    const shipY = -ship.body.position.y / scale;
    const shipAngle = -ship.body.angle;
    
    // Get ship velocity in world coordinates for projectile inheritance
    // Note: Don't divide by scale - velocity is already in consistent units
    const shipVelX = ship.body.velocity.x;
    const shipVelY = -ship.body.velocity.y;
    
    for (const cannon of ship.cannons) {
        // Skip disabled cannons (on broken blocks)
        if (cannon.disabled) continue;
        
        // Check if cannon is ready to fire
        if (cannon.reloadTimer > 0) continue;
        
        // Calculate cannon world position
        const rotatedLocal = rotateVector(cannon.localPos, shipAngle);
        const worldX = shipX + rotatedLocal.x;
        const worldY = shipY + rotatedLocal.y;
        
        // Check if target is within firing arc
        if (targetPos) {
            const angleToTarget = angleTo(worldX, worldY, targetPos.x, targetPos.y);
            
            // Calculate cannon base world angle in atan2 convention
            // Equipment forward is +Y at angle 0, which is atan2 angle π/2
            const cannonBaseWorldAngle = shipAngle + cannon.localAngle + Math.PI / 2;
            const angleOffset = normalizeAngle(angleToTarget - cannonBaseWorldAngle);
            
            // Skip if target is outside firing arc
            const halfFiringArc = cannon.firingArc / 2;
            if (Math.abs(angleOffset) > halfFiringArc) continue;
        }
        
        // Calculate firing direction (cannon local angle + ship angle + aim offset)
        const firingAngle = shipAngle + cannon.localAngle + cannon.currentAimOffset;
        
        // Spawn projectile with ship velocity for inheritance, shooter reference, and damage
        spawnProjectile(
            worldX, worldY, firingAngle,
            cannon.projectileSpeed, cannon.projectileLifetime,
            shipVelX, shipVelY,
            ship,  // shooter reference
            cannon.damage ?? DEFAULT_CANNON_DAMAGE
        );
        
        // Start reload timer
        cannon.reloadTimer = cannon.reloadTime;
        firedCount++;
    }
    
    return firedCount;
}

/**
 * Spawns a projectile with optional velocity inheritance from shooter
 * @param {number} x - World X position
 * @param {number} y - World Y position
 * @param {number} angle - Direction angle in radians (equipment convention: 0 = +Y)
 * @param {number} speed - Base projectile speed
 * @param {number} lifetime - Time in seconds before despawn
 * @param {number} shipVelX - Ship velocity X component (optional)
 * @param {number} shipVelY - Ship velocity Y component (optional)
 * @param {object} shooter - The ship that fired this projectile (to avoid self-hits)
 * @param {number} damage - Damage this projectile deals on hit
 */
function spawnProjectile(x, y, angle, speed, lifetime, shipVelX = 0, shipVelY = 0, shooter = null, damage = DEFAULT_CANNON_DAMAGE) {
    // Create mesh
    const geometry = new THREE.SphereGeometry(PROJECTILE_RADIUS, 8, 8);
    const material = new THREE.MeshStandardMaterial({
        color: PROJECTILE_COLOR,
        emissive: PROJECTILE_COLOR,
        emissiveIntensity: 0.5
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, 0.2);
    
    if (sceneRef) {
        sceneRef.add(mesh);
    }
    
    // Calculate firing direction using equipment forward convention
    // Forward = +Y at angle 0, so: x = -sin(angle), y = cos(angle)
    const firingDir = getEquipmentForward(angle);
    const firingDirX = firingDir.x;
    const firingDirY = firingDir.y;
    
    // Ship's velocity component in the firing direction (dot product)
    // Only this parallel component affects shot speed - lateral movement is ignored
    // so shots always go exactly where the gun is aiming
    const shipForwardSpeed = shipVelX * firingDirX + shipVelY * firingDirY;
    
    // Effective projectile speed = base speed + ship's forward component
    // - Moving toward target: shots go faster
    // - Moving away from target: shots go slower
    // - Strafing: no effect (shots stay on target)
    // Floor at 0 so bullets don't travel backward
    const effectiveSpeed = Math.max(0, speed + shipForwardSpeed);
    
    // Final velocity is purely in the firing direction
    const vx = firingDirX * effectiveSpeed;
    const vy = firingDirY * effectiveSpeed;
    
    const projectile = {
        mesh: mesh,
        x: x,
        y: y,
        vx: vx,
        vy: vy,
        timeAlive: 0,
        lifetime: lifetime,
        shooter: shooter,  // Track shooter to avoid self-hits
        damage: damage     // Damage dealt on hit
    };
    
    projectiles.push(projectile);
}

/**
 * Updates all active projectiles
 * @param {number} deltaTime - Time since last frame in seconds
 */
function updateProjectiles(deltaTime) {
    for (let i = projectiles.length - 1; i >= 0; i--) {
        const proj = projectiles[i];
        
        // Move projectile
        proj.x += proj.vx * deltaTime;
        proj.y += proj.vy * deltaTime;
        proj.timeAlive += deltaTime;
        
        // Update mesh position
        proj.mesh.position.set(proj.x, proj.y, 0.2);
        
        // Check if exceeded lifetime
        if (proj.timeAlive >= proj.lifetime) {
            removeProjectile(i);
        }
    }
}

/**
 * Removes a projectile by index
 * @param {number} index - Projectile index
 */
function removeProjectile(index) {
    const proj = projectiles[index];
    if (proj.mesh && sceneRef) {
        sceneRef.remove(proj.mesh);
        proj.mesh.geometry.dispose();
        proj.mesh.material.dispose();
    }
    projectiles.splice(index, 1);
}

/**
 * Checks if a point is inside a Matter.js body part
 * @param {number} x - World X position
 * @param {number} y - World Y position
 * @param {object} body - Matter.js body
 * @param {object} shipBody - The compound ship body (for position reference)
 * @returns {boolean} True if point is inside the body
 */
function isPointInBody(x, y, body, shipBody) {
    const scale = getArenaPhysicsScale();
    
    // Convert world coords to physics coords
    const physX = x * scale;
    const physY = -y * scale;
    
    // Use Matter.js Vertices.contains for accurate collision
    return Matter.Vertices.contains(body.vertices, { x: physX, y: physY });
}

/**
 * Finds which part of a ship was hit at the given position
 * @param {object} ship - Arena ship
 * @param {number} x - World X position
 * @param {number} y - World Y position
 * @returns {object|null} The hit part, or null if no hit
 */
function findHitPart(ship, x, y) {
    if (!ship || !ship.parts) return null;
    
    for (const part of ship.parts) {
        // Skip broken parts (projectiles pass through)
        if (part.broken) continue;
        
        if (isPointInBody(x, y, part.body, ship.body)) {
            return part;
        }
    }
    
    return null;
}

/**
 * Applies damage to a ship part and handles breaking
 * @param {object} ship - Arena ship
 * @param {object} part - The part to damage
 * @param {number} damage - Amount of damage to apply
 * @returns {object} Result with {partBroken, coreDestroyed}
 */
function applyDamageToPart(ship, part, damage) {
    part.hp -= damage;
    
    const result = { partBroken: false, coreDestroyed: false };
    
    if (part.hp <= 0) {
        part.hp = 0;
        part.broken = true;
        result.partBroken = true;
        
        // Apply dark tint to the broken part's mesh
        if (part.mesh) {
            applyBrokenTint(part.mesh);
        }
        
        // Check if this was the core
        if (part.isCore) {
            result.coreDestroyed = true;
            ship.destroyed = true;
        }
        
        // Disable equipment on this broken piece
        disableEquipmentOnPiece(ship, part.piece);
    }
    
    return result;
}

/**
 * Disables equipment (cannons/thrusters) that were on a broken piece
 * @param {object} ship - Arena ship
 * @param {object} piece - The broken piece
 */
function disableEquipmentOnPiece(ship, piece) {
    // Check if this piece IS equipment (cannon or thruster)
    if (piece.type === 'cannon') {
        for (const cannon of ship.cannons) {
            if (cannon.piece.id === piece.id) {
                cannon.disabled = true;
                // Apply broken tint to cannon mesh if not already done
                break;
            }
        }
    }
    
    if (piece.type === 'thruster') {
        for (const thruster of ship.thrusters) {
            if (thruster.piece.id === piece.id) {
                thruster.disabled = true;
                break;
            }
        }
    }
    
    // AIDEV-NOTE: Equipment mounted ON blocks are separate pieces with their own parts.
    // When a block breaks, equipment on it should also break. 
    // However, in the current design, equipment occupies the same grid cells as blocks
    // but are separate pieces. We need to find equipment that overlaps this block's area.
    
    // For blocks, find overlapping equipment and disable them
    if (piece.category === 'block' || piece.category === 'core') {
        const blockCol = piece.gridCol;
        const blockRow = piece.gridRow;
        const blockWidth = piece.width;
        const blockHeight = piece.height;
        
        // Check cannons
        for (const cannon of ship.cannons) {
            if (cannon.disabled) continue;
            const cp = cannon.piece;
            if (piecesOverlap(blockCol, blockRow, blockWidth, blockHeight,
                             cp.gridCol, cp.gridRow, cp.width, cp.height)) {
                cannon.disabled = true;
                // Find and tint the cannon's part mesh
                const cannonPart = ship.parts.find(p => p.piece.id === cp.id);
                if (cannonPart && cannonPart.mesh && !cannonPart.broken) {
                    cannonPart.broken = true;
                    applyBrokenTint(cannonPart.mesh);
                }
            }
        }
        
        // Check thrusters
        for (const thruster of ship.thrusters) {
            if (thruster.disabled) continue;
            const tp = thruster.piece;
            if (piecesOverlap(blockCol, blockRow, blockWidth, blockHeight,
                             tp.gridCol, tp.gridRow, tp.width, tp.height)) {
                thruster.disabled = true;
                // Find and tint the thruster's part mesh
                const thrusterPart = ship.parts.find(p => p.piece.id === tp.id);
                if (thrusterPart && thrusterPart.mesh && !thrusterPart.broken) {
                    thrusterPart.broken = true;
                    applyBrokenTint(thrusterPart.mesh);
                }
            }
        }
    }
}

/**
 * Checks if two rectangular regions overlap
 */
function piecesOverlap(col1, row1, w1, h1, col2, row2, w2, h2) {
    return col1 < col2 + w2 && col1 + w1 > col2 &&
           row1 < row2 + h2 && row1 + h1 > row2;
}

/**
 * Checks all projectiles for collisions with ships and applies damage
 * @param {Array} ships - Array of arena ships
 * @returns {Array} Array of ships that were destroyed this frame
 */
function checkProjectileCollisions(ships) {
    if (!ships || ships.length === 0) return [];
    
    const destroyedShips = [];
    
    // Check each projectile (iterate backwards for safe removal)
    for (let i = projectiles.length - 1; i >= 0; i--) {
        const proj = projectiles[i];
        let hit = false;
        
        // Check against each ship
        for (const ship of ships) {
            // Skip destroyed ships
            if (ship.destroyed) continue;
            
            // Skip the shooter's own ship
            if (ship === proj.shooter) continue;
            
            // Find if projectile hit any part of this ship
            const hitPart = findHitPart(ship, proj.x, proj.y);
            
            if (hitPart) {
                // Apply damage to the hit part
                const result = applyDamageToPart(ship, hitPart, proj.damage);
                
                if (result.coreDestroyed) {
                    destroyedShips.push(ship);
                }
                
                hit = true;
                break;  // Projectile can only hit one part
            }
        }
        
        // Remove projectile if it hit something
        if (hit) {
            removeProjectile(i);
        }
    }
    
    return destroyedShips;
}

/**
 * Updates the entire weapon system
 * @param {object} ship - Arena ship
 * @param {number} deltaTime - Time since last frame
 * @param {object} targetPos - Target position for cannon aiming (optional)
 */
function updateWeaponSystem(ship, deltaTime, targetPos) {
    updateCannonReloads(ship, deltaTime);
    updateCannonAiming(ship, targetPos, deltaTime);
    updateProjectiles(deltaTime);
}

/**
 * Gets the current projectile count
 * @returns {number} Number of active projectiles
 */
function getProjectileCount() {
    return projectiles.length;
}

/**
 * Gets the array of active projectiles (for sensing system)
 * @returns {Array} Array of projectile objects with {x, y, vx, vy, shooter, damage}
 */
function getProjectiles() {
    return projectiles;
}

export {
    initWeaponSystem,
    cleanupWeaponSystem,
    updateWeaponSystem,
    fireAllCannons,
    getProjectileCount,
    getProjectiles,
    checkProjectileCollisions
};
