// Input handling - mouse/keyboard for drag-and-drop piece placement

import { screenToWorld, getRenderer } from './scene.js';
import { pickUpPiece, updateDraggingPiece, dropPiece, rotatePiece } from './placement.js';
import { getPhysicsScale } from './physics.js';
import { showStats, hideStats } from './statsPanel.js';
import { isArenaActive } from './arena/arena.js';
import { PieceCategory } from './pieces/piece.js';
import { isInsideSellZone, setSellZoneHover, handleSellPiece } from './shop.js';

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

    // Listen for shop drag-to-buy events
    document.addEventListener('shop-piece-bought', onShopPieceBought);
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
        // Allow mouse events to pass through the shop panel to the canvas
        const shopPanel = document.getElementById('shop-panel');
        if (shopPanel) shopPanel.style.pointerEvents = 'none';
    }
}

/**
 * Handles a piece bought from the shop: starts dragging it immediately.
 * @param {CustomEvent} event - shop-piece-bought event with { piece, originalEvent }
 */
function onShopPieceBought(event) {
    if (isArenaActive()) return;
    const { piece, originalEvent } = event.detail;
    if (!piece) return;

    const worldPos = screenToWorld(originalEvent.clientX, originalEvent.clientY);
    gameStateRef.selectedPiece = piece;
    gameStateRef.dragging = true;
    pickUpPiece(piece, worldPos.x, worldPos.y, gameStateRef);

    // Start listening on the *document* for move/up since the mousedown
    // originated outside the canvas (on the shop panel DOM).
    document.addEventListener('mousemove', onDocMouseMoveDuringShopDrag);
    document.addEventListener('mouseup', onDocMouseUpDuringShopDrag);
}

/** Global move handler while dragging a shop-bought piece */
function onDocMouseMoveDuringShopDrag(event) {
    if (!gameStateRef.dragging || !gameStateRef.selectedPiece) return;
    const worldPos = screenToWorld(event.clientX, event.clientY);
    updateDraggingPiece(gameStateRef.selectedPiece, worldPos.x, worldPos.y);
}

/** Global mouseup handler while dragging a shop-bought piece */
function onDocMouseUpDuringShopDrag(event) {
    document.removeEventListener('mousemove', onDocMouseMoveDuringShopDrag);
    document.removeEventListener('mouseup', onDocMouseUpDuringShopDrag);
    if (event.button !== 0) return;
    if (!gameStateRef.dragging || !gameStateRef.selectedPiece) return;

    const piece = gameStateRef.selectedPiece;
    const worldPos = screenToWorld(event.clientX, event.clientY);

    // Always place — never sell a piece that was just bought from the shop
    dropPiece(piece, worldPos.x, worldPos.y, gameStateRef);

    gameStateRef.selectedPiece = null;
    gameStateRef.dragging = false;
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
        // Update sell zone hover highlight
        setSellZoneHover(isInsideSellZone(event.clientX, event.clientY));
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
    
    const piece = gameStateRef.selectedPiece;
    const worldPos = screenToWorld(event.clientX, event.clientY);

    // Check sell zone first
    if (isInsideSellZone(event.clientX, event.clientY)) {
        setSellZoneHover(false);
        if (!handleSellPiece(piece, gameStateRef)) {
            // Can't sell (e.g. core) — drop normally
            dropPiece(piece, worldPos.x, worldPos.y, gameStateRef);
        }
    } else {
        setSellZoneHover(false);
        dropPiece(piece, worldPos.x, worldPos.y, gameStateRef);
    }
    
    gameStateRef.selectedPiece = null;
    gameStateRef.dragging = false;
    // Restore shop panel pointer events
    const shopPanel = document.getElementById('shop-panel');
    if (shopPanel) shopPanel.style.pointerEvents = '';
}

/**
 * Finds a piece at the given world position using bounds checking
 * Equipment is checked before blocks so it is selected first (it renders on top).
 * @param {number} worldX - World X position
 * @param {number} worldY - World Y position
 * @returns {object|null} The piece at the position, or null
 */
function findPieceAtPosition(worldX, worldY) {
    // Check all pieces using their known bounds (more reliable than raycasting)
    // Two passes: equipment first (renders on top), then everything else
    for (let pass = 0; pass < 2; pass++) {
        const wantEquipment = pass === 0;
        for (let i = gameStateRef.pieces.length - 1; i >= 0; i--) {
            const piece = gameStateRef.pieces[i];
            if (!piece.mesh) continue;
            const isEquipment = piece.category === PieceCategory.EQUIPMENT;
            if (wantEquipment !== isEquipment) continue;
            
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
