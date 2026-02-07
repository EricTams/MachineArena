// Target indicator - animated marker showing where player is facing towards

import * as THREE from 'three';

// Indicator state
let indicatorGroup = null;
let outerRing = null;
let innerRing = null;
let crosshairs = [];
let targetPosition = null;
let animationTime = 0;

// Configuration
const OUTER_RADIUS = 1.2;
const INNER_RADIUS = 0.6;
const RING_SEGMENTS = 32;
const PULSE_SPEED = 4;         // Pulses per second
const PULSE_SCALE = 0.15;      // Scale variation amount
const ROTATION_SPEED = 1.5;    // Rotations per second
const FADE_SPEED = 0.5;        // Fade out speed when no target

// Materials
let ringMaterial = null;
let crosshairMaterial = null;

/**
 * Initializes the target indicator
 * @param {THREE.Scene} scene - The scene to add indicator to
 */
function initTargetIndicator(scene) {
    indicatorGroup = new THREE.Group();
    indicatorGroup.visible = false;
    
    // Create ring material (bright cyan/teal)
    ringMaterial = new THREE.MeshBasicMaterial({
        color: 0x00ddff,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide
    });
    
    crosshairMaterial = new THREE.MeshBasicMaterial({
        color: 0x00ffaa,
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide
    });
    
    // Outer ring (torus)
    const outerGeom = new THREE.RingGeometry(OUTER_RADIUS - 0.08, OUTER_RADIUS, RING_SEGMENTS);
    outerRing = new THREE.Mesh(outerGeom, ringMaterial);
    indicatorGroup.add(outerRing);
    
    // Inner ring (torus, rotates opposite)
    const innerGeom = new THREE.RingGeometry(INNER_RADIUS - 0.06, INNER_RADIUS, RING_SEGMENTS);
    innerRing = new THREE.Mesh(innerGeom, ringMaterial.clone());
    indicatorGroup.add(innerRing);
    
    // Crosshair lines (4 short lines pointing inward)
    const crosshairLength = 0.4;
    const crosshairWidth = 0.08;
    const crosshairGeom = new THREE.PlaneGeometry(crosshairLength, crosshairWidth);
    
    for (let i = 0; i < 4; i++) {
        const crosshair = new THREE.Mesh(crosshairGeom, crosshairMaterial);
        const angle = (i * Math.PI) / 2;
        const distance = (OUTER_RADIUS + INNER_RADIUS) / 2;
        crosshair.position.x = Math.cos(angle) * distance;
        crosshair.position.y = Math.sin(angle) * distance;
        crosshair.rotation.z = angle;
        crosshairs.push(crosshair);
        indicatorGroup.add(crosshair);
    }
    
    // Center dot
    const dotGeom = new THREE.CircleGeometry(0.12, 16);
    const dotMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.8
    });
    const centerDot = new THREE.Mesh(dotGeom, dotMaterial);
    indicatorGroup.add(centerDot);
    
    // Position slightly above arena floor
    indicatorGroup.position.z = 0.2;
    
    scene.add(indicatorGroup);
}

/**
 * Sets the target position for the indicator
 * @param {object|null} worldPos - World position {x, y} or null to hide
 */
function setTargetPosition(worldPos) {
    targetPosition = worldPos ? { x: worldPos.x, y: worldPos.y } : null;
    
    if (targetPosition) {
        indicatorGroup.visible = true;
        indicatorGroup.position.x = targetPosition.x;
        indicatorGroup.position.y = targetPosition.y;
    } else {
        indicatorGroup.visible = false;
    }
}

/**
 * Clears the target indicator
 */
function clearTargetIndicator() {
    targetPosition = null;
    if (indicatorGroup) {
        indicatorGroup.visible = false;
    }
}

/**
 * Updates the indicator animation
 * @param {number} deltaTime - Time since last frame in seconds
 */
function updateTargetIndicator(deltaTime) {
    if (!indicatorGroup || !targetPosition) return;
    
    animationTime += deltaTime;
    
    // Pulse effect (scale oscillation)
    const pulse = 1 + Math.sin(animationTime * PULSE_SPEED * Math.PI * 2) * PULSE_SCALE;
    
    // Rotate rings in opposite directions
    const rotation = animationTime * ROTATION_SPEED * Math.PI * 2;
    outerRing.rotation.z = rotation;
    innerRing.rotation.z = -rotation * 1.5;
    
    // Apply pulse to outer ring
    outerRing.scale.setScalar(pulse);
    
    // Inner ring pulses opposite phase
    const innerPulse = 1 + Math.sin(animationTime * PULSE_SPEED * Math.PI * 2 + Math.PI) * PULSE_SCALE;
    innerRing.scale.setScalar(innerPulse);
    
    // Crosshairs pulse subtly
    const crosshairPulse = 1 + Math.sin(animationTime * PULSE_SPEED * 2 * Math.PI * 2) * (PULSE_SCALE * 0.5);
    for (const ch of crosshairs) {
        ch.scale.setScalar(crosshairPulse);
    }
    
    // Opacity pulsing (subtle breathing effect)
    const opacityBase = 0.5 + Math.sin(animationTime * 2) * 0.2;
    ringMaterial.opacity = opacityBase + 0.2;
    if (innerRing.material !== ringMaterial) {
        innerRing.material.opacity = opacityBase + 0.1;
    }
}

/**
 * Cleans up target indicator resources
 * @param {THREE.Scene} scene - The scene to remove from
 */
function cleanupTargetIndicator(scene) {
    if (indicatorGroup && scene) {
        scene.remove(indicatorGroup);
    }
    
    // Dispose geometries
    if (indicatorGroup) {
        indicatorGroup.traverse((child) => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        });
    }
    
    indicatorGroup = null;
    outerRing = null;
    innerRing = null;
    crosshairs = [];
    targetPosition = null;
    ringMaterial = null;
    crosshairMaterial = null;
    animationTime = 0;
}

/**
 * Gets the current target position
 * @returns {object|null} Target position {x, y} or null
 */
function getTargetPosition() {
    return targetPosition;
}

export {
    initTargetIndicator,
    setTargetPosition,
    clearTargetIndicator,
    updateTargetIndicator,
    cleanupTargetIndicator,
    getTargetPosition
};
