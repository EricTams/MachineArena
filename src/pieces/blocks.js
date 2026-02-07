// Block piece definitions - structural pieces that provide buildable space

import * as THREE from 'three';

// Block definitions with mass and size
const BLOCK_DEFINITIONS = {
    block_1x1: {
        name: '1x1 Block',
        width: 1,
        height: 1,
        mass: 1,
        hp: 6,  // area (1) × 6
        color: 0x5588cc
    },
    block_2x1: {
        name: '2x1 Block',
        width: 2,
        height: 1,
        mass: 2,
        hp: 12,  // area (2) × 6
        color: 0x55aa88
    },
    block_2x2: {
        name: '2x2 Block',
        width: 2,
        height: 2,
        mass: 4,
        hp: 24,  // area (4) × 6
        color: 0xaa8855
    }
};

/**
 * Creates a 3D mesh for a block piece
 * @param {string} type - The block type
 * @param {number} width - Block width in cells
 * @param {number} height - Block height in cells
 * @returns {THREE.Mesh} The block mesh
 */
function createBlockMesh(type, width, height) {
    const definition = BLOCK_DEFINITIONS[type];
    const color = definition ? definition.color : 0x888888;
    
    // Create a slightly inset box for visual appeal
    const depth = 0.3;
    const inset = 0.05;
    
    const geometry = new THREE.BoxGeometry(
        width - inset * 2,
        height - inset * 2,
        depth
    );
    
    const material = new THREE.MeshStandardMaterial({
        color: color,
        roughness: 0.7,
        metalness: 0.2
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    
    // Add edge highlight
    const edgeGeometry = new THREE.EdgesGeometry(geometry);
    const edgeMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3 });
    const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
    mesh.add(edges);
    
    return mesh;
}

export { BLOCK_DEFINITIONS, createBlockMesh };
