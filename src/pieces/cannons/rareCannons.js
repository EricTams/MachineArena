// Rare tier cannon definitions
// Premium, devastating weaponry

import * as THREE from 'three';

// ============================================================================
// Definitions
// ============================================================================

const RARE_CANNON_DEFINITIONS = {
    cannon_hyperion_rgx: {
        name: 'Hyperion RG-X',
        equipmentType: 'cannon',
        tier: 'rare',
        cost: 28,
        width: 1,
        height: 4,
        mass: 2.5,
        color: 0x8844CC,       // Deep purple
        // Weapon aiming
        firingArc: Math.PI / 6,         // 30 degrees
        aimingArc: Math.PI / 12,        // 15 degrees
        aimingSpeed: 0.3,               // Very slow, heavy turret
        // Projectile properties
        projectileSpeed: 60,
        projectileLifetime: 1.5,
        damage: 18,
        // Reload
        reloadTime: 4.5,
        // Spread
        spread: 0,
        // Penetration
        penetrating: true,
        description: 'Railgun. Devastating penetrating shot with extreme velocity, pinpoint accuracy, and a punishing reload. Worth building a ship around.'
    }
};

// ============================================================================
// Mesh creation
// ============================================================================

/**
 * Creates mesh for the Hyperion RG-X
 * Elongated 1x4 railgun with high-tech glowing elements
 * @returns {THREE.Group}
 */
function createHyperionMesh() {
    const def = RARE_CANNON_DEFINITIONS.cannon_hyperion_rgx;
    const group = new THREE.Group();

    // --- High-tech mounting rail spanning 1x4 footprint (static) ---
    const plateGeometry = new THREE.BoxGeometry(0.88, 3.88, 0.05);
    const plateMaterial = new THREE.MeshStandardMaterial({
        color: 0x3A2266,
        roughness: 0.3,
        metalness: 0.6
    });
    const plate = new THREE.Mesh(plateGeometry, plateMaterial);
    plate.position.z = 0.025;
    group.add(plate);

    // Main guide rails along Y
    const railGeometry = new THREE.BoxGeometry(0.08, 3.82, 0.08);
    const railMaterial = new THREE.MeshStandardMaterial({
        color: 0x443388,
        roughness: 0.3,
        metalness: 0.7
    });
    const railL = new THREE.Mesh(railGeometry, railMaterial);
    railL.position.set(-0.35, 0, 0.07);
    group.add(railL);
    const railR = new THREE.Mesh(railGeometry, railMaterial);
    railR.position.set(0.35, 0, 0.07);
    group.add(railR);

    // Periodic cross-braces with energy node accents
    const braceGeometry = new THREE.BoxGeometry(0.78, 0.06, 0.05);
    const braceMaterial = new THREE.MeshStandardMaterial({
        color: 0x443388,
        roughness: 0.3,
        metalness: 0.7
    });
    const nodeGeometry = new THREE.SphereGeometry(0.06, 8, 8);
    const nodeMaterial = new THREE.MeshStandardMaterial({
        color: 0xCC88FF,
        emissive: 0x8844CC,
        emissiveIntensity: 0.5
    });

    const braceYPositions = [-1.4, -0.5, 0.5, 1.4];
    for (const by of braceYPositions) {
        const brace = new THREE.Mesh(braceGeometry, braceMaterial);
        brace.position.set(0, by, 0.07);
        group.add(brace);

        // Glowing energy nodes at each end of the brace
        const nodeL = new THREE.Mesh(nodeGeometry, nodeMaterial);
        nodeL.position.set(-0.35, by, 0.1);
        group.add(nodeL);
        const nodeR = new THREE.Mesh(nodeGeometry, nodeMaterial);
        nodeR.position.set(0.35, by, 0.1);
        group.add(nodeR);
    }

    // Heavy turret mount base (raised cylinder)
    const baseGeometry = new THREE.CylinderGeometry(0.32, 0.38, 0.18, 8);
    const baseMaterial = new THREE.MeshStandardMaterial({
        color: def.color,
        roughness: 0.3,
        metalness: 0.7
    });
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.rotation.x = Math.PI / 2;
    base.position.z = 0.09;
    group.add(base);

    // Turret group (rotating part)
    const turret = new THREE.Group();
    turret.name = 'turret';
    turret.position.z = 0.18;

    // Main housing -- substantial for the power plant
    const housingGeometry = new THREE.CylinderGeometry(0.25, 0.3, 0.2, 8);
    const housingMaterial = new THREE.MeshStandardMaterial({
        color: 0x553399,
        roughness: 0.3,
        metalness: 0.7
    });
    const housing = new THREE.Mesh(housingGeometry, housingMaterial);
    housing.rotation.x = Math.PI / 2;
    turret.add(housing);

    // Capacitor banks flanking the barrel
    const capacitorGeometry = new THREE.BoxGeometry(0.12, 0.5, 0.1);
    const capacitorMaterial = new THREE.MeshStandardMaterial({
        color: 0x443388,
        roughness: 0.3,
        metalness: 0.6
    });
    const capL = new THREE.Mesh(capacitorGeometry, capacitorMaterial);
    capL.position.set(-0.16, 0.35, 0);
    turret.add(capL);

    const capR = new THREE.Mesh(capacitorGeometry, capacitorMaterial);
    capR.position.set(0.16, 0.35, 0);
    turret.add(capR);

    // Long railgun barrel -- extends along the 1x4 footprint
    const barrelGeometry = new THREE.CylinderGeometry(0.07, 0.12, 1.6, 8);
    const barrelMaterial = new THREE.MeshStandardMaterial({
        color: 0x222233,
        roughness: 0.2,
        metalness: 0.8
    });
    const barrel = new THREE.Mesh(barrelGeometry, barrelMaterial);
    barrel.position.set(0, 0.9, 0);
    turret.add(barrel);

    // Rail guides along the barrel
    const guideGeometry = new THREE.BoxGeometry(0.03, 1.4, 0.04);
    const guideMaterial = new THREE.MeshStandardMaterial({
        color: 0xAA66FF,
        emissive: 0x6633CC,
        emissiveIntensity: 0.4
    });
    const guideL = new THREE.Mesh(guideGeometry, guideMaterial);
    guideL.position.set(-0.09, 0.8, 0);
    turret.add(guideL);

    const guideR = new THREE.Mesh(guideGeometry, guideMaterial);
    guideR.position.set(0.09, 0.8, 0);
    turret.add(guideR);

    // Muzzle glow
    const muzzleGeometry = new THREE.TorusGeometry(0.08, 0.025, 8, 12);
    const muzzleMaterial = new THREE.MeshStandardMaterial({
        color: 0xCC88FF,
        emissive: 0xAA66FF,
        emissiveIntensity: 0.6
    });
    const muzzle = new THREE.Mesh(muzzleGeometry, muzzleMaterial);
    muzzle.rotation.x = Math.PI / 2;
    muzzle.position.set(0, 1.7, 0);
    turret.add(muzzle);

    group.add(turret);
    return group;
}

/**
 * Creates a mesh for a rare-tier cannon
 * @param {string} type - The cannon type key
 * @returns {THREE.Group|null}
 */
function createRareCannonMesh(type) {
    switch (type) {
        case 'cannon_hyperion_rgx': return createHyperionMesh();
        default: return null;
    }
}

export { RARE_CANNON_DEFINITIONS, createRareCannonMesh };
