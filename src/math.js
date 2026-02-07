// 2D math utilities for angle and vector operations

/**
 * Normalizes an angle to the range [-PI, PI]
 * @param {number} angle - Angle in radians
 * @returns {number} Normalized angle
 */
export function normalizeAngle(angle) {
    while (angle > Math.PI) angle -= Math.PI * 2;
    while (angle < -Math.PI) angle += Math.PI * 2;
    return angle;
}

/**
 * Rotates a 2D vector by an angle
 * @param {object} vec - Vector {x, y}
 * @param {number} angle - Angle in radians
 * @returns {object} Rotated vector {x, y}
 */
export function rotateVector(vec, angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
        x: vec.x * cos - vec.y * sin,
        y: vec.x * sin + vec.y * cos
    };
}

/**
 * Calculates the angle from one point to another using atan2
 * @param {number} fromX - Source X coordinate
 * @param {number} fromY - Source Y coordinate
 * @param {number} toX - Target X coordinate
 * @param {number} toY - Target Y coordinate
 * @returns {number} Angle in radians
 */
export function angleTo(fromX, fromY, toX, toY) {
    return Math.atan2(toY - fromY, toX - fromX);
}

/**
 * Calculates the shortest angle difference between two angles
 * @param {number} targetAngle - Target angle in radians
 * @param {number} currentAngle - Current angle in radians
 * @returns {number} Normalized angle difference in [-PI, PI]
 */
export function angleDiff(targetAngle, currentAngle) {
    return normalizeAngle(targetAngle - currentAngle);
}

/**
 * Calculates the dot product of two 2D vectors
 * @param {object} a - First vector {x, y}
 * @param {object} b - Second vector {x, y}
 * @returns {number} Dot product
 */
export function dot(a, b) {
    return a.x * b.x + a.y * b.y;
}

/**
 * Calculates the length (magnitude) of a 2D vector
 * @param {object} vec - Vector {x, y}
 * @returns {number} Vector length
 */
export function length(vec) {
    return Math.sqrt(vec.x * vec.x + vec.y * vec.y);
}

/**
 * Normalizes a 2D vector to unit length
 * @param {object} vec - Vector {x, y}
 * @returns {object} Unit vector {x, y}, or {0, 0} if input is zero-length
 */
export function normalize(vec) {
    const len = length(vec);
    if (len === 0) return { x: 0, y: 0 };
    return { x: vec.x / len, y: vec.y / len };
}

/**
 * Gets the forward direction for equipment at a given angle
 * Equipment forward is +Y in local space, rotated by piece angle
 * At angle 0: forward = {0, 1} = +Y
 * @param {number} angle - Equipment angle in radians
 * @returns {object} Forward direction vector {x, y}
 */
export function getEquipmentForward(angle) {
    return { x: -Math.sin(angle), y: Math.cos(angle) };
}
