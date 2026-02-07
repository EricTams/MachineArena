// Three.js scene setup - camera, renderer, lighting

import * as THREE from 'three';

// Scene dimensions in world units
const WORLD_WIDTH = 20;
const WORLD_HEIGHT = 16;

let scene = null;
let camera = null;
let renderer = null;

/**
 * Creates the Three.js scene with orthographic camera
 * @param {HTMLCanvasElement} canvas - The canvas element to render to
 */
function createScene(canvas) {
    // Create scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    
    // Calculate aspect ratio
    const aspect = window.innerWidth / window.innerHeight;
    
    // Orthographic camera for 2D gameplay with 3D visuals
    // Camera shows WORLD_HEIGHT units vertically, width adjusts to aspect
    const viewHeight = WORLD_HEIGHT;
    const viewWidth = viewHeight * aspect;
    
    camera = new THREE.OrthographicCamera(
        -viewWidth / 2,   // left
        viewWidth / 2,    // right
        viewHeight / 2,   // top
        -viewHeight / 2,  // bottom
        0.1,              // near
        1000              // far
    );
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    
    // Create renderer
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    
    // Add lighting
    addLighting();
    
    return { scene, camera, renderer };
}

/**
 * Adds lights to the scene
 */
function addLighting() {
    // Ambient light for base illumination
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);
    
    // Directional light for shadows and depth
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 7);
    scene.add(directionalLight);
    
    // Secondary fill light
    const fillLight = new THREE.DirectionalLight(0x8888ff, 0.3);
    fillLight.position.set(-5, 5, 3);
    scene.add(fillLight);
}

/**
 * Handles window resize
 */
function resizeScene() {
    const aspect = window.innerWidth / window.innerHeight;
    const viewHeight = WORLD_HEIGHT;
    const viewWidth = viewHeight * aspect;
    
    camera.left = -viewWidth / 2;
    camera.right = viewWidth / 2;
    camera.top = viewHeight / 2;
    camera.bottom = -viewHeight / 2;
    camera.updateProjectionMatrix();
    
    renderer.setSize(window.innerWidth, window.innerHeight);
}

/**
 * Converts screen coordinates to world coordinates
 * @param {number} screenX - Screen X position
 * @param {number} screenY - Screen Y position
 * @returns {{x: number, y: number}} World coordinates
 */
function screenToWorld(screenX, screenY) {
    const rect = renderer.domElement.getBoundingClientRect();
    
    // Normalize to -1 to 1
    const ndcX = ((screenX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((screenY - rect.top) / rect.height) * 2 + 1;
    
    // Convert to world coordinates
    const worldX = ndcX * (camera.right - camera.left) / 2 + (camera.right + camera.left) / 2;
    const worldY = ndcY * (camera.top - camera.bottom) / 2 + (camera.top + camera.bottom) / 2;
    
    return { x: worldX, y: worldY };
}

function getScene() { return scene; }
function getCamera() { return camera; }
function getRenderer() { return renderer; }
function getWorldDimensions() { return { width: WORLD_WIDTH, height: WORLD_HEIGHT }; }

export {
    createScene,
    resizeScene,
    screenToWorld,
    getScene,
    getCamera,
    getRenderer,
    getWorldDimensions
};
