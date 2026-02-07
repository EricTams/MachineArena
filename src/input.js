// Input handling - mouse/keyboard for drag-and-drop piece placement

import { screenToWorld, getRenderer } from './scene.js';
import { pickUpPiece, updateDraggingPiece, dropPiece, rotatePiece } from './placement.js';
import { getPhysicsScale } from './physics.js';
import { showStats, hideStats } from './statsPanel.js';
import { isArenaActive } from './arena/arena.js';

let gameStateRef = null;
let hoveredPiece = null;

/**
 * Sets up input event handlers
 * @param {object} gameState - The game state reference
 */
function setupInput(gameState) {
    gameStateRef = gameState;
    
    const canvas = getRenderer().domElement;
    
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);
    
    // Prevent context menu on right-click
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}

/**
 * Mouse down - start dragging (left-click) or rotate (right-click)
 */
function onMouseDown(event) {
    // Designer input is inactive during arena mode
    if (isArenaActive()) return;
    
    const worldPos = screenToWorld(event.clientX, event.clientY);
    const piece = findPieceAtPosition(worldPos.x, worldPos.y);
    
    // Right-click: rotate piece (prioritize selected/dragging piece)
    if (event.button === 2) {
        const pieceToRotate = gameStateRef.selectedPiece || piece;
        if (pieceToRotate) {
            rotatePiece(pieceToRotate, gameStateRef);
        }
        return;
    }
    
    // Left-click: start dragging
    if (event.button !== 0) return;
    
    if (piece) {
        gameStateRef.selectedPiece = piece;
        gameStateRef.dragging = true;
        pickUpPiece(piece, worldPos.x, worldPos.y, gameStateRef);
    }
}

/**
 * Mouse move - update dragging piece position and stats panel
 */
function onMouseMove(event) {
    // Designer input is inactive during arena mode
    if (isArenaActive()) return;
    
    const worldPos = screenToWorld(event.clientX, event.clientY);
    
    // Update stats panel based on hovered piece (even when not dragging)
    updateHoveredPiece(worldPos.x, worldPos.y);
    
    // Update dragging if active
    if (gameStateRef.dragging && gameStateRef.selectedPiece) {
        updateDraggingPiece(gameStateRef.selectedPiece, worldPos.x, worldPos.y);
    }
}

/**
 * Updates the hovered piece and stats panel
 * @param {number} worldX - World X position
 * @param {number} worldY - World Y position
 */
function updateHoveredPiece(worldX, worldY) {
    const piece = findPieceAtPosition(worldX, worldY);
    
    if (piece !== hoveredPiece) {
        hoveredPiece = piece;
        if (piece) {
            showStats(piece);
        } else {
            hideStats();
        }
    }
}

/**
 * Mouse up - drop the piece (left-click only)
 */
function onMouseUp(event) {
    // Designer input is inactive during arena mode
    if (isArenaActive()) return;
    
    // Only drop on left-click release (ignore right-click release)
    if (event.button !== 0) return;
    if (!gameStateRef.dragging || !gameStateRef.selectedPiece) return;
    
    const worldPos = screenToWorld(event.clientX, event.clientY);
    dropPiece(gameStateRef.selectedPiece, worldPos.x, worldPos.y, gameStateRef);
    
    gameStateRef.selectedPiece = null;
    gameStateRef.dragging = false;
}

/**
 * Finds a piece at the given world position using bounds checking
 * @param {number} worldX - World X position
 * @param {number} worldY - World Y position
 * @returns {object|null} The piece at the position, or null
 */
function findPieceAtPosition(worldX, worldY) {
    // Check all pieces using their known bounds (more reliable than raycasting)
    // Check in reverse order so pieces rendered on top are picked first
    for (let i = gameStateRef.pieces.length - 1; i >= 0; i--) {
        const piece = gameStateRef.pieces[i];
        if (!piece.mesh) continue;
        
        // Use physics bounds if piece has a body (accounts for rotation)
        if (piece.body) {
            if (isPointInPhysicsBody(worldX, worldY, piece.body)) {
                return piece;
            }
        } else {
            // Fallback to axis-aligned bounds for grid pieces (no physics body)
            if (isPointInAxisAlignedBounds(worldX, worldY, piece)) {
                return piece;
            }
        }
    }
    
    return null;
}

/**
 * Checks if a point is inside a physics body's rotated bounds
 * @param {number} worldX - World X position
 * @param {number} worldY - World Y position
 * @param {Matter.Body} body - The physics body
 * @returns {boolean} True if point is inside
 */
function isPointInPhysicsBody(worldX, worldY, body) {
    const scale = getPhysicsScale();
    
    // Convert world coords to physics coords
    const physX = worldX * scale;
    const physY = -worldY * scale; // Flip Y
    
    // Use Matter.js Vertices.contains for accurate rotated shape detection
    return Matter.Vertices.contains(body.vertices, { x: physX, y: physY });
}

/**
 * Checks if a point is inside axis-aligned piece bounds
 * @param {number} worldX - World X position
 * @param {number} worldY - World Y position
 * @param {object} piece - The piece
 * @returns {boolean} True if point is inside
 */
function isPointInAxisAlignedBounds(worldX, worldY, piece) {
    const halfWidth = piece.width / 2;
    const halfHeight = piece.height / 2;
    
    const minX = piece.x - halfWidth;
    const maxX = piece.x + halfWidth;
    const minY = piece.y - halfHeight;
    const maxY = piece.y + halfHeight;
    
    return worldX >= minX && worldX <= maxX && 
           worldY >= minY && worldY <= maxY;
}

export { setupInput };
