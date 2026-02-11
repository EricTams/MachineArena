// Starter tier thruster definitions
// Cheap, basic thrusters with significant drawbacks

import * as THREE from 'three';

// ============================================================================
// Definitions
// ============================================================================

const STARTER_THRUSTER_DEFINITIONS = {
    thruster_rustbucket: {
        name: 'Rustbucket Pusher',
        equipmentType: 'thruster',
        tier: 'starter',
        cost: 1,
        width: 1,
        height: 1,
        mass: 0.7,          // Large Size -- heavy and bulky
        color: 0x8B6914,    // Rusty brown-gold
        thrustForce: 0.7,
        // No special behaviors, just weak and heavy
        description: 'Salvaged junkyard thruster. Cheap, heavy, underpowered. Gets the job done... barely.'
    },
    thruster_ignis: {
        name: 'Ignis Slow-Burn',
        equipmentType: 'thruster',
        tier: 'starter',
        cost: 3,
        width: 1,
        height: 1,
        mass: 0.35,
        color: 0xCC7722,    // Warm orange
        thrustForce: 1.4,   // At full ramp
        // Ramp up behavior
        rampUp: {
            startPercent: 0.2,   // Starts at 20% thrust
            rampTime: 1.0        // Takes 1.0s to reach full power
        },
        description: 'Budget thruster with a slow spool-up. Surprisingly capable once warm, terrible for quick reactions.'
    }
};

// ============================================================================
// Mesh creation
// ============================================================================

/**
 * Creates mesh for the Rustbucket Pusher
 * Bulky, oversized cone with a rough, industrial look
 * @returns {THREE.Group}
 */
function createRustbucketMesh() {
    const def = STARTER_THRUSTER_DEFINITIONS.thruster_rustbucket;
    const group = new THREE.Group();

    // Oversized cone body -- bigger than standard to show bulk
    const coneGeometry = new THREE.ConeGeometry(0.4, 0.55, 6); // Fewer segments = rougher
    const coneMaterial = new THREE.MeshStandardMaterial({
        color: def.color,
        roughness: 0.8,
        metalness: 0.2
    });
    const cone = new THREE.Mesh(coneGeometry, coneMaterial);
    cone.rotation.x = Math.PI;
    cone.position.set(0, 0.1, 0.15);
    group.add(cone);

    // Exhaust ring -- dull, worn-out look
    const ringGeometry = new THREE.TorusGeometry(0.28, 0.06, 6, 12);
    const ringMaterial = new THREE.MeshStandardMaterial({
        color: 0x995500,
        emissive: 0x331100,
        emissiveIntensity: 0.15
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, 0.35, 0.15);
    group.add(ring);

    return group;
}

/**
 * Creates mesh for the Ignis Slow-Burn
 * Sleek but small, with a warm glow suggesting heat build-up
 * @returns {THREE.Group}
 */
function createIgnisMesh() {
    const def = STARTER_THRUSTER_DEFINITIONS.thruster_ignis;
    const group = new THREE.Group();

    // Standard-sized cone
    const coneGeometry = new THREE.ConeGeometry(0.28, 0.45, 8);
    const coneMaterial = new THREE.MeshStandardMaterial({
        color: def.color,
        roughness: 0.5,
        metalness: 0.3
    });
    const cone = new THREE.Mesh(coneGeometry, coneMaterial);
    cone.rotation.x = Math.PI;
    cone.position.set(0, 0.1, 0.15);
    group.add(cone);

    // Warm exhaust ring
    const ringGeometry = new THREE.TorusGeometry(0.18, 0.04, 8, 16);
    const ringMaterial = new THREE.MeshStandardMaterial({
        color: 0xFF8800,
        emissive: 0xFF4400,
        emissiveIntensity: 0.25
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, 0.35, 0.15);
    group.add(ring);

    return group;
}

/**
 * Creates a mesh for a starter-tier thruster
 * @param {string} type - The thruster type key
 * @returns {THREE.Group|null}
 */
function createStarterThrusterMesh(type) {
    switch (type) {
        case 'thruster_rustbucket': return createRustbucketMesh();
        case 'thruster_ignis': return createIgnisMesh();
        default: return null;
    }
}

export { STARTER_THRUSTER_DEFINITIONS, createStarterThrusterMesh };
