// Debug visualization - shows collision bounds and other debug info

import * as THREE from 'three';
import { getScene } from './scene.js';
import { getPhysicsScale } from './physics.js';

let debugEnabled = false;
let debugGroup = null;
let boundsLines = new Map(); // pieceId -> { clickBounds: Line, physicsBounds: Line }

/**
 * Initializes the debug system
 */
function initDebug() {
    debugGroup = new THREE.Group();
    debugGroup.visible = debugEnabled;
    getScene().add(debugGroup);
    
    // Toggle debug with backtick key
    window.addEventListener('keydown', (e) => {
        if (e.key === '`') {
            toggleDebug();
        }
    });
}

/**
 * Toggles debug visualization on/off
 */
function toggleDebug() {
    debugEnabled = !debugEnabled;
    debugGroup.visible = debugEnabled;
    console.log(`Debug visualization: ${debugEnabled ? 'ON' : 'OFF'}`);
}

/**
 * Shows or hides the debug group (used when switching modes)
 * @param {boolean} visible - Whether debug should be visible
 */
function setDebugVisible(visible) {
    if (debugGroup) {
        debugGroup.visible = visible && debugEnabled;
    }
}

/**
 * Updates debug visualizations for all pieces
 * @param {Array} pieces - All pieces in the game
 */
function updateDebug(pieces) {
    if (!debugEnabled) return;
    
    // Track which pieces we've seen this frame
    const seenPieces = new Set();
    
    for (const piece of pieces) {
        seenPieces.add(piece.id);
        
        // Get or create bounds lines for this piece
        let lines = boundsLines.get(piece.id);
        
        if (!lines) {
            lines = {
                clickBounds: createBoundsLine(0x00ff00), // Green for click bounds
                physicsBounds: createBoundsLine(0xff00ff, true) // Magenta for physics (dashed-like via LineLoop)
            };
            boundsLines.set(piece.id, lines);
            debugGroup.add(lines.clickBounds);
            debugGroup.add(lines.physicsBounds);
        }
        
        // Update click bounds (what input.js uses)
        updateClickBoundsLine(lines.clickBounds, piece);
        
        // Update physics bounds (actual Matter.js body)
        updatePhysicsBoundsLine(lines.physicsBounds, piece);
    }
    
    // Remove lines for pieces that no longer exist
    for (const [pieceId, lines] of boundsLines) {
        if (!seenPieces.has(pieceId)) {
            debugGroup.remove(lines.clickBounds);
            debugGroup.remove(lines.physicsBounds);
            lines.clickBounds.geometry.dispose();
            lines.physicsBounds.geometry.dispose();
            boundsLines.delete(pieceId);
        }
    }
}

/**
 * Creates a wireframe line for bounds visualization
 * @param {number} color - Line color
 * @param {boolean} isPhysics - Whether this is for physics bounds
 * @returns {THREE.LineLoop} The line object
 */
function createBoundsLine(color, isPhysics = false) {
    const geometry = new THREE.BufferGeometry();
    // 4 points for a closed loop (LineLoop closes automatically)
    const positions = new Float32Array(4 * 3);
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    const material = new THREE.LineBasicMaterial({ 
        color: color,
        linewidth: 2,
        transparent: isPhysics,
        opacity: isPhysics ? 0.8 : 1.0
    });
    
    return new THREE.LineLoop(geometry, material);
}

/**
 * Updates click bounds line (what input.js uses for hit detection)
 * For pieces with physics bodies, this now shows the rotated physics shape
 * For grid pieces, this shows the axis-aligned bounds
 * @param {THREE.LineLoop} line - The line object
 * @param {object} piece - The piece
 */
function updateClickBoundsLine(line, piece) {
    const z = 0.6; // Slightly above pieces
    
    // Update color based on piece state
    const color = piece.state === 'on_grid' ? 0x00ff00 : 
                  piece.state === 'dragging' ? 0xffff00 : 0x88ff88;
    line.material.color.setHex(color);
    
    const positions = line.geometry.attributes.position.array;
    
    // If piece has physics body, click detection uses rotated physics bounds
    if (piece.body) {
        const scale = getPhysicsScale();
        const vertices = piece.body.vertices;
        
        for (let i = 0; i < 4; i++) {
            const v = vertices[i];
            positions[i * 3] = v.x / scale;
            positions[i * 3 + 1] = -v.y / scale; // Flip Y
            positions[i * 3 + 2] = z;
        }
    } else {
        // Grid pieces use axis-aligned bounds
        const halfWidth = piece.width / 2;
        const halfHeight = piece.height / 2;
        
        const minX = piece.x - halfWidth;
        const maxX = piece.x + halfWidth;
        const minY = piece.y - halfHeight;
        const maxY = piece.y + halfHeight;
        
        // Bottom-left
        positions[0] = minX;
        positions[1] = minY;
        positions[2] = z;
        
        // Bottom-right
        positions[3] = maxX;
        positions[4] = minY;
        positions[5] = z;
        
        // Top-right
        positions[6] = maxX;
        positions[7] = maxY;
        positions[8] = z;
        
        // Top-left
        positions[9] = minX;
        positions[10] = maxY;
        positions[11] = z;
    }
    
    line.geometry.attributes.position.needsUpdate = true;
}

/**
 * Updates physics bounds line (actual Matter.js body vertices)
 * @param {THREE.LineLoop} line - The line object
 * @param {object} piece - The piece
 */
function updatePhysicsBoundsLine(line, piece) {
    const scale = getPhysicsScale();
    const z = 0.65; // Slightly above click bounds
    
    // If no physics body, hide the line
    if (!piece.body) {
        line.visible = false;
        return;
    }
    
    line.visible = true;
    
    // Get actual physics body vertices (4 corners for a rectangle)
    const vertices = piece.body.vertices;
    const positions = line.geometry.attributes.position.array;
    
    // Matter.js vertices are in physics coords, convert to world
    for (let i = 0; i < 4; i++) {
        const v = vertices[i];
        positions[i * 3] = v.x / scale;
        positions[i * 3 + 1] = -v.y / scale; // Flip Y
        positions[i * 3 + 2] = z;
    }
    
    line.geometry.attributes.position.needsUpdate = true;
}

function isDebugEnabled() {
    return debugEnabled;
}

export {
    initDebug,
    toggleDebug,
    updateDebug,
    isDebugEnabled,
    setDebugVisible
};
