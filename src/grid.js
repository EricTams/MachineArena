// Design grid - logical coordinates and visual rendering

import * as THREE from 'three';
import { getScene } from './scene.js';

// Grid configuration
const GRID_COLS = 10;
const GRID_ROWS = 10;
const CELL_SIZE = 1; // 1 world unit per cell

// Grid position (centered horizontally, upper portion of screen)
// Camera shows Y from -8 to +8, grid is 10 tall, bin is 4 tall below
const GRID_OFFSET_X = -GRID_COLS * CELL_SIZE / 2;
const GRID_OFFSET_Y = -3; // Grid spans Y=-3 to Y=7, leaving room for bin below

let gridGroup = null;

/**
 * Creates the visual grid in the scene
 */
function createGrid() {
    const scene = getScene();
    gridGroup = new THREE.Group();
    gridGroup.position.set(GRID_OFFSET_X, GRID_OFFSET_Y, 0);
    
    // Create grid lines
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0x3a3a5e, linewidth: 1 });
    
    // Vertical lines
    for (let col = 0; col <= GRID_COLS; col++) {
        const points = [
            new THREE.Vector3(col * CELL_SIZE, 0, 0),
            new THREE.Vector3(col * CELL_SIZE, GRID_ROWS * CELL_SIZE, 0)
        ];
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(geometry, lineMaterial);
        gridGroup.add(line);
    }
    
    // Horizontal lines
    for (let row = 0; row <= GRID_ROWS; row++) {
        const points = [
            new THREE.Vector3(0, row * CELL_SIZE, 0),
            new THREE.Vector3(GRID_COLS * CELL_SIZE, row * CELL_SIZE, 0)
        ];
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(geometry, lineMaterial);
        gridGroup.add(line);
    }
    
    // Add subtle background for grid area
    const bgGeometry = new THREE.PlaneGeometry(GRID_COLS * CELL_SIZE, GRID_ROWS * CELL_SIZE);
    const bgMaterial = new THREE.MeshBasicMaterial({ 
        color: 0x252540, 
        transparent: true, 
        opacity: 0.5 
    });
    const bgPlane = new THREE.Mesh(bgGeometry, bgMaterial);
    bgPlane.position.set(GRID_COLS * CELL_SIZE / 2, GRID_ROWS * CELL_SIZE / 2, -0.1);
    gridGroup.add(bgPlane);
    
    scene.add(gridGroup);
}

/**
 * Converts world coordinates to grid cell coordinates
 * @param {number} worldX - World X position
 * @param {number} worldY - World Y position
 * @returns {{col: number, row: number} | null} Grid cell or null if outside grid
 */
function worldToGrid(worldX, worldY) {
    const localX = worldX - GRID_OFFSET_X;
    const localY = worldY - GRID_OFFSET_Y;
    
    const col = Math.floor(localX / CELL_SIZE);
    const row = Math.floor(localY / CELL_SIZE);
    
    if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) {
        return null;
    }
    
    return { col, row };
}

/**
 * Converts grid cell coordinates to world coordinates (cell center)
 * @param {number} col - Grid column
 * @param {number} row - Grid row
 * @returns {{x: number, y: number}} World coordinates of cell center
 */
function gridToWorld(col, row) {
    return {
        x: GRID_OFFSET_X + (col + 0.5) * CELL_SIZE,
        y: GRID_OFFSET_Y + (row + 0.5) * CELL_SIZE
    };
}

/**
 * Checks if a grid position is within bounds
 * @param {number} col - Grid column
 * @param {number} row - Grid row
 * @param {number} width - Piece width in cells
 * @param {number} height - Piece height in cells
 * @returns {boolean} True if position is valid
 */
function isWithinGrid(col, row, width = 1, height = 1) {
    return col >= 0 && col + width <= GRID_COLS && 
           row >= 0 && row + height <= GRID_ROWS;
}

/**
 * Gets the bounds of the grid in world coordinates
 * @returns {{minX: number, maxX: number, minY: number, maxY: number}}
 */
function getGridBounds() {
    return {
        minX: GRID_OFFSET_X,
        maxX: GRID_OFFSET_X + GRID_COLS * CELL_SIZE,
        minY: GRID_OFFSET_Y,
        maxY: GRID_OFFSET_Y + GRID_ROWS * CELL_SIZE
    };
}

/**
 * Checks if a world position is inside the grid area
 * @param {number} worldX - World X position
 * @param {number} worldY - World Y position
 * @returns {boolean} True if inside grid
 */
function isInsideGrid(worldX, worldY) {
    const bounds = getGridBounds();
    return worldX >= bounds.minX && worldX <= bounds.maxX &&
           worldY >= bounds.minY && worldY <= bounds.maxY;
}

function getGridConfig() {
    return { GRID_COLS, GRID_ROWS, CELL_SIZE, GRID_OFFSET_X, GRID_OFFSET_Y };
}

function getGridGroup() {
    return gridGroup;
}

export {
    createGrid,
    worldToGrid,
    gridToWorld,
    isWithinGrid,
    getGridBounds,
    isInsideGrid,
    getGridConfig,
    getGridGroup
};
