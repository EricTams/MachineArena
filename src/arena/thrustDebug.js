// Thrust debug visualization - draws arrows showing active thrust forces

import * as THREE from 'three';

// Debug state
let debugEnabled = false;
let debugGroup = null;
let thrustArrows = []; // Pool of arrow meshes

// Arrow geometry (shared)
let arrowGeometry = null;
let thrusterMaterial = null;
let omniMaterial = null;

// Configuration
const ARROW_SCALE = 0.3;       // Base arrow size
const FORCE_SCALE = 0.15;      // Arrow length per force unit
const MAX_ARROWS = 20;         // Maximum arrows in pool

/**
 * Initializes the thrust debug system
 * @param {THREE.Scene} scene - The scene to add debug visuals to
 */
function initThrustDebug(scene) {
    debugGroup = new THREE.Group();
    debugGroup.visible = debugEnabled;
    scene.add(debugGroup);
    
    // Create shared geometry - arrow shape pointing in +X direction
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.1);
    shape.lineTo(0.6, 0.1);
    shape.lineTo(0.6, 0.2);
    shape.lineTo(1, 0);
    shape.lineTo(0.6, -0.2);
    shape.lineTo(0.6, -0.1);
    shape.lineTo(0, -0.1);
    shape.closePath();
    
    arrowGeometry = new THREE.ShapeGeometry(shape);
    
    // Materials for different thrust types
    thrusterMaterial = new THREE.MeshBasicMaterial({
        color: 0x00ffff, // Cyan for thrusters
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide
    });
    
    omniMaterial = new THREE.MeshBasicMaterial({
        color: 0xffff00, // Yellow for omni thrust
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide
    });
    
    // Pre-create arrow pool
    for (let i = 0; i < MAX_ARROWS; i++) {
        const arrow = new THREE.Mesh(arrowGeometry, thrusterMaterial);
        arrow.visible = false;
        debugGroup.add(arrow);
        thrustArrows.push(arrow);
    }
}

/**
 * Toggles thrust debug visualization
 */
function toggleThrustDebug() {
    debugEnabled = !debugEnabled;
    if (debugGroup) {
        debugGroup.visible = debugEnabled;
    }
    console.log(`Thrust debug: ${debugEnabled ? 'ON' : 'OFF'}`);
}

/**
 * Sets thrust debug visibility
 * @param {boolean} enabled - Whether debug is enabled
 */
function setThrustDebugEnabled(enabled) {
    debugEnabled = enabled;
    if (debugGroup) {
        debugGroup.visible = debugEnabled;
    }
}

/**
 * Updates thrust debug visualization
 * @param {Array} activeThrusts - Array of active thrust info from input system
 */
function updateThrustDebug(activeThrusts) {
    if (!debugGroup || !debugEnabled) return;
    
    // Hide all arrows first
    for (const arrow of thrustArrows) {
        arrow.visible = false;
    }
    
    // Show arrows for active thrusts
    const count = Math.min(activeThrusts.length, MAX_ARROWS);
    for (let i = 0; i < count; i++) {
        const thrust = activeThrusts[i];
        const arrow = thrustArrows[i];
        
        // Position at thrust origin
        arrow.position.set(thrust.position.x, thrust.position.y, 0.5);
        
        // Rotate to point in thrust direction
        const angle = Math.atan2(thrust.direction.y, thrust.direction.x);
        arrow.rotation.z = angle;
        
        // Scale by force magnitude
        const length = ARROW_SCALE + thrust.magnitude * FORCE_SCALE;
        arrow.scale.set(length, ARROW_SCALE, 1);
        
        // Set material based on type
        arrow.material = thrust.type === 'omni' ? omniMaterial : thrusterMaterial;
        
        arrow.visible = true;
    }
}

/**
 * Cleans up thrust debug resources
 * @param {THREE.Scene} scene - The scene to remove from
 */
function cleanupThrustDebug(scene) {
    if (debugGroup && scene) {
        scene.remove(debugGroup);
    }
    
    // Dispose geometries and materials
    if (arrowGeometry) {
        arrowGeometry.dispose();
        arrowGeometry = null;
    }
    if (thrusterMaterial) {
        thrusterMaterial.dispose();
        thrusterMaterial = null;
    }
    if (omniMaterial) {
        omniMaterial.dispose();
        omniMaterial = null;
    }
    
    thrustArrows = [];
    debugGroup = null;
}

/**
 * Checks if thrust debug is enabled
 * @returns {boolean} Whether debug is enabled
 */
function isThrustDebugEnabled() {
    return debugEnabled;
}

export {
    initThrustDebug,
    toggleThrustDebug,
    setThrustDebugEnabled,
    updateThrustDebug,
    cleanupThrustDebug,
    isThrustDebugEnabled
};
