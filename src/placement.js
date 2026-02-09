// Single-path placement system (per ship-design.md section 8)
// All placement logic goes through this module
// 
// Layout integration: the layout is the source of truth for grid pieces.
// - Placing on grid: adds to layout
// - Removing from grid: removes from layout
// - Rotating on grid: updates layout

import { worldToGrid, gridToWorld, isWithinGrid, getGridConfig } from './grid.js';
import { createPieceBody, removePieceBody, setBodyAngle } from './physics.js';
import { getBinBounds, getRandomBinPosition } from './bin.js';
import { PieceCategory, PieceState, getGridZ } from './pieces/piece.js';
import { addPieceToLayout, removePieceFromLayout, updatePieceInLayout, getShipLayout } from './layout.js';
import { saveInventory } from './run.js';

/**
 * Attempts to place a piece on the grid
 * Single entry point for all placement operations
 * @param {object} piece - The piece to place
 * @param {number} worldX - Target world X position
 * @param {number} worldY - Target world Y position
 * @param {object} gameState - The game state
 * @returns {boolean} True if placement succeeded
 */
function tryPlacePiece(piece, worldX, worldY, gameState) {
    // Offset so mouse position corresponds to piece center, not top-left
    // For 1x1: offset = 0, for 2x2: offset = 0.5 in each direction
    const offsetX = (piece.width - 1) * 0.5;
    const offsetY = (piece.height - 1) * 0.5;
    const gridPos = worldToGrid(worldX - offsetX, worldY - offsetY);
    
    // Not on grid - return to bin (preserve position for natural fall)
    if (!gridPos) {
        movePieceToBin(piece, gameState, { preservePosition: true });
        return false;
    }
    
    // Validate placement
    const validation = validatePlacement(piece, gridPos.col, gridPos.row, gameState);
    if (!validation.valid) {
        // Failed validation (e.g., equipment not over block) - fall from current position
        movePieceToBin(piece, gameState, { preservePosition: true });
        return false;
    }
    
    // Handle displacement if placing on occupied space (preserve position for natural fall)
    if (validation.displacedPieces && validation.displacedPieces.length > 0) {
        for (const displaced of validation.displacedPieces) {
            movePieceToBin(displaced, gameState, { preservePosition: true });
        }
    }
    
    // Place the piece
    placePieceOnGrid(piece, gridPos.col, gridPos.row, gameState);
    return true;
}

/**
 * Validates whether a piece can be placed at a grid position
 * @param {object} piece - The piece to validate
 * @param {number} col - Target grid column
 * @param {number} row - Target grid row
 * @param {object} gameState - The game state
 * @returns {{valid: boolean, reason?: string, displacedPieces?: Array}}
 */
function validatePlacement(piece, col, row, gameState) {
    // Check grid bounds
    if (!isWithinGrid(col, row, piece.width, piece.height)) {
        return { valid: false, reason: 'Out of bounds' };
    }
    
    // Equipment must be placed on blocks
    if (piece.category === PieceCategory.EQUIPMENT) {
        const hasBlockSupport = checkBlockSupport(col, row, piece.width, piece.height, gameState);
        if (!hasBlockSupport) {
            return { valid: false, reason: 'Equipment must be placed on blocks' };
        }
    }
    
    // Check for conflicts (same category pieces)
    const conflicts = findConflictingPieces(piece, col, row, gameState);
    
    // Blocks can displace other blocks
    if (piece.category === PieceCategory.BLOCK || piece.category === PieceCategory.CORE) {
        // Displacement: existing blocks and their equipment get sent to bin
        const displacedPieces = [];
        for (const conflict of conflicts) {
            displacedPieces.push(conflict);
            // Also displace any equipment on the conflicting block
            const equipmentOnBlock = findEquipmentOnBlock(conflict, gameState);
            displacedPieces.push(...equipmentOnBlock);
        }
        return { valid: true, displacedPieces };
    }
    
    // Equipment cannot displace other equipment
    if (piece.category === PieceCategory.EQUIPMENT && conflicts.length > 0) {
        return { valid: false, reason: 'Space occupied by equipment' };
    }
    
    return { valid: true };
}

/**
 * Checks if there's block support for equipment at the given position
 */
function checkBlockSupport(col, row, width, height, gameState) {
    // Check each cell the equipment would occupy
    for (let c = col; c < col + width; c++) {
        for (let r = row; r < row + height; r++) {
            const hasBlock = gameState.gridPieces.some(p => 
                (p.category === PieceCategory.BLOCK || p.category === PieceCategory.CORE) &&
                c >= p.gridCol && c < p.gridCol + p.width &&
                r >= p.gridRow && r < p.gridRow + p.height
            );
            if (!hasBlock) return false;
        }
    }
    return true;
}

/**
 * Finds pieces that would conflict with placement
 */
function findConflictingPieces(piece, col, row, gameState) {
    const conflicts = [];
    
    for (const other of gameState.gridPieces) {
        if (other === piece) continue;
        if (other.category !== piece.category && 
            piece.category !== PieceCategory.CORE && 
            other.category !== PieceCategory.CORE) continue;
        
        // Check for overlap
        const overlaps = checkOverlap(
            col, row, piece.width, piece.height,
            other.gridCol, other.gridRow, other.width, other.height
        );
        
        if (overlaps) {
            conflicts.push(other);
        }
    }
    
    return conflicts;
}

/**
 * Checks if two rectangles overlap
 */
function checkOverlap(col1, row1, w1, h1, col2, row2, w2, h2) {
    return col1 < col2 + w2 && col1 + w1 > col2 &&
           row1 < row2 + h2 && row1 + h1 > row2;
}

/**
 * Finds equipment pieces placed on a block
 */
function findEquipmentOnBlock(block, gameState) {
    return gameState.gridPieces.filter(p => 
        p.category === PieceCategory.EQUIPMENT &&
        checkOverlap(
            p.gridCol, p.gridRow, p.width, p.height,
            block.gridCol, block.gridRow, block.width, block.height
        )
    );
}

/**
 * Places a piece on the grid (assumes validation passed)
 * Updates the layout as source of truth
 */
function placePieceOnGrid(piece, col, row, gameState) {
    // Check if coming from bin (no layoutIndex)
    const wasInBin = gameState.binPieces.indexOf(piece) !== -1;
    const hadLayoutIndex = piece.layoutIndex !== null && piece.layoutIndex !== undefined;
    
    // Remove from bin if was there
    const binIndex = gameState.binPieces.indexOf(piece);
    if (binIndex !== -1) {
        gameState.binPieces.splice(binIndex, 1);
    }
    
    // Remove physics body (grid pieces are static)
    if (piece.body) {
        removePieceBody(piece.body);
        piece.body = null;
    }
    
    // Update piece state
    piece.state = PieceState.ON_GRID;
    piece.gridCol = col;
    piece.gridRow = row;
    
    // Ensure angle is snapped to 90° for grid placement
    const snapped = snapAngleTo90(piece.angle);
    piece.angle = snapped.angle;
    
    // Position mesh at grid cell center
    const worldPos = gridToWorld(col, row);
    // Adjust for piece size (gridToWorld gives cell center, we need piece center)
    const offsetX = (piece.width - 1) * 0.5;
    const offsetY = (piece.height - 1) * 0.5;
    piece.x = worldPos.x + offsetX;
    piece.y = worldPos.y + offsetY;
    piece.mesh.position.set(piece.x, piece.y, getGridZ(piece.category));
    piece.mesh.rotation.z = piece.angle;
    
    // Add to grid pieces if not already there
    if (!gameState.gridPieces.includes(piece)) {
        gameState.gridPieces.push(piece);
    }
    
    // Update layout (source of truth)
    if (wasInBin || !hadLayoutIndex) {
        // Coming from bin: add to layout
        addPieceToLayout(piece, col, row);
    } else {
        // Already had layout entry: update position
        updatePieceInLayout(piece, { col, row, angle: piece.angle });
    }
}

/**
 * Moves a piece to the bin (with physics)
 * Updates the layout as source of truth
 * @param {object} piece - The piece to move
 * @param {object} gameState - The game state
 * @param {object} [options] - Optional settings
 * @param {boolean} [options.preservePosition=false] - If true, spawn at current position for natural fall
 */
function movePieceToBin(piece, gameState, options = {}) {
    const { preservePosition = false } = options;
    
    // Remove from layout first (source of truth)
    // This also re-indexes other grid pieces
    if (piece.layoutIndex !== null && piece.layoutIndex !== undefined) {
        removePieceFromLayout(piece, gameState);
    }
    
    // Remove from grid if was there
    const gridIndex = gameState.gridPieces.indexOf(piece);
    const wasOnGrid = gridIndex !== -1;
    if (wasOnGrid) {
        gameState.gridPieces.splice(gridIndex, 1);
    }
    
    // Create physics body if doesn't have one
    if (!piece.body) {
        // Determine spawn position
        let spawnX, spawnY;
        if (preservePosition) {
            // Keep piece at current position for natural fall
            spawnX = piece.x;
            spawnY = piece.y;
        } else {
            // Default: spawn at random position in bin
            const pos = getRandomBinPosition();
            spawnX = pos.x;
            spawnY = pos.y;
        }
        
        // Always use the original definition dimensions for the physics body.
        // The body's own angle handles the rotation, so we never need to swap here.
        // This avoids bugs when piece.width/height are in an inconsistent state.
        const bodyWidth = piece.definition.width;
        const bodyHeight = piece.definition.height;
        
        piece.body = createPieceBody(spawnX, spawnY, bodyWidth, bodyHeight, {
            mass: piece.mass
        });
        piece.body.pieceId = piece.id;
        
        // Set physics body angle to match current visual rotation
        setBodyAngle(piece.body, piece.angle);
        
        piece.x = spawnX;
        piece.y = spawnY;
        piece.mesh.position.set(spawnX, spawnY, 0);
    }
    
    // Update piece state
    piece.state = PieceState.IN_BIN;
    piece.gridCol = null;
    piece.gridRow = null;
    
    // Add to bin pieces if not already there
    if (!gameState.binPieces.includes(piece)) {
        gameState.binPieces.push(piece);
    }
}

/**
 * Snaps an angle to the nearest 90 degree increment
 * @param {number} angle - The angle in radians
 * @returns {{angle: number, rotations: number}} Snapped angle and rotation count (0-3)
 */
function snapAngleTo90(angle) {
    // Normalize to [0, 2π)
    const twoPi = Math.PI * 2;
    let normalized = ((angle % twoPi) + twoPi) % twoPi;
    
    // Round to nearest 90° (π/2)
    const rotations = Math.round(normalized / (Math.PI / 2)) % 4;
    const snappedAngle = rotations * (Math.PI / 2);
    
    return { angle: snappedAngle, rotations };
}

/**
 * Picks up a piece for dragging
 * @param {object} piece - The piece to pick up
 * @param {number} worldX - Cursor world X position
 * @param {number} worldY - Cursor world Y position
 * @param {object} gameState - The game state
 */
function pickUpPiece(piece, worldX, worldY, gameState) {
    const wasOnGrid = piece.state === PieceState.ON_GRID;
    const wasInBin = piece.state === PieceState.IN_BIN;
    const wasBlock = piece.category === PieceCategory.BLOCK || piece.category === PieceCategory.CORE;
    
    piece.state = PieceState.DRAGGING;
    
    // Remove from grid tracking
    const gridIndex = gameState.gridPieces.indexOf(piece);
    if (gridIndex !== -1) {
        gameState.gridPieces.splice(gridIndex, 1);
    }
    
    // Remove from bin tracking (stops physics sync from overwriting rotation)
    const binIndex = gameState.binPieces.indexOf(piece);
    if (binIndex !== -1) {
        gameState.binPieces.splice(binIndex, 1);
    }
    
    // If we picked up a block, check for unsupported equipment
    if (wasOnGrid && wasBlock) {
        displaceUnsupportedEquipment(gameState);
    }
    
    // Remove physics body - dragging piece is a logical entity only
    if (piece.body) {
        removePieceBody(piece.body);
        piece.body = null;
    }
    
    // Snap angle to nearest 90° when picking up from bin (physics gives arbitrary angles)
    if (wasInBin) {
        const snapped = snapAngleTo90(piece.angle);
        const isOddRotation = snapped.rotations % 2 === 1;
        
        // Compute dimensions from the original definition + snapped rotation.
        // We must NOT toggle-swap piece.width/height because they may already be
        // swapped from a previous pick-up cycle, causing a cumulative mismatch.
        piece.width  = isOddRotation ? piece.definition.height : piece.definition.width;
        piece.height = isOddRotation ? piece.definition.width  : piece.definition.height;
        
        piece.angle = snapped.angle;
        piece.mesh.rotation.z = snapped.angle;
    }
    
    // Snap piece to cursor position immediately
    piece.x = worldX;
    piece.y = worldY;
    piece.mesh.position.x = worldX;
    piece.mesh.position.y = worldY;
    piece.mesh.position.z = 0.5;
}

/**
 * Checks all equipment on the grid and displaces any that lack block support
 * @param {object} gameState - The game state
 */
function displaceUnsupportedEquipment(gameState) {
    // Find equipment that no longer has block support
    const unsupported = [];
    
    for (const piece of gameState.gridPieces) {
        if (piece.category !== PieceCategory.EQUIPMENT) continue;
        
        const hasSupport = checkBlockSupport(
            piece.gridCol, piece.gridRow, 
            piece.width, piece.height, 
            gameState
        );
        
        if (!hasSupport) {
            unsupported.push(piece);
        }
    }
    
    // Move unsupported equipment to bin (preserve position for natural fall)
    for (const piece of unsupported) {
        movePieceToBin(piece, gameState, { preservePosition: true });
    }
}

/**
 * Updates a dragging piece position
 */
function updateDraggingPiece(piece, worldX, worldY) {
    piece.x = worldX;
    piece.y = worldY;
    piece.mesh.position.x = worldX;
    piece.mesh.position.y = worldY;
}

/**
 * Drops a piece (after dragging)
 */
function dropPiece(piece, worldX, worldY, gameState) {
    piece.mesh.position.z = getGridZ(piece.category);
    
    // Try to place on grid, otherwise goes to bin (which creates physics body)
    tryPlacePiece(piece, worldX, worldY, gameState);

    // Persist inventory so grid/bin state survives a reload
    saveInventory(getShipLayout(), gameState.binPieces.map(p => p.type));
}

/**
 * Rotates a piece 90 degrees clockwise
 * Updates the layout as source of truth
 * @param {object} piece - The piece to rotate
 * @param {object} gameState - The game state
 */
function rotatePiece(piece, gameState) {
    // Swap width and height
    const oldWidth = piece.width;
    const oldHeight = piece.height;
    piece.width = oldHeight;
    piece.height = oldWidth;
    
    // Update rotation angle (90 degrees clockwise)
    piece.angle = (piece.angle - Math.PI / 2) % (Math.PI * 2);
    piece.mesh.rotation.z = piece.angle;
    
    // Update physics body angle if present
    if (piece.body) {
        setBodyAngle(piece.body, piece.angle);
    }
    
    // If piece is on grid, validate new position
    if (piece.state === PieceState.ON_GRID) {
        // Check if rotated piece still fits and has valid support
        const validation = validatePlacement(piece, piece.gridCol, piece.gridRow, gameState);
        
        if (!validation.valid) {
            // Can't rotate here - send to bin (preserve position for natural fall)
            // movePieceToBin handles layout removal
            movePieceToBin(piece, gameState, { preservePosition: true });
        } else {
            // Re-place at same position with new dimensions
            // Recalculate mesh position for new size
            const worldPos = gridToWorld(piece.gridCol, piece.gridRow);
            const offsetX = (piece.width - 1) * 0.5;
            const offsetY = (piece.height - 1) * 0.5;
            piece.x = worldPos.x + offsetX;
            piece.y = worldPos.y + offsetY;
            piece.mesh.position.set(piece.x, piece.y, getGridZ(piece.category));
            
            // Update layout with new angle (source of truth)
            if (piece.layoutIndex !== null && piece.layoutIndex !== undefined) {
                updatePieceInLayout(piece, { angle: piece.angle });
            }
            
            // Handle any pieces that got displaced by rotation (preserve position for natural fall)
            // movePieceToBin handles layout removal for each displaced piece
            if (validation.displacedPieces && validation.displacedPieces.length > 0) {
                for (const displaced of validation.displacedPieces) {
                    movePieceToBin(displaced, gameState, { preservePosition: true });
                }
            }
        }
    }

    // Persist inventory so rotation changes survive a reload
    saveInventory(getShipLayout(), gameState.binPieces.map(p => p.type));
}

export {
    tryPlacePiece,
    validatePlacement,
    placePieceOnGrid,
    movePieceToBin,
    pickUpPiece,
    updateDraggingPiece,
    dropPiece,
    rotatePiece
};
