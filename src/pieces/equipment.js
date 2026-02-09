// Equipment piece definitions - items that go on blocks
//
// Central registry that aggregates all equipment from sub-files.
// Thruster variants live in src/pieces/thrusters/ (one file per tier).
// Cannon variants live in src/pieces/cannons/ (one file per tier).

import * as THREE from 'three';
import { STARTER_THRUSTER_DEFINITIONS, createStarterThrusterMesh } from './thrusters/starterThrusters.js';
import { COMMON_THRUSTER_DEFINITIONS, createCommonThrusterMesh } from './thrusters/commonThrusters.js';
import { UNCOMMON_THRUSTER_DEFINITIONS, createUncommonThrusterMesh } from './thrusters/uncommonThrusters.js';
import { RARE_THRUSTER_DEFINITIONS, createRareThrusterMesh } from './thrusters/rareThrusters.js';
import { STARTER_CANNON_DEFINITIONS, createStarterCannonMesh } from './cannons/starterCannons.js';
import { COMMON_CANNON_DEFINITIONS, createCommonCannonMesh } from './cannons/commonCannons.js';
import { UNCOMMON_CANNON_DEFINITIONS, createUncommonCannonMesh } from './cannons/uncommonCannons.js';
import { RARE_CANNON_DEFINITIONS, createRareCannonMesh } from './cannons/rareCannons.js';

// Equipment definitions -- merged from all sub-files
const EQUIPMENT_DEFINITIONS = {
    // Cannon variants (from tier files)
    ...STARTER_CANNON_DEFINITIONS,
    ...COMMON_CANNON_DEFINITIONS,
    ...UNCOMMON_CANNON_DEFINITIONS,
    ...RARE_CANNON_DEFINITIONS,

    // Thruster variants (from tier files)
    ...STARTER_THRUSTER_DEFINITIONS,
    ...COMMON_THRUSTER_DEFINITIONS,
    ...UNCOMMON_THRUSTER_DEFINITIONS,
    ...RARE_THRUSTER_DEFINITIONS
};

// ============================================================================
// Legacy type migration (old saves used 'thruster' as the type key)
// ============================================================================

/** Maps old equipment type keys to their new equivalents */
const LEGACY_TYPE_MAP = {
    'thruster': 'thruster_axiom_pd7',  // Old generic thruster -> Axiom PD-7 (rare)
    'cannon': 'cannon_thumper'         // Old generic cannon -> Thumper (common)
};

/**
 * Resolves a type key, mapping legacy keys to their current equivalents.
 * Returns the key unchanged if it's already valid.
 * @param {string} type - Equipment type key (possibly legacy)
 * @returns {string} Resolved type key
 */
function resolveLegacyType(type) {
    return LEGACY_TYPE_MAP[type] || type;
}

// ============================================================================
// Equipment type helpers
// ============================================================================

/**
 * Checks if an equipment type key is a thruster variant
 * @param {string} type - The equipment type key
 * @returns {boolean}
 */
function isThrusterType(type) {
    const def = EQUIPMENT_DEFINITIONS[type];
    return def ? def.equipmentType === 'thruster' : false;
}

/**
 * Checks if an equipment type key is a cannon variant
 * @param {string} type - The equipment type key
 * @returns {boolean}
 */
function isCannonType(type) {
    const def = EQUIPMENT_DEFINITIONS[type];
    return def ? def.equipmentType === 'cannon' : false;
}

/**
 * Gets the equipmentType for a given type key
 * @param {string} type - The equipment type key
 * @returns {string|null}
 */
function getEquipmentType(type) {
    const def = EQUIPMENT_DEFINITIONS[type];
    return def ? def.equipmentType : null;
}

// ============================================================================
// Mesh creation
// ============================================================================

/**
 * Creates a 3D mesh for an equipment piece
 * Routes to the appropriate mesh builder based on equipmentType
 * @param {string} type - The equipment type key
 * @returns {THREE.Group} The equipment mesh group
 */
function createEquipmentMesh(type) {
    const definition = EQUIPMENT_DEFINITIONS[type];
    if (!definition) {
        console.warn(`Unknown equipment type for mesh: ${type}`);
        return new THREE.Group();
    }

    // Route to sub-file mesh builders for thrusters
    if (definition.equipmentType === 'thruster') {
        const mesh = createStarterThrusterMesh(type)
            || createCommonThrusterMesh(type)
            || createUncommonThrusterMesh(type)
            || createRareThrusterMesh(type);
        if (mesh) return mesh;

        // Fallback: generic thruster mesh
        console.warn(`No mesh builder for thruster: ${type}, using fallback`);
        return createFallbackThrusterMesh(definition);
    }

    // Route to sub-file mesh builders for cannons
    if (definition.equipmentType === 'cannon') {
        const mesh = createStarterCannonMesh(type)
            || createCommonCannonMesh(type)
            || createUncommonCannonMesh(type)
            || createRareCannonMesh(type);
        if (mesh) return mesh;

        // Fallback: generic cannon mesh
        console.warn(`No mesh builder for cannon: ${type}, using fallback`);
        return createFallbackCannonMesh(definition);
    }

    // Unknown equipment
    console.warn(`No mesh builder for equipment: ${type}`);
    return new THREE.Group();
}

/**
 * Fallback generic cannon mesh
 * @param {object} definition - Cannon definition
 * @returns {THREE.Group}
 */
function createFallbackCannonMesh(definition) {
    const group = new THREE.Group();
    const w = definition.width || 1;
    const h = definition.height || 1;

    // --- Mounting plate if equipment spans multiple cells (static) ---
    if (w > 1 || h > 1) {
        const plateGeometry = new THREE.BoxGeometry(w - 0.12, h - 0.12, 0.04);
        const plateMaterial = new THREE.MeshStandardMaterial({
            color: 0x555555,
            roughness: 0.6,
            metalness: 0.4
        });
        const plate = new THREE.Mesh(plateGeometry, plateMaterial);
        plate.position.z = 0.02;
        group.add(plate);

        // Support rails along the longer axis
        const isWide = w >= h;
        const railLen = (isWide ? w : h) - 0.18;
        const railSpan = ((isWide ? h : w) / 2) - 0.1;
        const railGeometry = isWide
            ? new THREE.BoxGeometry(railLen, 0.06, 0.06)
            : new THREE.BoxGeometry(0.06, railLen, 0.06);
        const railMaterial = new THREE.MeshStandardMaterial({
            color: 0x666666,
            roughness: 0.5,
            metalness: 0.5
        });
        const rail1 = new THREE.Mesh(railGeometry, railMaterial);
        rail1.position.set(isWide ? 0 : -railSpan, isWide ? railSpan : 0, 0.05);
        group.add(rail1);
        const rail2 = new THREE.Mesh(railGeometry, railMaterial);
        rail2.position.set(isWide ? 0 : railSpan, isWide ? -railSpan : 0, 0.05);
        group.add(rail2);
    }

    // Cannon base (static part)
    const baseGeometry = new THREE.CylinderGeometry(0.3, 0.35, 0.15, 8);
    const baseMaterial = new THREE.MeshStandardMaterial({
        color: definition.color,
        roughness: 0.5,
        metalness: 0.5
    });
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.rotation.x = Math.PI / 2;
    base.position.z = 0.075;
    group.add(base);

    // Turret group (rotating part) - named for identification
    const turret = new THREE.Group();
    turret.name = 'turret';
    turret.position.z = 0.15;

    // Turret housing
    const housingGeometry = new THREE.CylinderGeometry(0.22, 0.25, 0.12, 8);
    const housingMaterial = new THREE.MeshStandardMaterial({
        color: 0x666666,
        roughness: 0.4,
        metalness: 0.6
    });
    const housing = new THREE.Mesh(housingGeometry, housingMaterial);
    housing.rotation.x = Math.PI / 2;
    turret.add(housing);

    // Barrel - points +Y (forward direction)
    const barrelGeometry = new THREE.CylinderGeometry(0.08, 0.12, 0.4, 8);
    const barrelMaterial = new THREE.MeshStandardMaterial({
        color: 0x333333,
        roughness: 0.3,
        metalness: 0.7
    });
    const barrel = new THREE.Mesh(barrelGeometry, barrelMaterial);
    barrel.position.set(0, 0.25, 0);
    turret.add(barrel);

    group.add(turret);
    return group;
}

/**
 * Fallback generic thruster mesh
 * @param {object} definition - Thruster definition
 * @returns {THREE.Group}
 */
function createFallbackThrusterMesh(definition) {
    const group = new THREE.Group();

    const coneGeometry = new THREE.ConeGeometry(0.3, 0.5, 8);
    const coneMaterial = new THREE.MeshStandardMaterial({
        color: definition.color || 0x44cccc,
        roughness: 0.4,
        metalness: 0.4
    });
    const cone = new THREE.Mesh(coneGeometry, coneMaterial);
    cone.rotation.x = Math.PI;
    cone.position.set(0, 0.1, 0.15);
    group.add(cone);

    const ringGeometry = new THREE.TorusGeometry(0.2, 0.05, 8, 16);
    const ringMaterial = new THREE.MeshStandardMaterial({
        color: 0xff6600,
        emissive: 0xff3300,
        emissiveIntensity: 0.3
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, 0.35, 0.15);
    group.add(ring);

    return group;
}

export { EQUIPMENT_DEFINITIONS, createEquipmentMesh, isThrusterType, isCannonType, getEquipmentType, resolveLegacyType };
