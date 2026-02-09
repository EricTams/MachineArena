// Starter tier cannon definitions
// Cheap, oversized cannons with significant drawbacks

import * as THREE from 'three';

// ============================================================================
// Definitions
// ============================================================================

const STARTER_CANNON_DEFINITIONS = {
    cannon_popgun: {
        name: 'Popgun',
        equipmentType: 'cannon',
        tier: 'starter',
        cost: 2,
        width: 1,
        height: 2,
        mass: 0.5,
        color: 0xAA6633,        // Rusty orange-brown
        // Weapon aiming
        firingArc: Math.PI * 2 / 3,    // 120 degrees
        aimingArc: Math.PI / 2,         // 90 degrees
        aimingSpeed: 2.5,               // Fast, twitchy
        // Projectile properties
        projectileSpeed: 16,
        projectileLifetime: 0.5,
        damage: 1,
        // Reload
        reloadTime: 1.0,
        // Spread
        spread: 0.15,
        description: 'The cheapest gun in the game. Rapid-fire peashooter with pathetic damage, short range, and high spread. Takes up 2 cells for underwhelming output.'
    },
    cannon_ferros_sp1: {
        name: 'Ferros SP-1',
        equipmentType: 'cannon',
        tier: 'starter',
        cost: 3,
        width: 2,
        height: 1,
        mass: 1.0,
        color: 0x886644,        // Dull brown
        // Weapon aiming
        firingArc: Math.PI / 3,         // 60 degrees
        aimingArc: Math.PI * 2 / 9,     // 40 degrees
        aimingSpeed: 0.8,               // Slow, clunky
        // Projectile properties
        projectileSpeed: 18,
        projectileLifetime: 0.7,
        damage: 3,
        // Reload
        reloadTime: 2.8,
        // Spread
        spread: 0.18,
        description: 'Budget single-shot from a no-name manufacturer. Heavy, slow to reload, decent punch but sloppy accuracy. Wide footprint for a mediocre gun.'
    }
};

// ============================================================================
// Mesh creation
// ============================================================================

/**
 * Creates mesh for the Popgun
 * Cheap, oversized 1x2 turret with a thin, stubby barrel
 * @returns {THREE.Group}
 */
function createPopgunMesh() {
    const def = STARTER_CANNON_DEFINITIONS.cannon_popgun;
    const group = new THREE.Group();

    // --- Mounting plate spanning the 1x2 footprint (static) ---
    const plateGeometry = new THREE.BoxGeometry(0.88, 1.88, 0.04);
    const plateMaterial = new THREE.MeshStandardMaterial({
        color: 0x665544,
        roughness: 0.85,
        metalness: 0.15
    });
    const plate = new THREE.Mesh(plateGeometry, plateMaterial);
    plate.position.z = 0.02;
    group.add(plate);

    // Support rails running along the Y axis
    const railGeometry = new THREE.BoxGeometry(0.06, 1.8, 0.06);
    const railMaterial = new THREE.MeshStandardMaterial({
        color: 0x555555,
        roughness: 0.7,
        metalness: 0.3
    });
    const railL = new THREE.Mesh(railGeometry, railMaterial);
    railL.position.set(-0.36, 0, 0.05);
    group.add(railL);
    const railR = new THREE.Mesh(railGeometry, railMaterial);
    railR.position.set(0.36, 0, 0.05);
    group.add(railR);

    // Cross-braces for structural look
    const braceGeometry = new THREE.BoxGeometry(0.66, 0.05, 0.04);
    const braceMaterial = new THREE.MeshStandardMaterial({
        color: 0x555555,
        roughness: 0.7,
        metalness: 0.3
    });
    const braceTop = new THREE.Mesh(braceGeometry, braceMaterial);
    braceTop.position.set(0, 0.7, 0.05);
    group.add(braceTop);
    const braceBot = new THREE.Mesh(braceGeometry, braceMaterial);
    braceBot.position.set(0, -0.7, 0.05);
    group.add(braceBot);

    // Turret mount base (raised cylinder)
    const baseGeometry = new THREE.CylinderGeometry(0.3, 0.38, 0.12, 6);
    const baseMaterial = new THREE.MeshStandardMaterial({
        color: def.color,
        roughness: 0.8,
        metalness: 0.2
    });
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.rotation.x = Math.PI / 2;
    base.position.z = 0.06;
    group.add(base);

    // Turret group (rotating part)
    const turret = new THREE.Group();
    turret.name = 'turret';
    turret.position.z = 0.12;

    // Small crude housing
    const housingGeometry = new THREE.CylinderGeometry(0.18, 0.22, 0.1, 6);
    const housingMaterial = new THREE.MeshStandardMaterial({
        color: 0x776655,
        roughness: 0.7,
        metalness: 0.3
    });
    const housing = new THREE.Mesh(housingGeometry, housingMaterial);
    housing.rotation.x = Math.PI / 2;
    turret.add(housing);

    // Thin stubby barrel
    const barrelGeometry = new THREE.CylinderGeometry(0.05, 0.08, 0.3, 6);
    const barrelMaterial = new THREE.MeshStandardMaterial({
        color: 0x444444,
        roughness: 0.5,
        metalness: 0.4
    });
    const barrel = new THREE.Mesh(barrelGeometry, barrelMaterial);
    barrel.position.set(0, 0.2, 0);
    turret.add(barrel);

    group.add(turret);
    return group;
}

/**
 * Creates mesh for the Ferros SP-1
 * Boxy, wide 2x1 turret with industrial look
 * @returns {THREE.Group}
 */
function createFerrosMesh() {
    const def = STARTER_CANNON_DEFINITIONS.cannon_ferros_sp1;
    const group = new THREE.Group();

    // --- Mounting plate spanning the 2x1 footprint (static) ---
    const plateGeometry = new THREE.BoxGeometry(1.88, 0.88, 0.04);
    const plateMaterial = new THREE.MeshStandardMaterial({
        color: 0x665544,
        roughness: 0.85,
        metalness: 0.15
    });
    const plate = new THREE.Mesh(plateGeometry, plateMaterial);
    plate.position.z = 0.02;
    group.add(plate);

    // Support rails running along the X axis
    const railGeometry = new THREE.BoxGeometry(1.8, 0.06, 0.06);
    const railMaterial = new THREE.MeshStandardMaterial({
        color: 0x555555,
        roughness: 0.7,
        metalness: 0.3
    });
    const railFront = new THREE.Mesh(railGeometry, railMaterial);
    railFront.position.set(0, 0.36, 0.05);
    group.add(railFront);
    const railBack = new THREE.Mesh(railGeometry, railMaterial);
    railBack.position.set(0, -0.36, 0.05);
    group.add(railBack);

    // Cross-braces
    const braceGeometry = new THREE.BoxGeometry(0.05, 0.66, 0.04);
    const braceMaterial = new THREE.MeshStandardMaterial({
        color: 0x555555,
        roughness: 0.7,
        metalness: 0.3
    });
    const braceL = new THREE.Mesh(braceGeometry, braceMaterial);
    braceL.position.set(-0.7, 0, 0.05);
    group.add(braceL);
    const braceR = new THREE.Mesh(braceGeometry, braceMaterial);
    braceR.position.set(0.7, 0, 0.05);
    group.add(braceR);

    // Turret mount base (wider box)
    const baseGeometry = new THREE.BoxGeometry(0.8, 0.4, 0.12);
    const baseMaterial = new THREE.MeshStandardMaterial({
        color: def.color,
        roughness: 0.8,
        metalness: 0.2
    });
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.position.z = 0.06;
    group.add(base);

    // Turret group (rotating part)
    const turret = new THREE.Group();
    turret.name = 'turret';
    turret.position.z = 0.12;

    // Boxy housing
    const housingGeometry = new THREE.BoxGeometry(0.4, 0.3, 0.12);
    const housingMaterial = new THREE.MeshStandardMaterial({
        color: 0x665544,
        roughness: 0.7,
        metalness: 0.3
    });
    const housing = new THREE.Mesh(housingGeometry, housingMaterial);
    housing.position.z = 0.06;
    turret.add(housing);

    // Thick barrel
    const barrelGeometry = new THREE.CylinderGeometry(0.1, 0.13, 0.35, 6);
    const barrelMaterial = new THREE.MeshStandardMaterial({
        color: 0x444433,
        roughness: 0.5,
        metalness: 0.4
    });
    const barrel = new THREE.Mesh(barrelGeometry, barrelMaterial);
    barrel.position.set(0, 0.25, 0.06);
    turret.add(barrel);

    group.add(turret);
    return group;
}

/**
 * Creates a mesh for a starter-tier cannon
 * @param {string} type - The cannon type key
 * @returns {THREE.Group|null}
 */
function createStarterCannonMesh(type) {
    switch (type) {
        case 'cannon_popgun': return createPopgunMesh();
        case 'cannon_ferros_sp1': return createFerrosMesh();
        default: return null;
    }
}

export { STARTER_CANNON_DEFINITIONS, createStarterCannonMesh };
