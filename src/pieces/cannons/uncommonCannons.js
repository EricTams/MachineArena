// Uncommon tier cannon definitions
// Specialized multi-cell cannons with strong performance

import * as THREE from 'three';

// ============================================================================
// Definitions
// ============================================================================

const UNCOMMON_CANNON_DEFINITIONS = {
    cannon_hailfire: {
        name: 'Hailfire',
        equipmentType: 'cannon',
        tier: 'uncommon',
        cost: 12,
        width: 2,
        height: 1,
        mass: 1.2,
        color: 0xBB5533,       // Warm orange-red
        // Weapon aiming
        firingArc: Math.PI * 2 / 3,    // 120 degrees
        aimingArc: Math.PI / 3,         // 60 degrees
        aimingSpeed: 1.8,
        // Projectile properties
        projectileSpeed: 20,
        projectileLifetime: 0.7,
        damage: 3,
        // Reload
        reloadTime: 2.0,
        // Spread
        spread: 0.12,
        // Burst
        burstCount: 3,
        burstDelay: 0.08,
        description: '3-round burst suppression cannon. Wide arc, high burst damage, keeps targets pinned. Bulkier frame to handle the recoil.'
    },
    cannon_drake_lp30: {
        name: 'Drake LP-30',
        equipmentType: 'cannon',
        tier: 'uncommon',
        cost: 11,
        width: 1,
        height: 2,
        mass: 0.8,
        color: 0x3355AA,       // Cool steel blue
        // Weapon aiming
        firingArc: Math.PI / 4,         // 45 degrees
        aimingArc: Math.PI / 6,         // 30 degrees
        aimingSpeed: 0.6,               // Slow, deliberate
        // Projectile properties
        projectileSpeed: 34,
        projectileLifetime: 1.2,
        damage: 6,
        // Reload
        reloadTime: 2.5,
        // Spread
        spread: 0.02,
        description: 'Precision long-range cannon. Extended barrel for accuracy. Narrow firing arc, high projectile speed, extremely tight spread. A sniper\'s tool.'
    }
};

// ============================================================================
// Mesh creation
// ============================================================================

/**
 * Creates mesh for the Hailfire
 * Wide 2x1 suppression cannon with triple barrel arrangement
 * @returns {THREE.Group}
 */
function createHailfireMesh() {
    const def = UNCOMMON_CANNON_DEFINITIONS.cannon_hailfire;
    const group = new THREE.Group();

    // --- Reinforced mounting platform spanning 2x1 footprint (static) ---
    const plateGeometry = new THREE.BoxGeometry(1.88, 0.88, 0.05);
    const plateMaterial = new THREE.MeshStandardMaterial({
        color: 0x774433,
        roughness: 0.5,
        metalness: 0.4
    });
    const plate = new THREE.Mesh(plateGeometry, plateMaterial);
    plate.position.z = 0.025;
    group.add(plate);

    // Armored side rails along X
    const railGeometry = new THREE.BoxGeometry(1.82, 0.08, 0.08);
    const railMaterial = new THREE.MeshStandardMaterial({
        color: 0x664422,
        roughness: 0.45,
        metalness: 0.55
    });
    const railFront = new THREE.Mesh(railGeometry, railMaterial);
    railFront.position.set(0, 0.35, 0.06);
    group.add(railFront);
    const railBack = new THREE.Mesh(railGeometry, railMaterial);
    railBack.position.set(0, -0.35, 0.06);
    group.add(railBack);

    // Reinforcement struts
    const strutGeometry = new THREE.BoxGeometry(0.06, 0.62, 0.06);
    const strutMaterial = new THREE.MeshStandardMaterial({
        color: 0x664422,
        roughness: 0.45,
        metalness: 0.55
    });
    const strutL = new THREE.Mesh(strutGeometry, strutMaterial);
    strutL.position.set(-0.75, 0, 0.06);
    group.add(strutL);
    const strutR = new THREE.Mesh(strutGeometry, strutMaterial);
    strutR.position.set(0.75, 0, 0.06);
    group.add(strutR);

    // Turret mount base (raised cylinder)
    const baseGeometry = new THREE.CylinderGeometry(0.4, 0.45, 0.15, 8);
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

    // Wide housing for the burst mechanism
    const housingGeometry = new THREE.CylinderGeometry(0.3, 0.35, 0.14, 8);
    const housingMaterial = new THREE.MeshStandardMaterial({
        color: 0x884422,
        roughness: 0.4,
        metalness: 0.6
    });
    const housing = new THREE.Mesh(housingGeometry, housingMaterial);
    housing.rotation.x = Math.PI / 2;
    turret.add(housing);

    // Triple barrel arrangement
    const barrelMaterial = new THREE.MeshStandardMaterial({
        color: 0x333333,
        roughness: 0.3,
        metalness: 0.7
    });

    const barrelGeometry = new THREE.CylinderGeometry(0.06, 0.09, 0.35, 6);

    // Center barrel
    const barrelC = new THREE.Mesh(barrelGeometry, barrelMaterial);
    barrelC.position.set(0, 0.24, 0);
    turret.add(barrelC);

    // Left barrel
    const barrelL = new THREE.Mesh(barrelGeometry, barrelMaterial);
    barrelL.position.set(-0.1, 0.22, 0);
    turret.add(barrelL);

    // Right barrel
    const barrelR = new THREE.Mesh(barrelGeometry, barrelMaterial);
    barrelR.position.set(0.1, 0.22, 0);
    turret.add(barrelR);

    group.add(turret);
    return group;
}

/**
 * Creates mesh for the Drake LP-30
 * Sleek 1x2 precision cannon with an elongated barrel
 * @returns {THREE.Group}
 */
function createDrakeMesh() {
    const def = UNCOMMON_CANNON_DEFINITIONS.cannon_drake_lp30;
    const group = new THREE.Group();

    // --- Sleek mounting rail spanning 1x2 footprint (static) ---
    const plateGeometry = new THREE.BoxGeometry(0.88, 1.88, 0.05);
    const plateMaterial = new THREE.MeshStandardMaterial({
        color: 0x224477,
        roughness: 0.4,
        metalness: 0.5
    });
    const plate = new THREE.Mesh(plateGeometry, plateMaterial);
    plate.position.z = 0.025;
    group.add(plate);

    // Precision guide rails along Y
    const railGeometry = new THREE.BoxGeometry(0.07, 1.82, 0.07);
    const railMaterial = new THREE.MeshStandardMaterial({
        color: 0x334466,
        roughness: 0.35,
        metalness: 0.6
    });
    const railL = new THREE.Mesh(railGeometry, railMaterial);
    railL.position.set(-0.35, 0, 0.06);
    group.add(railL);
    const railR = new THREE.Mesh(railGeometry, railMaterial);
    railR.position.set(0.35, 0, 0.06);
    group.add(railR);

    // Clamp details at top and bottom
    const clampGeometry = new THREE.BoxGeometry(0.78, 0.06, 0.05);
    const clampMaterial = new THREE.MeshStandardMaterial({
        color: 0x334466,
        roughness: 0.35,
        metalness: 0.6
    });
    const clampTop = new THREE.Mesh(clampGeometry, clampMaterial);
    clampTop.position.set(0, 0.78, 0.06);
    group.add(clampTop);
    const clampBot = new THREE.Mesh(clampGeometry, clampMaterial);
    clampBot.position.set(0, -0.78, 0.06);
    group.add(clampBot);

    // Turret mount base (compact cylinder)
    const baseGeometry = new THREE.CylinderGeometry(0.28, 0.32, 0.15, 8);
    const baseMaterial = new THREE.MeshStandardMaterial({
        color: def.color,
        roughness: 0.4,
        metalness: 0.6
    });
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.rotation.x = Math.PI / 2;
    base.position.z = 0.075;
    group.add(base);

    // Turret group (rotating part)
    const turret = new THREE.Group();
    turret.name = 'turret';
    turret.position.z = 0.15;

    // Sleek housing
    const housingGeometry = new THREE.CylinderGeometry(0.2, 0.24, 0.12, 8);
    const housingMaterial = new THREE.MeshStandardMaterial({
        color: 0x224488,
        roughness: 0.3,
        metalness: 0.7
    });
    const housing = new THREE.Mesh(housingGeometry, housingMaterial);
    housing.rotation.x = Math.PI / 2;
    turret.add(housing);

    // Long precision barrel -- extended for the 1x2 footprint
    const barrelGeometry = new THREE.CylinderGeometry(0.06, 0.1, 0.7, 8);
    const barrelMaterial = new THREE.MeshStandardMaterial({
        color: 0x222233,
        roughness: 0.2,
        metalness: 0.8
    });
    const barrel = new THREE.Mesh(barrelGeometry, barrelMaterial);
    barrel.position.set(0, 0.4, 0);
    turret.add(barrel);

    // Muzzle brake detail
    const muzzleGeometry = new THREE.CylinderGeometry(0.09, 0.06, 0.06, 8);
    const muzzleMaterial = new THREE.MeshStandardMaterial({
        color: 0x334466,
        roughness: 0.3,
        metalness: 0.7
    });
    const muzzle = new THREE.Mesh(muzzleGeometry, muzzleMaterial);
    muzzle.position.set(0, 0.78, 0);
    turret.add(muzzle);

    group.add(turret);
    return group;
}

/**
 * Creates a mesh for an uncommon-tier cannon
 * @param {string} type - The cannon type key
 * @returns {THREE.Group|null}
 */
function createUncommonCannonMesh(type) {
    switch (type) {
        case 'cannon_hailfire': return createHailfireMesh();
        case 'cannon_drake_lp30': return createDrakeMesh();
        default: return null;
    }
}

export { UNCOMMON_CANNON_DEFINITIONS, createUncommonCannonMesh };
