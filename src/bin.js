// Parts bin - area below grid where unplaced pieces live with physics

import * as THREE from 'three';
import { getScene } from './scene.js';
import { getGridBounds } from './grid.js';
import { createPieceBody, removePieceBody, getBodyWorldPosition, setBodyWorldPosition, resetBodyVelocity, getWorld, getPhysicsScale } from './physics.js';

const Bodies = Matter.Bodies;
const World = Matter.World;

// Bin configuration
const BIN_HEIGHT = 4; // Height of bin area in world units
const BIN_PADDING = 0.5; // Padding from edges

let binGroup = null;
let binWalls = []; // Physics bodies for bin walls

/**
 * Creates the bin area below the grid
 */
function createBin() {
    const scene = getScene();
    const gridBounds = getGridBounds();
    const world = getWorld();
    const scale = getPhysicsScale();
    
    binGroup = new THREE.Group();
    
    // Bin bounds
    const binBounds = getBinBounds();
    const binWidth = binBounds.maxX - binBounds.minX;
    
    // Visual background for bin
    const bgGeometry = new THREE.PlaneGeometry(binWidth, BIN_HEIGHT);
    const bgMaterial = new THREE.MeshBasicMaterial({ 
        color: 0x1e1e32, 
        transparent: true, 
        opacity: 0.7 
    });
    const bgPlane = new THREE.Mesh(bgGeometry, bgMaterial);
    bgPlane.position.set(
        (binBounds.minX + binBounds.maxX) / 2,
        (binBounds.minY + binBounds.maxY) / 2,
        -0.2
    );
    binGroup.add(bgPlane);
    
    // Visual border for bin
    const borderMaterial = new THREE.LineBasicMaterial({ color: 0x4a4a6e });
    const borderPoints = [
        new THREE.Vector3(binBounds.minX, binBounds.minY, 0),
        new THREE.Vector3(binBounds.maxX, binBounds.minY, 0),
        new THREE.Vector3(binBounds.maxX, binBounds.maxY, 0),
        new THREE.Vector3(binBounds.minX, binBounds.maxY, 0),
        new THREE.Vector3(binBounds.minX, binBounds.minY, 0)
    ];
    const borderGeometry = new THREE.BufferGeometry().setFromPoints(borderPoints);
    const borderLine = new THREE.Line(borderGeometry, borderMaterial);
    binGroup.add(borderLine);
    
    // Create physics walls for bin (static bodies)
    const wallThickness = 0.5;
    
    // Floor
    const floor = Bodies.rectangle(
        (binBounds.minX + binBounds.maxX) / 2 * scale,
        -(binBounds.minY - wallThickness / 2) * scale,
        binWidth * scale,
        wallThickness * scale,
        { isStatic: true }
    );
    
    // Left wall
    const leftWall = Bodies.rectangle(
        (binBounds.minX - wallThickness / 2) * scale,
        -(binBounds.minY + BIN_HEIGHT / 2) * scale,
        wallThickness * scale,
        BIN_HEIGHT * scale,
        { isStatic: true }
    );
    
    // Right wall
    const rightWall = Bodies.rectangle(
        (binBounds.maxX + wallThickness / 2) * scale,
        -(binBounds.minY + BIN_HEIGHT / 2) * scale,
        wallThickness * scale,
        BIN_HEIGHT * scale,
        { isStatic: true }
    );
    
    binWalls = [floor, leftWall, rightWall];
    World.add(world, binWalls);
    
    scene.add(binGroup);
}

/**
 * Gets the bounds of the bin area in world coordinates
 * @returns {{minX: number, maxX: number, minY: number, maxY: number}}
 */
function getBinBounds() {
    const gridBounds = getGridBounds();
    return {
        minX: gridBounds.minX,
        maxX: gridBounds.maxX,
        minY: gridBounds.minY - BIN_HEIGHT - 0.5, // Below grid with gap
        maxY: gridBounds.minY - 0.5
    };
}

/**
 * Checks if a world position is inside the bin area
 * @param {number} worldX - World X position
 * @param {number} worldY - World Y position
 * @returns {boolean} True if inside bin
 */
function isInsideBin(worldX, worldY) {
    const bounds = getBinBounds();
    return worldX >= bounds.minX && worldX <= bounds.maxX &&
           worldY >= bounds.minY && worldY <= bounds.maxY;
}

/**
 * Syncs bin piece meshes to their physics body positions
 * Resets pieces that escape the play area back to the top of the bin
 * @param {Array} binPieces - Array of pieces in the bin
 */
function syncBinPiecesToPhysics(binPieces) {
    const bounds = getBinBounds();
    const gridBounds = getGridBounds();
    
    // Allow pieces to be above bin (falling from grid) but not too far out
    const margin = 2;
    const minX = bounds.minX - margin;
    const maxX = bounds.maxX + margin;
    const minY = bounds.minY - margin; // Below bin floor
    const maxY = gridBounds.maxY + margin; // Above grid top
    
    for (const piece of binPieces) {
        if (piece.body && piece.mesh) {
            const pos = getBodyWorldPosition(piece.body);
            
            // Check if piece escaped the play area
            const outOfBounds = pos.x < minX || pos.x > maxX || 
                                pos.y < minY || pos.y > maxY;
            
            if (outOfBounds) {
                // Reset to top of bin with random X, zero velocity
                const resetPos = getRandomBinPosition();
                setBodyWorldPosition(piece.body, resetPos.x, resetPos.y);
                resetBodyVelocity(piece.body);
                pos.x = resetPos.x;
                pos.y = resetPos.y;
            }
            
            piece.mesh.position.set(pos.x, pos.y, 0);
            piece.mesh.rotation.z = pos.angle;
            // Update piece's logical position
            piece.x = pos.x;
            piece.y = pos.y;
            piece.angle = pos.angle;
        }
    }
}

/**
 * Gets a random spawn position within the bin
 * @returns {{x: number, y: number}}
 */
function getRandomBinPosition() {
    const bounds = getBinBounds();
    const padding = 1;
    return {
        x: bounds.minX + padding + Math.random() * (bounds.maxX - bounds.minX - padding * 2),
        y: bounds.maxY - 0.5 // Spawn near top of bin so they fall
    };
}

function getBinGroup() {
    return binGroup;
}

export {
    createBin,
    getBinBounds,
    isInsideBin,
    syncBinPiecesToPhysics,
    getRandomBinPosition,
    getBinGroup
};
