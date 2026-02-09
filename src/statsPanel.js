// Stats Panel - displays stats for hovered/selected pieces in the designer

import { isThrusterType, isCannonType } from './pieces/equipment.js';

let panelElement = null;
let currentPiece = null;

/**
 * Initializes the stats panel
 */
function initStatsPanel() {
    panelElement = document.getElementById('stats-panel');
}

/**
 * Shows stats for a piece
 * @param {object} piece - The piece to show stats for
 */
function showStats(piece) {
    if (!panelElement || !piece) return;
    if (piece === currentPiece) return; // No change
    
    currentPiece = piece;
    panelElement.innerHTML = buildStatsHTML(piece);
    panelElement.classList.add('visible');
}

/**
 * Hides the stats panel
 */
function hideStats() {
    if (!panelElement) return;
    currentPiece = null;
    panelElement.classList.remove('visible');
}

/**
 * Builds HTML content for piece stats
 * @param {object} piece - The piece
 * @returns {string} HTML string
 */
function buildStatsHTML(piece) {
    const def = piece.definition;
    let html = `<h3>${def.name}</h3>`;
    
    // Basic stats (all pieces have these)
    html += statRow('Size', `${def.width}×${def.height}`);
    html += statRow('Mass', def.mass);
    
    // Category-specific stats
    if (piece.category === 'core') {
        html += buildCoreStats(def);
    } else if (piece.category === 'block') {
        html += buildBlockStats(def);
    } else if (piece.category === 'equipment') {
        html += buildEquipmentStats(piece.type, def);
    }
    
    return html;
}

/**
 * Builds stats section for core
 * @param {object} def - Core definition
 * @returns {string} HTML string
 */
function buildCoreStats(def) {
    let html = sectionStart('Thrust');
    html += statRow('Omni Force', def.omniThrustForce);
    html += statRow('Turn Force', def.angularThrustForce);
    html += sectionEnd();
    return html;
}

/**
 * Builds stats section for blocks
 * @param {object} def - Block definition
 * @returns {string} HTML string
 */
function buildBlockStats(def) {
    let html = '';
    
    if (def.tier) {
        html += sectionStart('Info');
        html += statRow('Tier', def.tier.charAt(0).toUpperCase() + def.tier.slice(1));
        html += sectionEnd();
    }
    
    if (def.hp !== undefined) {
        html += sectionStart('Durability');
        html += statRow('HP', def.hp);
        html += sectionEnd();
    }
    
    return html;
}

/**
 * Builds stats section for equipment
 * @param {string} type - Equipment type
 * @param {object} def - Equipment definition
 * @returns {string} HTML string
 */
function buildEquipmentStats(type, def) {
    let html = '';
    
    // Show tier and cost if available
    if (def.tier || def.cost !== undefined) {
        html += sectionStart('Info');
        if (def.tier) html += statRow('Tier', def.tier.charAt(0).toUpperCase() + def.tier.slice(1));
        if (def.cost !== undefined) html += statRow('Cost', `${def.cost} credits`);
        html += sectionEnd();
    }
    
    if (isCannonType(type)) {
        html += sectionStart('Weapon');
        html += statRow('Firing Arc', formatDegrees(def.firingArc));
        html += statRow('Aiming Arc', formatDegrees(def.aimingArc));
        html += statRow('Aim Speed', `${def.aimingSpeed.toFixed(1)} rad/s`);
        html += sectionEnd();
        
        html += sectionStart('Projectile');
        html += statRow('Speed', def.projectileSpeed);
        html += statRow('Lifetime', `${def.projectileLifetime.toFixed(1)}s`);
        html += statRow('Range', (def.projectileSpeed * def.projectileLifetime).toFixed(0));
        html += statRow('Reload', `${def.reloadTime.toFixed(1)}s`);
        html += sectionEnd();
    } else if (isThrusterType(type)) {
        html += sectionStart('Thrust');
        html += statRow('Force', def.thrustForce);
        if (def.sideThrust) {
            html += statRow('Side Thrust', def.sideThrust.force);
        }
        if (def.backThrust) {
            html += statRow('Back Thrust', def.backThrust.force);
        }
        html += sectionEnd();
        
        // Special behaviors
        if (def.rampUp || def.overheat) {
            html += sectionStart('Behavior');
            if (def.rampUp) {
                html += statRow('Ramp Up', `${def.rampUp.rampTime.toFixed(1)}s`);
                html += statRow('Start Power', `${Math.round(def.rampUp.startPercent * 100)}%`);
            }
            if (def.overheat) {
                html += statRow('Overheat', `${Math.round(def.overheat.threshold * 100)}% use`);
                html += statRow('Cooldown', `${def.overheat.cooldownTime.toFixed(1)}s`);
            }
            html += sectionEnd();
        }
    }
    
    return html;
}

/**
 * Creates a stat row HTML
 * @param {string} label - Stat label
 * @param {string|number} value - Stat value
 * @returns {string} HTML string
 */
function statRow(label, value) {
    return `<div class="stat-row"><span class="stat-label">${label}</span><span class="stat-value">${value}</span></div>`;
}

/**
 * Creates section start HTML with title
 * @param {string} title - Section title
 * @returns {string} HTML string
 */
function sectionStart(title) {
    return `<div class="stat-section"><div class="stat-section-title">${title}</div>`;
}

/**
 * Creates section end HTML
 * @returns {string} HTML string
 */
function sectionEnd() {
    return '</div>';
}

/**
 * Formats radians to degrees string
 * @param {number} radians - Angle in radians
 * @returns {string} Formatted degrees
 */
function formatDegrees(radians) {
    return `${Math.round(radians * 180 / Math.PI)}°`;
}

export { initStatsPanel, showStats, hideStats };
