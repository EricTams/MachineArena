// Stats Panel - displays stats for hovered/selected pieces in the designer

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
    } else if (piece.category === 'equipment') {
        html += buildEquipmentStats(piece.type, def);
    }
    // Blocks only have basic stats (size/mass)
    
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
 * Builds stats section for equipment
 * @param {string} type - Equipment type
 * @param {object} def - Equipment definition
 * @returns {string} HTML string
 */
function buildEquipmentStats(type, def) {
    let html = '';
    
    if (type === 'cannon') {
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
    } else if (type === 'thruster') {
        html += sectionStart('Thrust');
        html += statRow('Force', def.thrustForce);
        html += sectionEnd();
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
