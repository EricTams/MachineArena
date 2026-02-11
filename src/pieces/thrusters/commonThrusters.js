// Common tier thruster definitions
// Decent thrusters with interesting trade-offs

import * as THREE from 'three';

// ============================================================================
// Definitions
// ============================================================================

const COMMON_THRUSTER_DEFINITIONS = {
    thruster_inferno: {
        name: 'Inferno 470',
        equipmentType: 'thruster',
        tier: 'common',
        cost: 3,
        width: 1,
        height: 1,
        mass: 0.4,
        color: 0xDD3311,    // Hot red
        thrustForce: 1.8,
        // Overheat behavior
        overheat: {
            threshold: 0.6,      // Overheats if used more than 60% of the last 10 seconds
            windowSeconds: 10,   // Tracking window
            cooldownTime: 3.0    // 3 seconds fully disabled when overheated
        },
        description: 'Hot-running thruster that punches above its price. Great for burst maneuvers, punishes sustained use.'
    },
    thruster_gemini: {
        name: 'Gemini Sidecar',
        equipmentType: 'thruster',
        tier: 'common',
        cost: 4,
        width: 1,
        height: 1,
        mass: 0.5,
        color: 0x44AA88,    // Teal-green
        thrustForce: 1.0,
        // Side thrust -- secondary nozzle fires perpendicular (90 CW from main)
        sideThrust: {
            force: 1.0,
            angleOffset: -Math.PI / 2  // 90 degrees clockwise from main exhaust
        },
        description: 'Dual-nozzle thruster with an independent lateral jet. Gives strafing from a single mount point.'
    }
};

// ============================================================================
// Mesh creation
// ============================================================================

/**
 * Creates mesh for the Inferno 470
 * Aggressive red thruster with heat-glow exhaust
 * @returns {THREE.Group}
 */
function createInfernoMesh() {
    const def = COMMON_THRUSTER_DEFINITIONS.thruster_inferno;
    const group = new THREE.Group();

    // Main cone
    const coneGeometry = new THREE.ConeGeometry(0.3, 0.5, 8);
    const coneMaterial = new THREE.MeshStandardMaterial({
        color: def.color,
        roughness: 0.35,
        metalness: 0.5
    });
    const cone = new THREE.Mesh(coneGeometry, coneMaterial);
    cone.rotation.x = Math.PI;
    cone.position.set(0, 0.1, 0.15);
    group.add(cone);

    // Hot exhaust ring -- bright orange-red glow
    const ringGeometry = new THREE.TorusGeometry(0.2, 0.05, 8, 16);
    const ringMaterial = new THREE.MeshStandardMaterial({
        color: 0xFF4400,
        emissive: 0xFF2200,
        emissiveIntensity: 0.5
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, 0.35, 0.15);
    group.add(ring);

    return group;
}

/**
 * Creates mesh for the Gemini Sidecar
 * Dual-nozzle design with a visible secondary cone offset to the side
 * @returns {THREE.Group}
 */
function createGeminiMesh() {
    const def = COMMON_THRUSTER_DEFINITIONS.thruster_gemini;
    const group = new THREE.Group();

    // Main cone
    const coneGeometry = new THREE.ConeGeometry(0.25, 0.45, 8);
    const coneMaterial = new THREE.MeshStandardMaterial({
        color: def.color,
        roughness: 0.4,
        metalness: 0.4
    });
    const cone = new THREE.Mesh(coneGeometry, coneMaterial);
    cone.rotation.x = Math.PI;
    cone.position.set(-0.08, 0.1, 0.15);
    group.add(cone);

    // Main exhaust ring
    const ringGeometry = new THREE.TorusGeometry(0.16, 0.04, 8, 16);
    const ringMaterial = new THREE.MeshStandardMaterial({
        color: 0x44DD99,
        emissive: 0x22AA66,
        emissiveIntensity: 0.3
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(-0.08, 0.35, 0.15);
    group.add(ring);

    // Secondary side cone -- smaller, angled to the right (+X)
    const sideConeGeometry = new THREE.ConeGeometry(0.18, 0.3, 6);
    const sideConeMaterial = new THREE.MeshStandardMaterial({
        color: def.color,
        roughness: 0.4,
        metalness: 0.4
    });
    const sideCone = new THREE.Mesh(sideConeGeometry, sideConeMaterial);
    // Rotate so exhaust points +X (rightward): rotate around Z by -90 degrees
    sideCone.rotation.x = Math.PI;
    sideCone.rotation.z = Math.PI / 2;
    sideCone.position.set(0.12, 0.05, 0.15);
    group.add(sideCone);

    // Side exhaust ring
    const sideRingGeometry = new THREE.TorusGeometry(0.11, 0.03, 6, 12);
    const sideRingMaterial = new THREE.MeshStandardMaterial({
        color: 0x44DD99,
        emissive: 0x22AA66,
        emissiveIntensity: 0.3
    });
    const sideRing = new THREE.Mesh(sideRingGeometry, sideRingMaterial);
    // Ring faces +X direction
    sideRing.rotation.y = Math.PI / 2;
    sideRing.position.set(0.28, 0.05, 0.15);
    group.add(sideRing);

    return group;
}

/**
 * Creates a mesh for a common-tier thruster
 * @param {string} type - The thruster type key
 * @returns {THREE.Group|null}
 */
function createCommonThrusterMesh(type) {
    switch (type) {
        case 'thruster_inferno': return createInfernoMesh();
        case 'thruster_gemini': return createGeminiMesh();
        default: return null;
    }
}

export { COMMON_THRUSTER_DEFINITIONS, createCommonThrusterMesh };
