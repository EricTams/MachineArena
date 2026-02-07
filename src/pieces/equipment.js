// Equipment piece definitions - items that go on blocks

import * as THREE from 'three';

// Equipment definitions
const EQUIPMENT_DEFINITIONS = {
    cannon: {
        name: 'Cannon',
        width: 1,
        height: 1,
        mass: 0.5,
        color: 0xcc4444,
        // Weapon aiming
        firingArc: Math.PI / 2,      // 90 degrees total arc where weapon can fire
        aimingArc: Math.PI / 3,      // 60 degrees total arc where weapon can aim
        aimingSpeed: 1.5,            // Radians per second turret rotation
        // Projectile properties
        projectileSpeed: 24,         // Units per second
        projectileLifetime: 0.9,     // Seconds before despawn (range = speed * lifetime)
        damage: 3,                   // Damage per hit
        // Reload
        reloadTime: 2.0,             // Seconds between shots (slow)
    },
    thruster: {
        name: 'Thruster',
        width: 1,
        height: 1,
        mass: 0.3,
        color: 0x44cccc,
        // Future: thrust force, fuel consumption, etc.
        thrustForce: 1.0
    }
};

/**
 * Creates a 3D mesh for an equipment piece
 * @param {string} type - The equipment type
 * @returns {THREE.Group} The equipment mesh group
 */
function createEquipmentMesh(type) {
    const definition = EQUIPMENT_DEFINITIONS[type];
    const group = new THREE.Group();
    
    if (type === 'cannon') {
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
        // Default cylinder extends along Y, position so muzzle is at +Y
        barrel.position.set(0, 0.25, 0);
        turret.add(barrel);
        
        group.add(turret);
        
    } else if (type === 'thruster') {
        // Thruster: cone with exhaust ring - exhaust points +Y (forward direction)
        const coneGeometry = new THREE.ConeGeometry(0.3, 0.5, 8);
        const coneMaterial = new THREE.MeshStandardMaterial({
            color: definition.color,
            roughness: 0.4,
            metalness: 0.4
        });
        const cone = new THREE.Mesh(coneGeometry, coneMaterial);
        // Flip cone so base (exhaust opening) points +Y, apex points -Y
        cone.rotation.x = Math.PI;
        cone.position.set(0, 0.1, 0.15);
        group.add(cone);
        
        // Exhaust ring - positioned at +Y (forward/exhaust direction)
        const ringGeometry = new THREE.TorusGeometry(0.2, 0.05, 8, 16);
        const ringMaterial = new THREE.MeshStandardMaterial({
            color: 0xff6600,
            emissive: 0xff3300,
            emissiveIntensity: 0.3
        });
        const ring = new THREE.Mesh(ringGeometry, ringMaterial);
        // Ring faces +Y direction
        ring.rotation.x = Math.PI / 2;
        ring.position.set(0, 0.35, 0.15);
        group.add(ring);
    }
    
    return group;
}

export { EQUIPMENT_DEFINITIONS, createEquipmentMesh };
