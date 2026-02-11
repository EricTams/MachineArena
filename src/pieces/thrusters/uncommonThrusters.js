// Uncommon tier thruster definitions
// Strong thrusters approaching rare quality, with mild trade-offs

import * as THREE from 'three';

// ============================================================================
// Definitions
// ============================================================================

const UNCOMMON_THRUSTER_DEFINITIONS = {
    thruster_torrent: {
        name: 'Torrent Retrojet',
        equipmentType: 'thruster',
        tier: 'uncommon',
        cost: 5,
        width: 1,
        height: 1,
        mass: 0.45,
        color: 0x3366AA,    // Navy blue
        thrustForce: 1.4,
        // Back thrust -- secondary retro-nozzle fires in reverse direction
        backThrust: {
            force: 1.4,
            angleOffset: Math.PI  // 180 degrees from main exhaust
        },
        description: 'A solid thruster with a built-in retro-nozzle. Not as refined as Axiom\'s offerings, but pilots who need braking on a budget swear by it.'
    },
    thruster_volkov: {
        name: 'Volkov KR-7',
        equipmentType: 'thruster',
        tier: 'uncommon',
        cost: 6,
        width: 1,
        height: 1,
        mass: 0.5,
        color: 0x667744,    // Industrial grey-green
        thrustForce: 1.9,
        // Short ramp up
        rampUp: {
            startPercent: 0.4,   // Starts at 40% thrust
            rampTime: 0.5        // Reaches full power in 0.5s
        },
        // Fuel hungry (future disadvantage when fuel system exists)
        fuelHungry: true,
        description: 'Industrial-grade brute-force engine. Nearly matches rare-tier output, but heavier and needs a moment to spool. Guzzles fuel like nothing else.'
    }
};

// ============================================================================
// Mesh creation
// ============================================================================

/**
 * Creates mesh for the Torrent Retrojet
 * Dual-ended design with visible retro-nozzle at the back
 * @returns {THREE.Group}
 */
function createTorrentMesh() {
    const def = UNCOMMON_THRUSTER_DEFINITIONS.thruster_torrent;
    const group = new THREE.Group();

    // Main cone -- forward thrust
    const coneGeometry = new THREE.ConeGeometry(0.3, 0.45, 8);
    const coneMaterial = new THREE.MeshStandardMaterial({
        color: def.color,
        roughness: 0.35,
        metalness: 0.5
    });
    const cone = new THREE.Mesh(coneGeometry, coneMaterial);
    cone.rotation.x = Math.PI;
    cone.position.set(0, 0.12, 0.15);
    group.add(cone);

    // Main exhaust ring
    const ringGeometry = new THREE.TorusGeometry(0.2, 0.05, 8, 16);
    const ringMaterial = new THREE.MeshStandardMaterial({
        color: 0x4488CC,
        emissive: 0x2255AA,
        emissiveIntensity: 0.3
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, 0.35, 0.15);
    group.add(ring);

    // Retro cone -- smaller, points opposite direction (-Y)
    const retroConeGeometry = new THREE.ConeGeometry(0.2, 0.3, 8);
    const retroConeMaterial = new THREE.MeshStandardMaterial({
        color: def.color,
        roughness: 0.35,
        metalness: 0.5
    });
    const retroCone = new THREE.Mesh(retroConeGeometry, retroConeMaterial);
    // Don't flip -- exhaust opening at base points -Y
    retroCone.position.set(0, -0.05, 0.15);
    group.add(retroCone);

    // Retro exhaust ring
    const retroRingGeometry = new THREE.TorusGeometry(0.13, 0.03, 8, 12);
    const retroRingMaterial = new THREE.MeshStandardMaterial({
        color: 0x4488CC,
        emissive: 0x2255AA,
        emissiveIntensity: 0.25
    });
    const retroRing = new THREE.Mesh(retroRingGeometry, retroRingMaterial);
    retroRing.rotation.x = Math.PI / 2;
    retroRing.position.set(0, -0.2, 0.15);
    group.add(retroRing);

    return group;
}

/**
 * Creates mesh for the Volkov KR-7
 * Heavy industrial look -- wide, angular, utilitarian
 * @returns {THREE.Group}
 */
function createVolkovMesh() {
    const def = UNCOMMON_THRUSTER_DEFINITIONS.thruster_volkov;
    const group = new THREE.Group();

    // Boxy industrial cone -- wider base
    const coneGeometry = new THREE.ConeGeometry(0.35, 0.5, 6);
    const coneMaterial = new THREE.MeshStandardMaterial({
        color: def.color,
        roughness: 0.6,
        metalness: 0.4
    });
    const cone = new THREE.Mesh(coneGeometry, coneMaterial);
    cone.rotation.x = Math.PI;
    cone.position.set(0, 0.1, 0.15);
    group.add(cone);

    // Industrial exhaust ring -- thick and sturdy
    const ringGeometry = new THREE.TorusGeometry(0.24, 0.06, 8, 16);
    const ringMaterial = new THREE.MeshStandardMaterial({
        color: 0x88AA44,
        emissive: 0x556622,
        emissiveIntensity: 0.3
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, 0.35, 0.15);
    group.add(ring);

    // Extra housing band -- industrial detail
    const bandGeometry = new THREE.TorusGeometry(0.32, 0.03, 6, 12);
    const bandMaterial = new THREE.MeshStandardMaterial({
        color: 0x444433,
        roughness: 0.7,
        metalness: 0.3
    });
    const band = new THREE.Mesh(bandGeometry, bandMaterial);
    band.rotation.x = Math.PI / 2;
    band.position.set(0, 0.0, 0.15);
    group.add(band);

    return group;
}

/**
 * Creates a mesh for an uncommon-tier thruster
 * @param {string} type - The thruster type key
 * @returns {THREE.Group|null}
 */
function createUncommonThrusterMesh(type) {
    switch (type) {
        case 'thruster_torrent': return createTorrentMesh();
        case 'thruster_volkov': return createVolkovMesh();
        default: return null;
    }
}

export { UNCOMMON_THRUSTER_DEFINITIONS, createUncommonThrusterMesh };
