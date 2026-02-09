// Common tier cannon definitions
// Compact, reliable 1x1 cannons -- the workhorses

import * as THREE from 'three';

// ============================================================================
// Definitions
// ============================================================================

const COMMON_CANNON_DEFINITIONS = {
    cannon_thumper: {
        name: 'Thumper',
        equipmentType: 'cannon',
        tier: 'common',
        cost: 4,
        width: 1,
        height: 1,
        mass: 0.5,
        color: 0xcc4444,
        // Weapon aiming
        firingArc: Math.PI / 2,         // 90 degrees
        aimingArc: Math.PI / 3,         // 60 degrees
        aimingSpeed: 1.5,
        // Projectile properties
        projectileSpeed: 24,
        projectileLifetime: 0.9,
        damage: 3,
        // Reload
        reloadTime: 2.0,
        // Spread
        spread: 0.05,
        description: 'Reliable mid-range workhorse. Every pilot\'s first real gun.'
    },
    cannon_volk_42: {
        name: 'Volk-42',
        equipmentType: 'cannon',
        tier: 'common',
        cost: 5,
        width: 1,
        height: 1,
        mass: 0.6,
        color: 0x667755,       // Military grey-green
        // Weapon aiming
        firingArc: Math.PI / 2,         // 90 degrees
        aimingArc: Math.PI / 4,         // 45 degrees
        aimingSpeed: 1.2,
        // Projectile properties
        projectileSpeed: 22,
        projectileLifetime: 0.8,
        damage: 2,
        // Reload
        reloadTime: 2.5,
        // Spread
        spread: 0.08,
        // Burst
        burstCount: 2,
        burstDelay: 0.1,
        description: '2-round burst cannon from a military contractor. Good DPS but chews through positioning with its kick.'
    }
};

// ============================================================================
// Mesh creation
// ============================================================================

/**
 * Creates mesh for the Thumper
 * Standard cannon turret -- the classic look (matches original cannon mesh)
 * @returns {THREE.Group}
 */
function createThumperMesh() {
    const def = COMMON_CANNON_DEFINITIONS.cannon_thumper;
    const group = new THREE.Group();

    // Cannon base (static part)
    const baseGeometry = new THREE.CylinderGeometry(0.3, 0.35, 0.15, 8);
    const baseMaterial = new THREE.MeshStandardMaterial({
        color: def.color,
        roughness: 0.5,
        metalness: 0.5
    });
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.rotation.x = Math.PI / 2;
    base.position.z = 0.075;
    group.add(base);

    // Turret group (rotating part)
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
 * Creates mesh for the Volk-42
 * Military look with angular housing and dual barrel hints
 * @returns {THREE.Group}
 */
function createVolkMesh() {
    const def = COMMON_CANNON_DEFINITIONS.cannon_volk_42;
    const group = new THREE.Group();

    // Base
    const baseGeometry = new THREE.CylinderGeometry(0.28, 0.33, 0.15, 6);
    const baseMaterial = new THREE.MeshStandardMaterial({
        color: def.color,
        roughness: 0.6,
        metalness: 0.4
    });
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.rotation.x = Math.PI / 2;
    base.position.z = 0.075;
    group.add(base);

    // Turret group (rotating part)
    const turret = new THREE.Group();
    turret.name = 'turret';
    turret.position.z = 0.15;

    // Angular housing -- box shape for military feel
    const housingGeometry = new THREE.BoxGeometry(0.3, 0.22, 0.12);
    const housingMaterial = new THREE.MeshStandardMaterial({
        color: 0x556644,
        roughness: 0.5,
        metalness: 0.5
    });
    const housing = new THREE.Mesh(housingGeometry, housingMaterial);
    housing.position.z = 0.06;
    turret.add(housing);

    // Dual barrel hints -- two thin barrels side by side
    const barrelMaterial = new THREE.MeshStandardMaterial({
        color: 0x333333,
        roughness: 0.3,
        metalness: 0.7
    });

    const barrelGeometry = new THREE.CylinderGeometry(0.05, 0.07, 0.35, 6);

    const barrelL = new THREE.Mesh(barrelGeometry, barrelMaterial);
    barrelL.position.set(-0.07, 0.22, 0.06);
    turret.add(barrelL);

    const barrelR = new THREE.Mesh(barrelGeometry, barrelMaterial);
    barrelR.position.set(0.07, 0.22, 0.06);
    turret.add(barrelR);

    group.add(turret);
    return group;
}

/**
 * Creates a mesh for a common-tier cannon
 * @param {string} type - The cannon type key
 * @returns {THREE.Group|null}
 */
function createCommonCannonMesh(type) {
    switch (type) {
        case 'cannon_thumper': return createThumperMesh();
        case 'cannon_volk_42': return createVolkMesh();
        default: return null;
    }
}

export { COMMON_CANNON_DEFINITIONS, createCommonCannonMesh };
