// Core piece definition - required piece with thrust capabilities

import * as THREE from 'three';

// Core definition
const CORE_DEFINITION = {
    name: 'Core',
    width: 1,
    height: 1,
    mass: 2,
    hp: 6,  // Core HP - destruction destroys the ship
    color: 0xffcc00,
    // Core-specific capabilities
    omniThrustForce: 1.0,    // Force for omni-directional movement
    angularThrustForce: 2.5  // Torque for rotation
};

/**
 * Creates a 3D mesh for the core piece
 * @returns {THREE.Group} The core mesh group
 */
function createCoreMesh() {
    const group = new THREE.Group();
    
    // Main body - octagonal prism shape
    const bodyGeometry = new THREE.CylinderGeometry(0.4, 0.4, 0.35, 8);
    const bodyMaterial = new THREE.MeshStandardMaterial({
        color: CORE_DEFINITION.color,
        roughness: 0.3,
        metalness: 0.6
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.rotation.x = Math.PI / 2;
    body.position.z = 0.175;
    group.add(body);
    
    // Center glow sphere
    const glowGeometry = new THREE.SphereGeometry(0.15, 16, 16);
    const glowMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xffaa00,
        emissiveIntensity: 0.8,
        roughness: 0.1,
        metalness: 0.1
    });
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    glow.position.z = 0.25;
    group.add(glow);
    
    // Thruster ports (4 small cylinders for omni-thrust visual)
    const portGeometry = new THREE.CylinderGeometry(0.08, 0.1, 0.1, 6);
    const portMaterial = new THREE.MeshStandardMaterial({
        color: 0x333333,
        roughness: 0.5,
        metalness: 0.5
    });
    
    const portPositions = [
        { x: 0.35, y: 0, rot: Math.PI / 2 },    // Right
        { x: -0.35, y: 0, rot: -Math.PI / 2 },  // Left
        { x: 0, y: 0.35, rot: 0 },              // Top
        { x: 0, y: -0.35, rot: Math.PI }        // Bottom
    ];
    
    for (const pos of portPositions) {
        const port = new THREE.Mesh(portGeometry, portMaterial);
        port.rotation.z = pos.rot;
        port.position.set(pos.x, pos.y, 0.175);
        group.add(port);
    }
    
    // Ring around body for visual interest
    const ringGeometry = new THREE.TorusGeometry(0.42, 0.03, 8, 16);
    const ringMaterial = new THREE.MeshStandardMaterial({
        color: 0x888888,
        roughness: 0.4,
        metalness: 0.6
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.position.z = 0.175;
    group.add(ring);
    
    return group;
}

export { CORE_DEFINITION, createCoreMesh };
