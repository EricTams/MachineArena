// Base piece factory and shared piece logic

import * as THREE from 'three';
import { getScene } from '../scene.js';
import { createPieceBody, removePieceBody } from '../physics.js';
import { getRandomBinPosition } from '../bin.js';
import { BLOCK_DEFINITIONS, createBlockMesh } from './blocks.js';
import { EQUIPMENT_DEFINITIONS, createEquipmentMesh, resolveLegacyType } from './equipment.js';
import { CORE_DEFINITION, createCoreMesh } from './core.js';

// Piece categories
const PieceCategory = {
    BLOCK: 'block',
    EQUIPMENT: 'equipment',
    CORE: 'core'
};

// Piece states
const PieceState = {
    IN_BIN: 'in_bin',       // Physically simulated in bin
    ON_GRID: 'on_grid',     // Fixed on grid (no physics)
    DRAGGING: 'dragging'    // Being dragged by player
};

/**
 * Returns the Z-offset for pieces on the grid.
 * Equipment renders above blocks so the art doesn't intersect.
 * @param {string} category - PieceCategory value
 * @returns {number} Z position for the piece mesh
 */
function getGridZ(category) {
    if (category === PieceCategory.EQUIPMENT) return 0.2;
    return 0; // blocks, core
}

/**
 * Creates a new piece instance
 * @param {string} type - The piece type (e.g., 'block_1x1', 'cannon', 'core')
 * @param {number} x - Initial X position
 * @param {number} y - Initial Y position
 * @returns {object} The piece instance
 */
function createPiece(type, x, y) {
    const resolvedType = resolveLegacyType(type);
    const definition = getPieceDefinition(resolvedType);
    if (!definition) {
        console.error(`Unknown piece type: ${resolvedType}`);
        return null;
    }
    
    const piece = {
        id: generatePieceId(),
        type: resolvedType,
        category: definition.category,
        x: x,
        y: y,
        angle: 0,
        width: definition.width,
        height: definition.height,
        mass: definition.mass,
        state: PieceState.IN_BIN,
        mesh: null,
        body: null,
        gridCol: null,
        gridRow: null,
        definition: definition
    };
    
    // Create visual mesh
    piece.mesh = createMeshForPiece(piece);
    piece.mesh.position.set(x, y, 0);
    getScene().add(piece.mesh);
    
    // Create physics body (starts in bin)
    piece.body = createPieceBody(x, y, piece.width, piece.height, {
        mass: piece.mass
    });
    piece.body.pieceId = piece.id; // Link body to piece
    
    return piece;
}

/**
 * Creates a piece ready for grid placement (no physics body)
 * @param {string} type - The piece type
 * @param {number} col - Grid column
 * @param {number} row - Grid row
 * @param {number} angle - Rotation angle in radians
 * @returns {object} The piece instance
 */
function createPieceForGrid(type, col, row, angle) {
    const resolvedType = resolveLegacyType(type);
    const definition = getPieceDefinition(resolvedType);
    if (!definition) {
        console.error(`Unknown piece type: ${resolvedType}`);
        return null;
    }
    
    // Determine if dimensions need swapping based on rotation
    // Swapped dimensions are used for collision/placement, not mesh geometry
    const rotations = Math.round(angle / (Math.PI / 2)) % 4;
    const isOddRotation = rotations % 2 === 1;
    const width = isOddRotation ? definition.height : definition.width;
    const height = isOddRotation ? definition.width : definition.height;
    
    const piece = {
        id: generatePieceId(),
        type: resolvedType,
        category: definition.category,
        x: 0,
        y: 0,
        angle: angle,
        width: width,
        height: height,
        mass: definition.mass,
        state: PieceState.ON_GRID,
        mesh: null,
        body: null,  // No physics body for grid pieces
        gridCol: col,
        gridRow: row,
        definition: definition
    };
    
    // Create visual mesh with ORIGINAL dimensions (placePieceOnGrid handles rotation)
    // Temporarily use original dimensions for mesh creation
    const originalWidth = piece.width;
    const originalHeight = piece.height;
    piece.width = definition.width;
    piece.height = definition.height;
    piece.mesh = createMeshForPiece(piece);
    piece.width = originalWidth;
    piece.height = originalHeight;
    
    getScene().add(piece.mesh);
    
    return piece;
}

/**
 * Gets the definition for a piece type
 * @param {string} type - The piece type
 * @returns {object|null} The piece definition
 */
function getPieceDefinition(type) {
    // Resolve legacy type keys (e.g. 'thruster' -> 'thruster_axiom_pd7')
    const resolvedType = resolveLegacyType(type);
    
    // Check blocks
    if (BLOCK_DEFINITIONS[resolvedType]) {
        return { ...BLOCK_DEFINITIONS[resolvedType], category: PieceCategory.BLOCK };
    }
    // Check equipment
    if (EQUIPMENT_DEFINITIONS[resolvedType]) {
        return { ...EQUIPMENT_DEFINITIONS[resolvedType], category: PieceCategory.EQUIPMENT };
    }
    // Check core
    if (resolvedType === 'core') {
        return { ...CORE_DEFINITION, category: PieceCategory.CORE };
    }
    return null;
}

/**
 * Creates the appropriate mesh for a piece
 * @param {object} piece - The piece instance
 * @returns {THREE.Mesh|THREE.Group} The mesh
 */
function createMeshForPiece(piece) {
    switch (piece.category) {
        case PieceCategory.BLOCK:
            return createBlockMesh(piece.type, piece.width, piece.height);
        case PieceCategory.EQUIPMENT:
            return createEquipmentMesh(piece.type);
        case PieceCategory.CORE:
            return createCoreMesh();
        default:
            // Fallback: simple box
            const geometry = new THREE.BoxGeometry(piece.width, piece.height, 0.3);
            const material = new THREE.MeshStandardMaterial({ color: 0xff00ff });
            return new THREE.Mesh(geometry, material);
    }
}

/**
 * Removes a piece from the scene and physics world
 * @param {object} piece - The piece to remove
 */
function removePiece(piece) {
    if (piece.mesh) {
        getScene().remove(piece.mesh);
        piece.mesh = null;
    }
    if (piece.body) {
        removePieceBody(piece.body);
        piece.body = null;
    }
}

// Simple ID generator (shared across all piece creation paths)
let pieceIdCounter = 0;
function generatePieceId() {
    return `piece_${++pieceIdCounter}`;
}

/**
 * Spawns initial parts into the bin
 * @param {object} gameState - The game state
 * @param {object} [options] - Options
 * @param {boolean} [options.skipDefaultShipParts=false] - If true, only spawn parts not in default ship
 */
function spawnInitialParts(gameState, options = {}) {
    const { skipDefaultShipParts = false } = options;
    
    // Full parts list when spawning everything (matches starter preset)
    const fullPartsList = [
        'core',
        'block_scrap_1x1', 'block_scrap_1x1',
        'block_scrap_2x1',
        'cannon_popgun',
        'thruster_rustbucket', 'thruster_rustbucket'
    ];
    
    // Extra parts not in default ship (spawned in bin when default ship is placed)
    const extraParts = [];
    
    const partsToSpawn = skipDefaultShipParts ? extraParts : fullPartsList;
    
    for (const type of partsToSpawn) {
        const pos = getRandomBinPosition();
        const piece = createPiece(type, pos.x, pos.y);
        if (piece) {
            gameState.pieces.push(piece);
            gameState.binPieces.push(piece);
        }
    }
}

export {
    PieceCategory,
    PieceState,
    getGridZ,
    createPiece,
    createPieceForGrid,
    getPieceDefinition,
    removePiece,
    spawnInitialParts,
    generatePieceId
};
