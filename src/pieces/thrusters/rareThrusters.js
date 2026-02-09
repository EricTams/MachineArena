// Rare tier thruster definitions
// Premium, no-compromise thrusters

import * as THREE from 'three';

// ============================================================================
// Definitions
// ============================================================================

const RARE_THRUSTER_DEFINITIONS = {
    thruster_axiom_pd7: {
        name: 'Axiom PD-7',
        equipmentType: 'thruster',
        tier: 'rare',
        cost: 12,
        width: 1,
        height: 1,
        mass: 0.3,
        color: 0x44cccc,    // Original thruster color -- Axiom cyan
        thrustForce: 1.0,
        // No drawbacks -- the gold standard
        description: 'Axiom\'s flagship. Industry-leading thrust-to-weight ratio, zero compromises. Overpriced, overengineered, and worth every credit.'
    }
};

// ============================================================================
// Mesh creation
// ============================================================================

/**
 * Creates mesh for the Axiom Dynamics PD-7
 * Sleek, premium design -- the original thruster mesh, slightly refined
 * @returns {THREE.Group}
 */
function createAxiomPD7Mesh() {
    const def = RARE_THRUSTER_DEFINITIONS.thruster_axiom_pd7;
    const group = new THREE.Group();

    // Sleek cone -- same as original thruster
    const coneGeometry = new THREE.ConeGeometry(0.3, 0.5, 8);
    const coneMaterial = new THREE.MeshStandardMaterial({
        color: def.color,
        roughness: 0.4,
        metalness: 0.4
    });
    const cone = new THREE.Mesh(coneGeometry, coneMaterial);
    cone.rotation.x = Math.PI;
    cone.position.set(0, 0.1, 0.15);
    group.add(cone);

    // Exhaust ring -- original orange glow
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

/**
 * Creates a mesh for a rare-tier thruster
 * @param {string} type - The thruster type key
 * @returns {THREE.Group|null}
 */
function createRareThrusterMesh(type) {
    switch (type) {
        case 'thruster_axiom_pd7': return createAxiomPD7Mesh();
        default: return null;
    }
}

export { RARE_THRUSTER_DEFINITIONS, createRareThrusterMesh };
