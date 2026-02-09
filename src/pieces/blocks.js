// Block piece definitions - structural pieces that provide buildable space

import * as THREE from 'three';

// Block definitions with mass, size, and tier
const BLOCK_DEFINITIONS = {
    // ---- Starter tier ----
    // Salvaged junk. Fragile, heavy for what they are. Cheap filler.
    block_scrap_1x1: {
        name: 'Scrap Panel',
        tier: 'starter',
        cost: 1,
        width: 1,
        height: 1,
        mass: 1.2,
        hp: 3,          // area (1) × 3 — half the durability of common
        color: 0x7a6b5a, // Dull brown-grey
        description: 'Salvaged scrap metal. Fragile and heavy, but better than nothing.'
    },
    block_scrap_2x1: {
        name: 'Scrap Slab',
        tier: 'starter',
        cost: 1,
        width: 2,
        height: 1,
        mass: 2.8,
        hp: 7,          // ~3.5 per area — marginally better than scrap panel
        color: 0x6e6354, // Darker brown-grey
        description: 'Welded scrap plates. Heavy and prone to cracking, but covers more ground.'
    },

    // ---- Common tier ----
    // Solid all-rounders. Balanced mass-to-HP ratio.
    block_1x1: {
        name: '1x1 Block',
        tier: 'common',
        cost: 1,
        width: 1,
        height: 1,
        mass: 1,
        hp: 6,          // area (1) × 6
        color: 0x5588cc
    },
    block_2x1: {
        name: '2x1 Block',
        tier: 'common',
        cost: 2,
        width: 2,
        height: 1,
        mass: 2,
        hp: 12,         // area (2) × 6
        color: 0x55aa88
    },
    block_2x2: {
        name: '2x2 Block',
        tier: 'common',
        cost: 3,
        width: 2,
        height: 2,
        mass: 4,
        hp: 24,         // area (4) × 6
        color: 0xaa8855
    },

    // ---- Uncommon tier ----
    // Reinforced plating. Tougher than common, but heavier.
    block_armor_1x1: {
        name: 'Armor Block',
        tier: 'uncommon',
        cost: 4,
        width: 1,
        height: 1,
        mass: 1.8,
        hp: 12,         // area (1) × 12 — double the durability of common
        color: 0x556677, // Steel blue-grey
        description: 'Reinforced armor plating. Takes a beating, but weighs you down.'
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
    const tier = definition ? definition.tier : 'common';
    
    // Create a slightly inset box for visual appeal
    const inset = 0.05;
    
    // Tier-based visual tweaks
    let depth, roughness, metalness, edgeOpacity;
    if (tier === 'starter') {
        depth = 0.25;       // Thinner — flimsy
        roughness = 0.85;
        metalness = 0.1;
        edgeOpacity = 0.15;
    } else if (tier === 'uncommon') {
        depth = 0.38;       // Thicker — armored
        roughness = 0.4;
        metalness = 0.6;
        edgeOpacity = 0.45;
    } else {
        depth = 0.3;        // Standard
        roughness = 0.7;
        metalness = 0.2;
        edgeOpacity = 0.3;
    }
    
    const geometry = new THREE.BoxGeometry(
        width - inset * 2,
        height - inset * 2,
        depth
    );
    
    const material = new THREE.MeshStandardMaterial({
        color: color,
        roughness: roughness,
        metalness: metalness
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    
    // Add edge highlight
    const edgeGeometry = new THREE.EdgesGeometry(geometry);
    const edgeMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: edgeOpacity });
    const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
    mesh.add(edges);
    
    return mesh;
}

export { BLOCK_DEFINITIONS, createBlockMesh };
