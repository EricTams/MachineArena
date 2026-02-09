// Layout module - ship layout is the source of truth
// Grid pieces are rendered from the layout, not the other way around

import { getScene } from './scene.js';
import { getGridConfig, gridToWorld } from './grid.js';
import { PieceState, getPieceDefinition, removePiece, getGridZ, generatePieceId } from './pieces/piece.js';
import { BLOCK_DEFINITIONS, createBlockMesh } from './pieces/blocks.js';
import { EQUIPMENT_DEFINITIONS, createEquipmentMesh } from './pieces/equipment.js';
import { CORE_DEFINITION, createCoreMesh } from './pieces/core.js';

// The ship layout - SOURCE OF TRUTH
// Each item: { type: string, col: number, row: number, angle: number }
let shipLayout = [];

// Piece ID generation uses the shared counter from piece.js
// to avoid duplicate IDs between layout-created and bin-created pieces

/**
 * Gets the current ship layout (returns a copy)
 * @returns {Array} Copy of the ship layout
 */
function getShipLayout() {
    return shipLayout.map(item => ({ ...item }));
}

/**
 * Sets the entire ship layout and re-renders the grid
 * @param {Array} layout - New layout array
 * @param {object} gameState - Game state to update
 */
function setShipLayout(layout, gameState) {
    // Clear existing grid pieces
    clearGridPieces(gameState);
    
    // Set new layout
    shipLayout = layout.map(item => ({ ...item }));
    
    // Render pieces from layout
    renderGridFromLayout(gameState);
}

/**
 * Clears all grid pieces (removes from scene and gameState)
 * @param {object} gameState - Game state
 */
function clearGridPieces(gameState) {
    // Remove each grid piece
    for (const piece of [...gameState.gridPieces]) {
        // Remove from pieces array
        const pieceIndex = gameState.pieces.indexOf(piece);
        if (pieceIndex !== -1) {
            gameState.pieces.splice(pieceIndex, 1);
        }
        // Remove visual and physics
        removePiece(piece);
    }
    // Clear the grid pieces array
    gameState.gridPieces.length = 0;
}

/**
 * Renders grid pieces from the current layout
 * @param {object} gameState - Game state to update
 */
function renderGridFromLayout(gameState) {
    const config = getGridConfig();
    
    for (let i = 0; i < shipLayout.length; i++) {
        const item = shipLayout[i];
        const piece = createPieceFromLayoutItem(item, i, config, true);
        if (piece) {
            gameState.pieces.push(piece);
            gameState.gridPieces.push(piece);
        }
    }
}

/**
 * Creates a piece from a layout item
 * @param {object} item - Layout item {type, col, row, angle}
 * @param {number} layoutIndex - Index in the layout array
 * @param {object} config - Grid config
 * @param {boolean} addToScene - Whether to add mesh to scene
 * @returns {object} Piece instance
 */
function createPieceFromLayoutItem(item, layoutIndex, config, addToScene) {
    const definition = getPieceDefinition(item.type);
    if (!definition) {
        console.error(`Unknown piece type: ${item.type}`);
        return null;
    }
    
    // Determine if dimensions need swapping based on rotation
    const rotations = Math.round(item.angle / (Math.PI / 2)) % 4;
    const isOddRotation = rotations % 2 === 1;
    const width = isOddRotation ? definition.height : definition.width;
    const height = isOddRotation ? definition.width : definition.height;
    
    // Calculate world position from grid position
    const cellCenter = gridToWorld(item.col, item.row);
    const offsetX = (width - 1) * 0.5;
    const offsetY = (height - 1) * 0.5;
    const worldX = cellCenter.x + offsetX;
    const worldY = cellCenter.y + offsetY;
    
    const piece = {
        id: generatePieceId(),
        type: item.type,
        category: definition.category,
        x: worldX,
        y: worldY,
        angle: item.angle,
        width: width,
        height: height,
        mass: definition.mass,
        state: PieceState.ON_GRID,
        mesh: null,
        body: null,
        gridCol: item.col,
        gridRow: item.row,
        layoutIndex: layoutIndex,  // Links back to layout
        definition: definition
    };
    
    // Create visual mesh (use original dimensions for mesh)
    piece.mesh = createMeshForPiece(item.type, definition);
    piece.mesh.position.set(worldX, worldY, getGridZ(definition.category));
    piece.mesh.rotation.z = item.angle;
    
    if (addToScene) {
        getScene().add(piece.mesh);
    }
    
    return piece;
}

/**
 * Creates the appropriate mesh for a piece type
 * @param {string} type - Piece type
 * @param {object} definition - Piece definition
 * @returns {THREE.Mesh|THREE.Group} The mesh
 */
function createMeshForPiece(type, definition) {
    if (definition.category === 'block') {
        return createBlockMesh(type, definition.width, definition.height);
    } else if (definition.category === 'equipment') {
        return createEquipmentMesh(type);
    } else if (definition.category === 'core') {
        return createCoreMesh();
    }
    // Fallback
    return createBlockMesh(type, definition.width, definition.height);
}

/**
 * Adds a piece to the layout and renders it
 * @param {object} item - Layout item {type, col, row, angle}
 * @param {object} gameState - Game state
 * @returns {object} The created piece
 */
function addToLayout(item, gameState) {
    const layoutIndex = shipLayout.length;
    shipLayout.push({ ...item });
    
    const config = getGridConfig();
    const piece = createPieceFromLayoutItem(item, layoutIndex, config, true);
    if (piece) {
        gameState.pieces.push(piece);
        gameState.gridPieces.push(piece);
    }
    
    return piece;
}

/**
 * Updates a layout item and syncs the corresponding piece
 * @param {number} layoutIndex - Index in layout array
 * @param {object} changes - Properties to update (col, row, angle)
 * @param {object} gameState - Game state
 */
function updateLayoutItem(layoutIndex, changes, gameState) {
    if (layoutIndex < 0 || layoutIndex >= shipLayout.length) {
        console.warn(`Invalid layout index: ${layoutIndex}`);
        return;
    }
    
    // Update layout
    const item = shipLayout[layoutIndex];
    Object.assign(item, changes);
    
    // Find and update the corresponding piece
    const piece = gameState.gridPieces.find(p => p.layoutIndex === layoutIndex);
    if (!piece) {
        console.warn(`No piece found for layout index: ${layoutIndex}`);
        return;
    }
    
    // Recalculate piece properties
    const definition = piece.definition;
    const rotations = Math.round(item.angle / (Math.PI / 2)) % 4;
    const isOddRotation = rotations % 2 === 1;
    piece.width = isOddRotation ? definition.height : definition.width;
    piece.height = isOddRotation ? definition.width : definition.height;
    piece.angle = item.angle;
    piece.gridCol = item.col;
    piece.gridRow = item.row;
    
    // Recalculate position
    const cellCenter = gridToWorld(item.col, item.row);
    const offsetX = (piece.width - 1) * 0.5;
    const offsetY = (piece.height - 1) * 0.5;
    piece.x = cellCenter.x + offsetX;
    piece.y = cellCenter.y + offsetY;
    
    // Update mesh
    piece.mesh.position.set(piece.x, piece.y, getGridZ(piece.category));
    piece.mesh.rotation.z = piece.angle;
}

/**
 * Removes a piece from the layout
 * @param {number} layoutIndex - Index in layout array
 * @param {object} gameState - Game state
 * @returns {object|null} The removed piece (for moving to bin)
 */
function removeFromLayout(layoutIndex, gameState) {
    if (layoutIndex < 0 || layoutIndex >= shipLayout.length) {
        console.warn(`Invalid layout index: ${layoutIndex}`);
        return null;
    }
    
    // Remove from layout
    shipLayout.splice(layoutIndex, 1);
    
    // Find the piece
    const piece = gameState.gridPieces.find(p => p.layoutIndex === layoutIndex);
    if (!piece) {
        console.warn(`No piece found for layout index: ${layoutIndex}`);
        return null;
    }
    
    // Remove from gridPieces
    const gridIndex = gameState.gridPieces.indexOf(piece);
    if (gridIndex !== -1) {
        gameState.gridPieces.splice(gridIndex, 1);
    }
    
    // Clear layoutIndex since it's no longer on the grid
    piece.layoutIndex = null;
    
    // Re-index remaining pieces
    for (const p of gameState.gridPieces) {
        if (p.layoutIndex !== null && p.layoutIndex > layoutIndex) {
            p.layoutIndex--;
        }
    }
    
    return piece;
}

/**
 * Finds a layout item at a grid position
 * @param {number} col - Grid column
 * @param {number} row - Grid row
 * @returns {{index: number, item: object}|null} Layout item info or null
 */
function getLayoutItemAt(col, row) {
    for (let i = 0; i < shipLayout.length; i++) {
        const item = shipLayout[i];
        const definition = getPieceDefinition(item.type);
        if (!definition) continue;
        
        // Calculate piece bounds
        const rotations = Math.round(item.angle / (Math.PI / 2)) % 4;
        const isOddRotation = rotations % 2 === 1;
        const width = isOddRotation ? definition.height : definition.width;
        const height = isOddRotation ? definition.width : definition.height;
        
        // Check if col, row is within this piece
        if (col >= item.col && col < item.col + width &&
            row >= item.row && row < item.row + height) {
            return { index: i, item: { ...item } };
        }
    }
    return null;
}

/**
 * Creates pieces from a layout for arena use (not added to scene)
 * This is the SINGLE PATH for creating arena ships from any layout
 * @param {Array} layout - Layout array
 * @returns {Array} Array of piece objects ready for createArenaShip
 */
function createPiecesFromLayout(layout) {
    const config = getGridConfig();
    const pieces = [];
    
    for (let i = 0; i < layout.length; i++) {
        const item = layout[i];
        const piece = createPieceFromLayoutItem(item, i, config, false);
        if (piece) {
            pieces.push(piece);
        }
    }
    
    return pieces;
}

/**
 * Finds a piece's layout index by the piece itself
 * @param {object} piece - The piece to find
 * @returns {number} Layout index or -1 if not found
 */
function findLayoutIndexForPiece(piece) {
    if (piece.layoutIndex !== null && piece.layoutIndex !== undefined) {
        return piece.layoutIndex;
    }
    return -1;
}

/**
 * Checks if layout has a core piece
 * @returns {boolean} True if layout contains a core
 */
function layoutHasCore() {
    return shipLayout.some(item => item.type === 'core');
}

/**
 * Gets layout item count
 * @returns {number} Number of items in layout
 */
function getLayoutItemCount() {
    return shipLayout.length;
}

// ============================================================
// Placement integration functions
// These allow the placement system to manipulate the layout
// when pieces are dragged between bin and grid
// ============================================================

/**
 * Adds an existing piece to the layout (for bin -> grid placement)
 * Updates the piece's layoutIndex
 * @param {object} piece - The piece being placed
 * @param {number} col - Grid column
 * @param {number} row - Grid row
 */
function addPieceToLayout(piece, col, row) {
    const layoutIndex = shipLayout.length;
    shipLayout.push({
        type: piece.type,
        col: col,
        row: row,
        angle: piece.angle
    });
    piece.layoutIndex = layoutIndex;
}

/**
 * Removes a piece from the layout (for grid -> bin removal)
 * Clears the piece's layoutIndex but keeps the piece object
 * @param {object} piece - The piece being removed
 * @param {object} gameState - Game state for re-indexing other pieces
 */
function removePieceFromLayout(piece, gameState) {
    const layoutIndex = piece.layoutIndex;
    if (layoutIndex === null || layoutIndex === undefined || layoutIndex < 0) {
        return;
    }
    
    // Remove from layout array
    shipLayout.splice(layoutIndex, 1);
    
    // Clear this piece's layoutIndex
    piece.layoutIndex = null;
    
    // Re-index remaining grid pieces
    for (const p of gameState.gridPieces) {
        if (p.layoutIndex !== null && p.layoutIndex > layoutIndex) {
            p.layoutIndex--;
        }
    }
}

/**
 * Updates a piece's entry in the layout (for rotation, etc.)
 * @param {object} piece - The piece being updated
 * @param {object} changes - Properties to update (col, row, angle)
 */
function updatePieceInLayout(piece, changes) {
    const layoutIndex = piece.layoutIndex;
    if (layoutIndex === null || layoutIndex === undefined || layoutIndex < 0) {
        return;
    }
    
    const item = shipLayout[layoutIndex];
    if (item) {
        Object.assign(item, changes);
    }
}

export {
    getShipLayout,
    setShipLayout,
    addToLayout,
    updateLayoutItem,
    removeFromLayout,
    getLayoutItemAt,
    createPiecesFromLayout,
    findLayoutIndexForPiece,
    layoutHasCore,
    getLayoutItemCount,
    clearGridPieces,
    renderGridFromLayout,
    // Placement integration
    addPieceToLayout,
    removePieceFromLayout,
    updatePieceInLayout
};
