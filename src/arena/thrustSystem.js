// Thrust system - applies forces at thruster and core positions

import { applyForceAtPosition, applyTorque, getArenaPhysicsScale } from './arenaPhysics.js';
import { rotateVector, angleDiff, dot, length, normalize } from '../math.js';

// Matter.js is loaded globally
const Body = Matter.Body;

/**
 * Checks if a thruster is currently unable to fire (disabled or overheated)
 * @param {object} thruster - Thruster info from ship.thrusters
 * @returns {boolean} True if thruster cannot fire
 */
function isThrusterInactive(thruster) {
    return thruster.disabled || thruster.overheated;
}

/**
 * Calculates the ramp-up multiplier for a thruster based on its active time
 * @param {object} thruster - Thruster info from ship.thrusters
 * @returns {number} Multiplier between startPercent and 1.0
 */
function getRampUpMultiplier(thruster) {
    if (!thruster.rampUp) return 1.0;
    
    const { startPercent, rampTime } = thruster.rampUp;
    if (thruster.activeTime >= rampTime) return 1.0;
    
    // Linear interpolation from startPercent to 1.0 over rampTime
    const t = thruster.activeTime / rampTime;
    return startPercent + (1.0 - startPercent) * t;
}

/**
 * Applies thrust from a specific thruster
 * Force is applied at thruster position, creating torque if off-center
 * Accounts for ramp-up scaling and marks thruster as fired this frame
 * @param {object} ship - Arena ship object
 * @param {object} thruster - Thruster info from ship.thrusters
 * @param {number} throttle - Throttle value 0-1
 */
function applyThrusterForce(ship, thruster, throttle) {
    if (!ship || !ship.body || !thruster || throttle <= 0) return;
    if (isThrusterInactive(thruster)) return;
    
    // Mark as fired this frame (for ramp-up and overheat tracking)
    thruster.firedThisFrame = true;
    
    // Get world position of thruster (local pos rotated by ship angle + ship position)
    const worldPos = getWorldPositionFromLocal(ship, thruster.localPos);
    
    // Get exhaust direction in world space (rotate local exhaust dir by ship angle)
    const shipAngle = -ship.body.angle; // Convert physics angle to world angle
    const exhaustWorldDir = rotateVector(thruster.exhaustDir, shipAngle);
    
    // Push direction is opposite to exhaust direction (Newton's third law)
    const pushDir = { x: -exhaustWorldDir.x, y: -exhaustWorldDir.y };
    
    // Calculate force magnitude with ramp-up scaling
    const rampMultiplier = getRampUpMultiplier(thruster);
    const forceMagnitude = thruster.thrustForce * throttle * rampMultiplier;
    
    // Apply force at position (in push direction)
    const force = {
        x: pushDir.x * forceMagnitude,
        y: pushDir.y * forceMagnitude
    };
    
    applyForceAtPosition(ship.body, worldPos, force);
}

/**
 * Updates per-thruster runtime state: ramp-up timers, overheat tracking, cooldowns.
 * Should be called once per frame AFTER all thrust application is done.
 * @param {object} ship - Arena ship object
 * @param {number} dt - Delta time in seconds
 */
function updateThrusterState(ship, dt) {
    if (!ship || !ship.thrusters) return;
    
    const now = performance.now() / 1000; // Current time in seconds
    
    for (const thruster of ship.thrusters) {
        // --- Ramp-up tracking ---
        if (thruster.rampUp) {
            if (thruster.firedThisFrame) {
                thruster.activeTime += dt;
            } else {
                // Reset ramp when not firing
                thruster.activeTime = 0;
            }
        }
        
        // --- Overheat tracking ---
        if (thruster.overheat) {
            // If currently in cooldown, count down
            if (thruster.overheated) {
                thruster.cooldownTimer -= dt;
                if (thruster.cooldownTimer <= 0) {
                    thruster.overheated = false;
                    thruster.cooldownTimer = 0;
                    thruster.usageHistory = []; // Clear history on recovery
                }
            } else {
                // Record usage this frame
                thruster.usageHistory.push({
                    time: now,
                    fired: thruster.firedThisFrame ? 1 : 0
                });
                
                // Trim history to window
                const windowStart = now - thruster.overheat.windowSeconds;
                while (thruster.usageHistory.length > 0 && thruster.usageHistory[0].time < windowStart) {
                    thruster.usageHistory.shift();
                }
                
                // Calculate usage ratio over the window
                if (thruster.usageHistory.length > 0) {
                    let firedCount = 0;
                    for (const entry of thruster.usageHistory) {
                        firedCount += entry.fired;
                    }
                    const usageRatio = firedCount / thruster.usageHistory.length;
                    
                    // Check if over threshold
                    if (usageRatio > thruster.overheat.threshold) {
                        thruster.overheated = true;
                        thruster.cooldownTimer = thruster.overheat.cooldownTime;
                        thruster.activeTime = 0; // Reset ramp on overheat
                    }
                }
            }
        }
        
        // --- Sync virtual thrusters with parent ---
        // Virtual thrusters disable when parent disables (block break)
        if (thruster.isVirtual && thruster.parentThruster) {
            if (thruster.parentThruster.disabled) {
                thruster.disabled = true;
            }
        }
        
        // Reset firedThisFrame for next frame
        thruster.firedThisFrame = false;
    }
}

/**
 * Applies omni-directional thrust from the core
 * Can thrust in any direction regardless of ship orientation
 * @param {object} ship - Arena ship object
 * @param {object} direction - World direction to thrust {x, y} (normalized)
 * @param {number} throttle - Throttle value 0-1
 */
function applyOmniThrust(ship, direction, throttle) {
    if (!ship || !ship.body || !ship.core || throttle <= 0) return;
    
    // Get world position of core
    const worldPos = getWorldPositionFromLocal(ship, ship.core.localPos);
    
    // Normalize direction if needed
    const len = length(direction);
    if (len === 0) return;
    
    const normDir = normalize(direction);
    
    // Calculate force magnitude
    const forceMagnitude = ship.core.omniThrustForce * throttle;
    
    // Apply force at core position
    const force = {
        x: normDir.x * forceMagnitude,
        y: normDir.y * forceMagnitude
    };
    
    applyForceAtPosition(ship.body, worldPos, force);
}

/**
 * Applies raw angular thrust in a direction (for Q/E turning)
 * @param {object} ship - Arena ship object
 * @param {number} direction - -1 for counter-clockwise (left), 1 for clockwise (right)
 * @param {number} throttle - Throttle value 0-1
 */
function applyAngularThrustDirection(ship, direction, throttle) {
    if (!ship || !ship.body || !ship.core || throttle <= 0) return;
    
    const torqueMagnitude = ship.core.angularThrustForce * throttle;
    // direction: -1 = CCW (left), +1 = CW (right)
    // World convention: positive torque = CCW, so CCW needs positive, CW needs negative
    applyTorque(ship.body, -direction * torqueMagnitude);
}

/**
 * Applies angular thrust to rotate the ship toward a target angle
 * @param {object} ship - Arena ship object
 * @param {number} targetAngle - Target angle in radians (world space)
 * @param {number} throttle - Throttle value 0-1
 */
function applyAngularThrust(ship, targetAngle, throttle) {
    if (!ship || !ship.body || !ship.core) return;
    
    const currentAngle = -ship.body.angle; // Convert physics to world angle
    
    // Calculate angle difference (shortest path, normalized to -PI to PI)
    const angDiff = angleDiff(targetAngle, currentAngle);
    
    // Dead zone to prevent oscillation
    const deadZone = 0.05; // ~3 degrees
    if (Math.abs(angDiff) < deadZone) {
        // Apply damping to stop rotation
        const angularVel = ship.body.angularVelocity;
        if (Math.abs(angularVel) > 0.01) {
            Body.setAngularVelocity(ship.body, angularVel * 0.9);
        }
        return;
    }
    
    // Proportional control with velocity damping
    const angularVel = ship.body.angularVelocity;
    const targetAngularVel = angDiff * 5; // P gain
    const velError = targetAngularVel - angularVel;
    
    // Calculate torque
    // angDiff > 0 means need CCW = positive torque in world convention
    const torqueMagnitude = ship.core.angularThrustForce * throttle;
    const torque = Math.sign(velError) * Math.min(Math.abs(velError), torqueMagnitude);
    
    applyTorque(ship.body, torque);
}

/**
 * Gets thrusters that can contribute to a movement direction
 * @param {object} ship - Arena ship object
 * @param {object} moveDir - Desired movement direction {x, y} in world space
 * @returns {Array} Thrusters that can help with this direction
 */
function getThrustersForDirection(ship, moveDir) {
    if (!ship || !ship.thrusters) return [];
    
    const shipAngle = -ship.body.angle;
    const result = [];
    
    for (const thruster of ship.thrusters) {
        // Skip disabled or overheated thrusters
        if (isThrusterInactive(thruster)) continue;
        
        // Get thruster's exhaust direction in world space
        const exhaustWorldDir = rotateVector(thruster.exhaustDir, shipAngle);
        
        // Push direction is opposite to exhaust
        const pushDir = { x: -exhaustWorldDir.x, y: -exhaustWorldDir.y };
        
        // Dot product: positive if thruster's push direction helps with desired movement
        const dotProduct = dot(pushDir, moveDir);
        
        if (dotProduct > 0.1) { // Threshold to avoid weak contributions
            result.push({
                thruster: thruster,
                effectiveness: dotProduct
            });
        }
    }
    
    return result;
}

/**
 * Gets thrusters that can contribute to rotation in a given direction
 * @param {object} ship - Arena ship object
 * @param {number} rotationDirection - -1 for CCW (left), +1 for CW (right)
 * @returns {Array} Thrusters that can help with this rotation direction
 */
function getThrustersForRotation(ship, rotationDirection) {
    if (!ship || !ship.thrusters) return [];
    
    const result = [];
    
    for (const thruster of ship.thrusters) {
        // Skip disabled or overheated thrusters
        if (isThrusterInactive(thruster)) continue;
        
        // Calculate torque this thruster would create
        // Torque = r × F = r.x * F.y - r.y * F.x
        // where r is position relative to COM (localPos), F is force/push direction
        // Push direction is opposite to exhaust direction
        // Positive torque = CCW rotation, negative torque = CW rotation
        const r = thruster.localPos;
        const exhaustDir = thruster.exhaustDir;
        // Force direction is opposite to exhaust
        const F = { x: -exhaustDir.x, y: -exhaustDir.y };
        const torque = r.x * F.y - r.y * F.x;
        
        // Check if torque helps with desired rotation
        // CCW (direction -1) needs positive torque, CW (direction +1) needs negative torque
        // So we want: sign(torque) == -sign(rotationDirection)
        // Equivalently: torque * rotationDirection < 0
        if (torque * rotationDirection < -0.01) {
            result.push({
                thruster: thruster,
                // Effectiveness is how much torque per unit thrust
                effectiveness: Math.abs(torque)
            });
        }
    }
    
    return result;
}

/**
 * Applies thrust from thrusters that help with rotation (Fast Turn)
 * @param {object} ship - Arena ship object
 * @param {number} rotationDirection - -1 for CCW (left), +1 for CW (right)
 * @param {number} throttle - Throttle value 0-1
 * @returns {Array} Active thrust info for debug visualization
 */
function applyRotationThrusters(ship, rotationDirection, throttle) {
    if (!ship || throttle <= 0) return [];
    
    const activeThrusts = [];
    const shipAngle = -ship.body.angle;
    
    // Find thrusters that help with this rotation
    const helpfulThrusters = getThrustersForRotation(ship, rotationDirection);
    
    // Apply thrust from each helpful thruster
    for (const { thruster, effectiveness } of helpfulThrusters) {
        // Scale throttle by effectiveness (more torque = more useful)
        const thrusterThrottle = throttle * Math.min(effectiveness, 1.0);
        applyThrusterForce(ship, thruster, thrusterThrottle);
        
        // Track for debug visualization (show push direction, opposite to exhaust)
        const worldPos = getWorldPositionFromLocal(ship, thruster.localPos);
        const exhaustWorldDir = rotateVector(thruster.exhaustDir, shipAngle);
        const pushDir = { x: -exhaustWorldDir.x, y: -exhaustWorldDir.y };
        activeThrusts.push({
            type: 'thruster',
            position: worldPos,
            direction: pushDir,
            magnitude: thruster.thrustForce * thrusterThrottle
        });
    }
    
    return activeThrusts;
}

/**
 * Applies thrust in a relative direction (forward, back, strafe)
 * Uses thrusters if available, falls back to omni-thrust
 * @param {object} ship - Arena ship object
 * @param {string} direction - 'forward', 'back', 'left', 'right'
 * @param {number} throttle - Throttle value 0-1
 * @returns {Array} Active thrust info for debug visualization
 */
function applyDirectionalThrust(ship, direction, throttle) {
    if (!ship || throttle <= 0) return [];
    
    const shipAngle = -ship.body.angle;
    const activeThrusts = [];
    
    // Get ship-relative direction vectors
    // Top of designer (+Y) = forward, right of designer (+X) = strafe right
    let relativeDir;
    switch (direction) {
        case 'forward':
            relativeDir = { x: 0, y: 1 };
            break;
        case 'back':
            relativeDir = { x: 0, y: -1 };
            break;
        case 'left':
            relativeDir = { x: -1, y: 0 };
            break;
        case 'right':
            relativeDir = { x: 1, y: 0 };
            break;
        default:
            return [];
    }
    
    // Convert to world direction
    const worldDir = rotateVector(relativeDir, shipAngle);
    
    // Find thrusters that can contribute
    const helpfulThrusters = getThrustersForDirection(ship, worldDir);
    
    // Apply thrust from thrusters
    let thrusterContribution = 0;
    for (const { thruster, effectiveness } of helpfulThrusters) {
        const thrusterThrottle = throttle * effectiveness;
        applyThrusterForce(ship, thruster, thrusterThrottle);
        thrusterContribution += effectiveness;
        
        // Track for debug (show push direction, opposite to exhaust)
        const worldPos = getWorldPositionFromLocal(ship, thruster.localPos);
        const exhaustWorldDir = rotateVector(thruster.exhaustDir, shipAngle);
        const pushDir = { x: -exhaustWorldDir.x, y: -exhaustWorldDir.y };
        activeThrusts.push({
            type: 'thruster',
            position: worldPos,
            direction: pushDir,
            magnitude: thruster.thrustForce * thrusterThrottle
        });
    }
    
    // Use omni-thrust for remainder (or full amount if no thrusters help)
    if (ship.core) {
        // Omni handles strafing and supplements thrusters
        const omniThrottle = (direction === 'left' || direction === 'right') 
            ? throttle  // Full omni for strafe
            : throttle * Math.max(0, 1 - thrusterContribution); // Supplement thrusters
        
        if (omniThrottle > 0.01) {
            applyOmniThrust(ship, worldDir, omniThrottle);
            
            // Track for debug
            const worldPos = getWorldPositionFromLocal(ship, ship.core.localPos);
            activeThrusts.push({
                type: 'omni',
                position: worldPos,
                direction: worldDir,
                magnitude: ship.core.omniThrustForce * omniThrottle
            });
        }
    }
    
    return activeThrusts;
}

/**
 * Converts a local position to world position based on ship body
 * @param {object} ship - Arena ship object
 * @param {object} localPos - Local position {x, y}
 * @returns {object} World position {x, y}
 */
function getWorldPositionFromLocal(ship, localPos) {
    const scale = getArenaPhysicsScale();
    const shipX = ship.body.position.x / scale;
    const shipY = -ship.body.position.y / scale;
    const shipAngle = -ship.body.angle;
    
    // Rotate local position by ship angle
    const rotated = rotateVector(localPos, shipAngle);
    
    return {
        x: shipX + rotated.x,
        y: shipY + rotated.y
    };
}

export {
    applyThrusterForce,
    applyOmniThrust,
    applyAngularThrust,
    applyAngularThrustDirection,
    applyDirectionalThrust,
    getThrustersForDirection,
    getThrustersForRotation,
    applyRotationThrusters,
    getWorldPositionFromLocal,
    updateThrusterState
};
