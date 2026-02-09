// Arena ship - builds a compound physics body from grid pieces

import * as THREE from 'three';
import { addToArena, removeFromArena, getArenaPhysicsScale } from './arenaPhysics.js';
import { EQUIPMENT_DEFINITIONS, isThrusterType, isCannonType } from '../pieces/equipment.js';
import { CORE_DEFINITION } from '../pieces/core.js';
import { getEquipmentForward } from '../math.js';

// Matter.js is loaded globally from CDN
const Body = Matter.Body;
const Bodies = Matter.Bodies;

// Ship scale in arena (relative to design screen)
const ARENA_SHIP_SCALE = 0.75;

// Team colors for ship tinting
const TEAM_COLORS = {
    1: 0x4488ff,  // Team 1 (player) - blue
    2: 0xff4444   // Team 2 (enemy) - red
};

/**
 * Creates an arena ship from grid pieces
 * @param {Array} gridPieces - Pieces placed on the design grid
 * @param {object} options - Optional settings for the ship
 * @param {number} options.team - Team number (1 = player, 2 = enemy)
 * @param {number} options.spawnX - Spawn X position in world coordinates
 * @param {number} options.spawnY - Spawn Y position in world coordinates
 * @param {object} options.controller - Controller instance for this ship
 * @returns {object} Arena ship object with body, mesh, thrusters, core info
 */
function createArenaShip(gridPieces, options = {}) {
    if (!gridPieces || gridPieces.length === 0) {
        console.warn('No grid pieces to create ship from');
        return null;
    }
    
    const team = options.team ?? 1;
    const spawnX = options.spawnX ?? 0;
    const spawnY = options.spawnY ?? 0;
    const controller = options.controller ?? null;
    
    // Calculate center of mass
    const com = calculateCenterOfMass(gridPieces);
    
    // Build compound body parts
    const { bodyParts, parts, thrusters, cannons, core } = buildBodyParts(gridPieces, com);
    
    if (bodyParts.length === 0) {
        console.warn('No body parts created');
        return null;
    }
    
    // Create compound body
    const compoundBody = Body.create({
        parts: bodyParts,
        frictionAir: 0.12,
        friction: 0.1,
        restitution: 0.3
    });
    
    // Add to arena physics world
    addToArena(compoundBody);
    
    // Set spawn position
    const scale = getArenaPhysicsScale();
    Body.setPosition(compoundBody, {
        x: spawnX * scale,
        y: -spawnY * scale
    });
    
    // Create visual mesh group (pass cannons and parts to link meshes)
    const meshGroup = createShipMesh(gridPieces, com, cannons, parts);
    
    // Apply team color tint to the ship
    applyTeamColor(meshGroup, team);
    
    const ship = {
        body: compoundBody,
        mesh: meshGroup,
        parts: parts,       // Part tracking with HP and broken state
        thrusters: thrusters,
        cannons: cannons,
        core: core,
        centerOfMass: com,
        scale: ARENA_SHIP_SCALE,
        team: team,
        controller: controller,
        destroyed: false    // Set to true when core is destroyed
    };
    
    return ship;
}

/**
 * Applies team color tint to a ship mesh
 * @param {THREE.Group} meshGroup - Ship mesh group
 * @param {number} team - Team number
 */
function applyTeamColor(meshGroup, team) {
    const teamColor = TEAM_COLORS[team] ?? TEAM_COLORS[1];
    const tintColor = new THREE.Color(teamColor);
    
    meshGroup.traverse((child) => {
        if (child.isMesh && child.material) {
            // Clone material to avoid affecting original pieces
            if (Array.isArray(child.material)) {
                child.material = child.material.map(m => {
                    const cloned = m.clone();
                    // Blend team color with original color
                    if (cloned.color) {
                        cloned.color.lerp(tintColor, 0.3);
                    }
                    return cloned;
                });
            } else {
                child.material = child.material.clone();
                if (child.material.color) {
                    child.material.color.lerp(tintColor, 0.3);
                }
            }
        }
    });
}

/**
 * Calculates center of mass from grid pieces
 * @param {Array} gridPieces - Grid pieces
 * @returns {{x: number, y: number}} Center of mass in grid coordinates
 */
function calculateCenterOfMass(gridPieces) {
    let totalMass = 0;
    let weightedX = 0;
    let weightedY = 0;
    
    for (const piece of gridPieces) {
        const mass = piece.mass || 1;
        totalMass += mass;
        weightedX += piece.x * mass;
        weightedY += piece.y * mass;
    }
    
    if (totalMass === 0) {
        return { x: 0, y: 0 };
    }
    
    return {
        x: weightedX / totalMass,
        y: weightedY / totalMass
    };
}

/**
 * Builds Matter.js body parts from grid pieces
 * @param {Array} gridPieces - Grid pieces
 * @param {object} com - Center of mass
 * @returns {object} Body parts array, parts tracking array, and thruster/core/cannon info
 */
function buildBodyParts(gridPieces, com) {
    const scale = getArenaPhysicsScale();
    const bodyParts = [];
    const parts = [];  // Tracks HP and broken state for each part
    const thrusters = [];
    const cannons = [];
    let core = null;
    
    for (const piece of gridPieces) {
        // Position relative to center of mass, scaled for arena
        const localX = (piece.x - com.x) * ARENA_SHIP_SCALE;
        const localY = (piece.y - com.y) * ARENA_SHIP_SCALE;
        
        // Convert to physics coordinates
        const physX = localX * scale;
        const physY = -localY * scale;
        
        // Scaled dimensions
        const physWidth = piece.width * ARENA_SHIP_SCALE * scale;
        const physHeight = piece.height * ARENA_SHIP_SCALE * scale;
        
        // Create body part
        const bodyPart = Bodies.rectangle(physX, physY, physWidth, physHeight, {
            angle: -piece.angle,
            label: `part_${piece.id}`
        });
        
        bodyParts.push(bodyPart);
        
        // Determine HP from piece definition
        const isCore = piece.category === 'core' || piece.type === 'core';
        const hp = piece.definition?.hp ?? (isCore ? CORE_DEFINITION.hp : 6);
        
        // Track part with HP and broken state
        parts.push({
            body: bodyPart,
            piece: piece,
            hp: hp,
            maxHp: hp,
            broken: false,
            isCore: isCore,
            mesh: null  // Will be linked in createShipMesh
        });
        
        // Track thrusters for force application
        if (isThrusterType(piece.type)) {
            const thrusterDef = piece.definition || EQUIPMENT_DEFINITIONS[piece.type];
            const mainExhaustDir = getEquipmentForward(piece.angle);
            
            const mainThruster = {
                piece: piece,
                localPos: { x: localX, y: localY },
                localAngle: piece.angle,
                thrustForce: thrusterDef.thrustForce,
                // Exhaust direction = equipment forward = +Y in local space at angle 0
                // Ship is pushed opposite to exhaust direction
                exhaustDir: mainExhaustDir,
                disabled: false,  // Set to true when supporting block breaks
                isVirtual: false,
                parentThruster: null,
                // Behavior config (used by thrustSystem for ramp-up / overheat)
                rampUp: thrusterDef.rampUp || null,
                overheat: thrusterDef.overheat || null,
                // Runtime state for behaviors
                activeTime: 0,         // How long thruster has been continuously firing
                firedThisFrame: false,  // Reset each frame, set by thrust application
                usageHistory: [],       // Sliding window for overheat tracking
                overheated: false,      // Set to true during cooldown
                cooldownTimer: 0        // Remaining cooldown time
            };
            thrusters.push(mainThruster);
            
            // Inject virtual thruster for side thrust
            if (thrusterDef.sideThrust) {
                const sideAngle = piece.angle + thrusterDef.sideThrust.angleOffset;
                const sideExhaustDir = getEquipmentForward(sideAngle);
                thrusters.push({
                    piece: piece,
                    localPos: { x: localX, y: localY },
                    localAngle: sideAngle,
                    thrustForce: thrusterDef.sideThrust.force,
                    exhaustDir: sideExhaustDir,
                    disabled: false,
                    isVirtual: true,
                    parentThruster: mainThruster,
                    // Virtual thrusters share parent's behavior config
                    rampUp: thrusterDef.rampUp || null,
                    overheat: thrusterDef.overheat || null,
                    activeTime: 0,
                    firedThisFrame: false,
                    usageHistory: [],
                    overheated: false,
                    cooldownTimer: 0
                });
            }
            
            // Inject virtual thruster for back thrust
            if (thrusterDef.backThrust) {
                const backAngle = piece.angle + thrusterDef.backThrust.angleOffset;
                const backExhaustDir = getEquipmentForward(backAngle);
                thrusters.push({
                    piece: piece,
                    localPos: { x: localX, y: localY },
                    localAngle: backAngle,
                    thrustForce: thrusterDef.backThrust.force,
                    exhaustDir: backExhaustDir,
                    disabled: false,
                    isVirtual: true,
                    parentThruster: mainThruster,
                    rampUp: thrusterDef.rampUp || null,
                    overheat: thrusterDef.overheat || null,
                    activeTime: 0,
                    firedThisFrame: false,
                    usageHistory: [],
                    overheated: false,
                    cooldownTimer: 0
                });
            }
        }
        
        // Track cannons for weapon system
        if (isCannonType(piece.type)) {
            const cannonDef = piece.definition || EQUIPMENT_DEFINITIONS[piece.type];
            cannons.push({
                piece: piece,
                localPos: { x: localX, y: localY },
                localAngle: piece.angle,
                // Weapon stats from definition
                firingArc: cannonDef.firingArc,
                aimingArc: cannonDef.aimingArc,
                aimingSpeed: cannonDef.aimingSpeed,
                projectileSpeed: cannonDef.projectileSpeed,
                projectileLifetime: cannonDef.projectileLifetime,
                reloadTime: cannonDef.reloadTime,
                damage: cannonDef.damage,
                // Spread
                spread: cannonDef.spread || 0,
                // Burst
                burstCount: cannonDef.burstCount || 1,
                burstDelay: cannonDef.burstDelay || 0,
                // Penetration
                penetrating: cannonDef.penetrating || false,
                // Runtime state
                currentAimOffset: 0,    // Current turret rotation offset from base angle
                reloadTimer: 0,         // Time until can fire again
                burstRemaining: 0,      // Shots left in current burst
                burstTimer: 0,          // Countdown to next burst shot
                disabled: false         // Set to true when supporting block breaks
            });
        }
        
        // Track core for omni-thrust
        if (isCore) {
            core = {
                piece: piece,
                localPos: { x: localX, y: localY },
                omniThrustForce: CORE_DEFINITION.omniThrustForce,
                angularThrustForce: CORE_DEFINITION.angularThrustForce
            };
        }
    }
    
    return { bodyParts, parts, thrusters, cannons, core };
}

/**
 * Creates the Three.js mesh group for the ship
 * Clones and scales meshes from original pieces
 * @param {Array} gridPieces - Grid pieces
 * @param {object} com - Center of mass
 * @param {Array} cannons - Cannon data array to attach turret mesh references
 * @param {Array} parts - Parts array to attach mesh references for damage visuals
 * @returns {THREE.Group} Ship mesh group
 */
function createShipMesh(gridPieces, com, cannons, parts) {
    const group = new THREE.Group();
    
    // Build maps for piece id lookups
    const cannonsByPieceId = new Map();
    for (const cannon of cannons) {
        cannonsByPieceId.set(cannon.piece.id, cannon);
    }
    
    const partsByPieceId = new Map();
    for (const part of parts) {
        partsByPieceId.set(part.piece.id, part);
    }
    
    for (const piece of gridPieces) {
        if (!piece.mesh) continue;
        
        // Clone the mesh
        const clonedMesh = piece.mesh.clone();
        
        // Position relative to center of mass
        const localX = (piece.x - com.x) * ARENA_SHIP_SCALE;
        const localY = (piece.y - com.y) * ARENA_SHIP_SCALE;
        
        clonedMesh.position.set(localX, localY, 0);
        clonedMesh.rotation.z = piece.angle;
        clonedMesh.scale.setScalar(ARENA_SHIP_SCALE);
        
        group.add(clonedMesh);
        
        // Link mesh to part for damage visuals
        const partData = partsByPieceId.get(piece.id);
        if (partData) {
            partData.mesh = clonedMesh;
        }
        
        // If this is a cannon, find and store the turret mesh reference
        if (isCannonType(piece.type)) {
            const cannonData = cannonsByPieceId.get(piece.id);
            if (cannonData) {
                const turret = clonedMesh.getObjectByName('turret');
                if (turret) {
                    cannonData.turretMesh = turret;
                }
            }
        }
    }
    
    return group;
}

/**
 * Updates ship mesh position from physics body
 * @param {object} ship - Arena ship object
 */
function syncShipMeshToBody(ship) {
    if (!ship || !ship.body || !ship.mesh) return;
    
    const scale = getArenaPhysicsScale();
    const body = ship.body;
    
    // Convert physics position to world position
    ship.mesh.position.x = body.position.x / scale;
    ship.mesh.position.y = -body.position.y / scale;
    ship.mesh.rotation.z = -body.angle;
}

/**
 * Destroys an arena ship
 * @param {object} ship - Arena ship object
 * @param {THREE.Scene} scene - The scene to remove mesh from
 */
function destroyArenaShip(ship, scene) {
    if (!ship) return;
    
    if (ship.body) {
        removeFromArena(ship.body);
    }
    
    if (ship.mesh && scene) {
        scene.remove(ship.mesh);
        // Dispose of geometries and materials
        ship.mesh.traverse((child) => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(m => m.dispose());
                } else {
                    child.material.dispose();
                }
            }
        });
    }
}

function getArenaShipScale() { return ARENA_SHIP_SCALE; }

/**
 * Applies a very dark tint to a mesh to indicate it's broken
 * @param {THREE.Object3D} mesh - The mesh to tint
 */
function applyBrokenTint(mesh) {
    if (!mesh) return;
    
    const darkMultiplier = 0.2;  // Very dark tint
    
    mesh.traverse((child) => {
        if (child.isMesh && child.material) {
            // Handle array of materials or single material
            const materials = Array.isArray(child.material) 
                ? child.material 
                : [child.material];
            
            for (const mat of materials) {
                // Darken the color
                if (mat.color) {
                    mat.color.multiplyScalar(darkMultiplier);
                }
                // Remove emissive glow
                if (mat.emissive) {
                    mat.emissive.setHex(0x000000);
                }
                if (mat.emissiveIntensity !== undefined) {
                    mat.emissiveIntensity = 0;
                }
            }
        }
        
        // Also darken line materials (edges)
        if (child.isLineSegments && child.material) {
            child.material.color.multiplyScalar(darkMultiplier);
            child.material.opacity *= darkMultiplier;
        }
    });
}

export {
    createArenaShip,
    syncShipMeshToBody,
    destroyArenaShip,
    calculateCenterOfMass,
    getArenaShipScale,
    applyBrokenTint
};
