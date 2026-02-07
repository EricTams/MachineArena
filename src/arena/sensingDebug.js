// Sensing debug visualization - displays sensing data for debugging ML training
// Toggle with V key

import * as THREE from 'three';
import { getArenaPhysicsScale } from './arenaPhysics.js';
import { ARENA_DIAGONAL } from './sensing.js';

// Debug state
let debugEnabled = false;
let sceneRef = null;
let debugGroup = null;
let debugPanel = null;

// Visual elements
let threatRadar = null;
let wallBars = null;
let enemyLines = [];
let blockerCircles = [];
let mouseAimLine = null;
let leadIndicator = null;
let mouseToEnemyLine = null;      // Enemy facing direction line
let enemyVelocityArrow = null;    // Enemy velocity direction line
let velocityProjection = null;    // Marker showing mouse projection onto velocity
let facingProjection = null;      // Marker showing mouse projection onto facing

// Colors
const COLORS = {
    threat: { low: 0x00ff00, high: 0xff0000 },
    enemy: 0xff4444,
    blocker: 0xff8800,
    wall: 0xaaaaaa,
    mouse: 0x00ffff,
    lead: 0xffff00
};

// ============================================================================
// Initialization / Cleanup
// ============================================================================

/**
 * Initializes the sensing debug visualization
 * @param {THREE.Scene} scene - The Three.js scene
 */
function initSensingDebug(scene) {
    sceneRef = scene;
    debugGroup = new THREE.Group();
    debugGroup.visible = false;
    scene.add(debugGroup);
    
    // Create threat radar
    createThreatRadar();
    
    // Create wall distance bars
    createWallBars();
    
    // Create mouse aim line
    createMouseAimLine();
    
    // Create debug panel
    createDebugPanel();
}

/**
 * Cleans up sensing debug visualization
 */
function cleanupSensingDebug() {
    if (debugGroup && sceneRef) {
        sceneRef.remove(debugGroup);
        debugGroup.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        });
    }
    
    // Remove debug panel
    if (debugPanel && debugPanel.parentNode) {
        debugPanel.parentNode.removeChild(debugPanel);
    }
    
    debugGroup = null;
    sceneRef = null;
    debugPanel = null;
    threatRadar = null;
    wallBars = null;
    enemyLines = [];
    blockerCircles = [];
    mouseAimLine = null;
    leadIndicator = null;
    mouseToEnemyLine = null;
    enemyVelocityArrow = null;
    velocityProjection = null;
    facingProjection = null;
}

// ============================================================================
// Toggle
// ============================================================================

/**
 * Toggles sensing debug visualization
 */
function toggleSensingDebug() {
    debugEnabled = !debugEnabled;
    if (debugGroup) {
        debugGroup.visible = debugEnabled;
    }
    if (debugPanel) {
        debugPanel.style.display = debugEnabled ? 'block' : 'none';
    }
    console.log(`Sensing debug: ${debugEnabled ? 'ON' : 'OFF'}`);
}

/**
 * Sets sensing debug enabled state
 */
function setSensingDebugEnabled(enabled) {
    debugEnabled = enabled;
    if (debugGroup) {
        debugGroup.visible = enabled;
    }
    if (debugPanel) {
        debugPanel.style.display = enabled ? 'block' : 'none';
    }
}

/**
 * Returns whether sensing debug is enabled
 */
function isSensingDebugEnabled() {
    return debugEnabled;
}

// ============================================================================
// Create Visual Elements
// ============================================================================

/**
 * Creates the 8-sector threat radar display
 */
function createThreatRadar() {
    threatRadar = new THREE.Group();
    
    const radarRadius = 3;
    const sectorAngle = Math.PI / 4;  // 45 degrees per sector
    
    // Create 8 sector meshes
    // Sector 0 = front (+Y in ship local space, which is angle π/2 in standard coords)
    // Going clockwise: 1=frontRight, 2=right, 3=backRight, 4=back, 5=backLeft, 6=left, 7=frontLeft
    for (let i = 0; i < 8; i++) {
        // Start at front (+Y = π/2) and go clockwise (decreasing angles)
        // Sector i is centered at π/2 - i * sectorAngle
        const centerAngle = Math.PI / 2 - i * sectorAngle;
        const startAngle = centerAngle - sectorAngle / 2;
        const geometry = new THREE.CircleGeometry(radarRadius, 8, startAngle, sectorAngle);
        const material = new THREE.MeshBasicMaterial({
            color: COLORS.threat.low,
            transparent: true,
            opacity: 0.3,
            side: THREE.DoubleSide
        });
        const sector = new THREE.Mesh(geometry, material);
        sector.position.z = 0.5;  // Above the ship
        threatRadar.add(sector);
    }
    
    // Add outline ring
    const ringGeometry = new THREE.RingGeometry(radarRadius - 0.1, radarRadius, 32);
    const ringMaterial = new THREE.MeshBasicMaterial({
        color: 0x666666,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.position.z = 0.51;
    threatRadar.add(ring);
    
    debugGroup.add(threatRadar);
}

/**
 * Creates wall distance bars
 */
function createWallBars() {
    wallBars = {
        front: createWallBar(),
        back: createWallBar(),
        left: createWallBar(),
        right: createWallBar()
    };
    
    debugGroup.add(wallBars.front);
    debugGroup.add(wallBars.back);
    debugGroup.add(wallBars.left);
    debugGroup.add(wallBars.right);
}

function createWallBar() {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array([0, 0, 0, 0, 0, 0]);
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    const material = new THREE.LineBasicMaterial({
        color: COLORS.wall,
        transparent: true,
        opacity: 0.6
    });
    
    return new THREE.Line(geometry, material);
}

/**
 * Creates mouse aim line and lead projection indicators
 * 
 * Visual elements:
 * - Cyan line: ship to mouse (where player is aiming)
 * - Yellow circle: at mouse position
 * - Green line: enemy velocity direction
 * - Green circle: ship-facing projection onto velocity (facingLeadVelocity)
 * - Red/pink line: enemy facing direction
 * - Red circle: ship-facing projection onto facing (facingLeadFacing)
 */
function createMouseAimLine() {
    // Main aim line (ship to mouse)
    const aimGeometry = new THREE.BufferGeometry();
    const aimPositions = new Float32Array([0, 0, 0, 0, 0, 0]);
    aimGeometry.setAttribute('position', new THREE.BufferAttribute(aimPositions, 3));
    
    mouseAimLine = new THREE.Line(aimGeometry, new THREE.LineBasicMaterial({
        color: COLORS.mouse,
        transparent: true,
        opacity: 0.8
    }));
    mouseAimLine.position.z = 0.3;
    debugGroup.add(mouseAimLine);
    
    // Lead indicator (small circle at mouse position)
    const leadGeometry = new THREE.RingGeometry(0.2, 0.3, 16);
    leadIndicator = new THREE.Mesh(leadGeometry, new THREE.MeshBasicMaterial({
        color: COLORS.lead,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide
    }));
    leadIndicator.position.z = 0.3;
    leadIndicator.visible = false;
    debugGroup.add(leadIndicator);
    
    // Enemy facing direction line (red/pink)
    const facingGeometry = new THREE.BufferGeometry();
    const facingPositions = new Float32Array([0, 0, 0, 0, 0, 0]);
    facingGeometry.setAttribute('position', new THREE.BufferAttribute(facingPositions, 3));
    
    mouseToEnemyLine = new THREE.Line(facingGeometry, new THREE.LineBasicMaterial({
        color: 0xff6666,  // Light red - facing direction
        transparent: true,
        opacity: 0.6
    }));
    mouseToEnemyLine.position.z = 0.3;
    mouseToEnemyLine.visible = false;
    debugGroup.add(mouseToEnemyLine);
    
    // Enemy velocity direction line (green)
    const velocityGeometry = new THREE.BufferGeometry();
    const velocityPositions = new Float32Array([0, 0, 0, 0, 0, 0]);
    velocityGeometry.setAttribute('position', new THREE.BufferAttribute(velocityPositions, 3));
    
    enemyVelocityArrow = new THREE.Line(velocityGeometry, new THREE.LineBasicMaterial({
        color: 0x66ff66,  // Light green - velocity direction
        transparent: true,
        opacity: 0.8
    }));
    enemyVelocityArrow.position.z = 0.3;
    enemyVelocityArrow.visible = false;
    debugGroup.add(enemyVelocityArrow);
    
    // Projection marker on velocity line (green circle)
    // Shows where the mouse projects onto enemy's velocity direction
    const velProjGeometry = new THREE.RingGeometry(0.3, 0.45, 16);
    velocityProjection = new THREE.Mesh(velProjGeometry, new THREE.MeshBasicMaterial({
        color: 0x66ff66,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide
    }));
    velocityProjection.position.z = 0.35;
    velocityProjection.visible = false;
    debugGroup.add(velocityProjection);
    
    // Projection marker on facing line (red circle)
    // Shows where the mouse projects onto enemy's facing direction
    const faceProjGeometry = new THREE.RingGeometry(0.3, 0.45, 16);
    facingProjection = new THREE.Mesh(faceProjGeometry, new THREE.MeshBasicMaterial({
        color: 0xff6666,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide
    }));
    facingProjection.position.z = 0.35;
    facingProjection.visible = false;
    debugGroup.add(facingProjection);
}

/**
 * Creates the HTML debug panel
 */
function createDebugPanel() {
    debugPanel = document.createElement('div');
    debugPanel.id = 'sensing-debug-panel';
    debugPanel.style.cssText = `
        position: fixed;
        top: 10px;
        right: 10px;
        background: rgba(0, 0, 0, 0.8);
        color: #0f0;
        font-family: monospace;
        font-size: 11px;
        padding: 10px;
        border-radius: 5px;
        border: 1px solid #0f0;
        max-width: 320px;
        display: none;
        z-index: 1000;
        white-space: pre;
        line-height: 1.4;
    `;
    document.body.appendChild(debugPanel);
}

// ============================================================================
// Update Visualization
// ============================================================================

/**
 * Updates the sensing debug visualization with current sensing state
 * @param {object} sensingState - The sensing state from computeSensingState
 * @param {object} ship - The player ship
 * @param {object} mousePosition - Current mouse position
 * @param {Array} allShips - All ships in arena (optional, for lead indicator)
 */
function updateSensingDebug(sensingState, ship, mousePosition, allShips) {
    if (!debugEnabled || !debugGroup || !sensingState) return;
    
    const scale = getArenaPhysicsScale();
    const shipX = ship.body.position.x / scale;
    const shipY = -ship.body.position.y / scale;
    // ROTATION ANGLE for vector transforms (NOT the atan2 direction - see sensing.js header)
    const shipAngle = -ship.body.angle;
    
    // Position debug group at ship
    debugGroup.position.set(shipX, shipY, 0);
    debugGroup.rotation.z = shipAngle;
    
    // Update threat radar
    updateThreatRadar(sensingState.threats);
    
    // Update wall bars
    updateWallBars(sensingState.walls);
    
    // Update mouse aim and lead indicator (in world space)
    updateMouseAim(shipX, shipY, shipAngle, mousePosition, sensingState.enemies, ship, allShips);
    
    // Update enemy lines
    updateEnemyIndicators(shipX, shipY, shipAngle, sensingState.enemies);
    
    // Update blocker circles
    updateBlockerIndicators(shipX, shipY, shipAngle, sensingState.blockers);
    
    // Update debug panel text
    updateDebugPanel(sensingState);
}

/**
 * Updates threat radar colors based on threat levels
 */
function updateThreatRadar(threats) {
    if (!threatRadar) return;
    
    const threatArray = [
        threats.front,
        threats.frontRight,
        threats.right,
        threats.backRight,
        threats.back,
        threats.backLeft,
        threats.left,
        threats.frontLeft
    ];
    
    for (let i = 0; i < 8; i++) {
        const sector = threatRadar.children[i];
        if (sector && sector.material) {
            const threat = threatArray[i];
            // Lerp color from green to red based on threat
            const color = new THREE.Color();
            color.setRGB(threat, 1 - threat, 0);
            sector.material.color = color;
            sector.material.opacity = 0.2 + threat * 0.6;
        }
    }
}

/**
 * Updates wall distance bars
 */
function updateWallBars(walls) {
    if (!wallBars) return;
    
    const maxLength = 30;  // Max bar length in world units
    
    // Front (ship +Y)
    updateBarGeometry(wallBars.front, 0, 1.5, 0, walls.front * maxLength + 1.5);
    // Back (ship -Y)
    updateBarGeometry(wallBars.back, 0, -1.5, 0, -(walls.back * maxLength + 1.5));
    // Left (ship -X)
    updateBarGeometry(wallBars.left, -1.5, 0, -(walls.left * maxLength + 1.5), 0);
    // Right (ship +X)
    updateBarGeometry(wallBars.right, 1.5, 0, walls.right * maxLength + 1.5, 0);
}

function updateBarGeometry(line, startX, startY, endX, endY) {
    const positions = line.geometry.attributes.position.array;
    positions[0] = startX;
    positions[1] = startY;
    positions[2] = 0.2;
    positions[3] = endX;
    positions[4] = endY;
    positions[5] = 0.2;
    line.geometry.attributes.position.needsUpdate = true;
}

/**
 * Updates mouse aim line and lead projection indicators
 * 
 * Visualizes the lead values by showing projections onto enemy vectors:
 * - Cyan line: ship to mouse (where player is aiming)
 * - Yellow circle: at mouse position
 * - Green line: enemy velocity direction
 * - Green circle ON the green line: ship-facing projection onto velocity (facingLeadVelocity)
 * - Red line: enemy facing direction  
 * - Red circle ON the red line: ship-facing projection onto facing (facingLeadFacing)
 */
function updateMouseAim(shipX, shipY, shipAngle, mousePosition, enemies, playerShip, allShips) {
    if (!mouseAimLine || !mousePosition) {
        if (mouseAimLine) mouseAimLine.visible = false;
        if (leadIndicator) leadIndicator.visible = false;
        if (mouseToEnemyLine) mouseToEnemyLine.visible = false;
        if (enemyVelocityArrow) enemyVelocityArrow.visible = false;
        if (velocityProjection) velocityProjection.visible = false;
        if (facingProjection) facingProjection.visible = false;
        return;
    }
    
    mouseAimLine.visible = true;
    
    // Update aim line (ship to mouse)
    // Convert world offset to group-local coordinates
    const cosAngle = Math.cos(-shipAngle);
    const sinAngle = Math.sin(-shipAngle);
    const worldDx = mousePosition.x - shipX;
    const worldDy = mousePosition.y - shipY;
    const localDx = worldDx * cosAngle - worldDy * sinAngle;
    const localDy = worldDx * sinAngle + worldDy * cosAngle;
    
    const positions = mouseAimLine.geometry.attributes.position.array;
    positions[0] = 0;  // Start at ship (group origin)
    positions[1] = 0;
    positions[2] = 0.3;
    positions[3] = localDx;
    positions[4] = localDy;
    positions[5] = 0.3;
    mouseAimLine.geometry.attributes.position.needsUpdate = true;
    
    // Find nearest enemy for lead indicator visualization
    const nearestEnemy = findNearestEnemy(playerShip, allShips);
    const enemy0 = enemies && enemies[0];
    
    if (enemy0 && enemy0.present === 1 && nearestEnemy) {
        const scale = getArenaPhysicsScale();
        const enemyX = nearestEnemy.body.position.x / scale;
        const enemyY = -nearestEnemy.body.position.y / scale;
        const enemyVelX = nearestEnemy.body.velocity.x / scale;
        const enemyVelY = -nearestEnemy.body.velocity.y / scale;
        
        // Enemy facing direction (convert from Matter.js angle)
        // IMPORTANT: This matches sensing.js: enemyForward = -body.angle + PI/2
        // In atan2 convention: cos/sin give the direction vector
        const enemyAngle = -nearestEnemy.body.angle;
        const enemyForward = enemyAngle + Math.PI / 2;
        const facingDirX = Math.cos(enemyForward);
        const facingDirY = Math.sin(enemyForward);
        
        // World-space offsets from ship, converted to group-local coordinates
        // (reusing cosAngle/sinAngle from above)
        const worldOffsetEnemyX = enemyX - shipX;
        const worldOffsetEnemyY = enemyY - shipY;
        const localEnemyX = worldOffsetEnemyX * cosAngle - worldOffsetEnemyY * sinAngle;
        const localEnemyY = worldOffsetEnemyX * sinAngle + worldOffsetEnemyY * cosAngle;
        
        // Rotate the direction vectors to group-local space
        const localFacingDirX = facingDirX * cosAngle - facingDirY * sinAngle;
        const localFacingDirY = facingDirX * sinAngle + facingDirY * cosAngle;
        
        // Place yellow circle at mouse position (reuse localDx/localDy computed above)
        leadIndicator.visible = true;
        leadIndicator.position.x = localDx;
        leadIndicator.position.y = localDy;
        leadIndicator.material.color.setHex(COLORS.lead);
        
        // The lead values are normalized by /10, so multiply by 10 to get world distance
        const LEAD_SCALE = 10;  // Matches normalization in sensing.js
        const LINE_LENGTH = 12; // Visual line length
        
        // Green line: enemy velocity direction
        const speed = Math.sqrt(enemyVelX * enemyVelX + enemyVelY * enemyVelY);
        if (speed > 0.1) {  // Lower threshold to show even slow movement
            const velDirX = enemyVelX / speed;
            const velDirY = enemyVelY / speed;
            
            // Rotate velocity direction to local space
            const localVelDirX = velDirX * cosAngle - velDirY * sinAngle;
            const localVelDirY = velDirX * sinAngle + velDirY * cosAngle;
            
            enemyVelocityArrow.visible = true;
            const velPositions = enemyVelocityArrow.geometry.attributes.position.array;
            velPositions[0] = localEnemyX - localVelDirX * LINE_LENGTH * 0.3;
            velPositions[1] = localEnemyY - localVelDirY * LINE_LENGTH * 0.3;
            velPositions[2] = 0.3;
            velPositions[3] = localEnemyX + localVelDirX * LINE_LENGTH;
            velPositions[4] = localEnemyY + localVelDirY * LINE_LENGTH;
            velPositions[5] = 0.3;
            enemyVelocityArrow.geometry.attributes.position.needsUpdate = true;
            
            // Green circle: projection onto velocity line
            const velProjDist = enemy0.facingLeadVelocity * LEAD_SCALE;
            velocityProjection.visible = true;
            velocityProjection.position.x = localEnemyX + localVelDirX * velProjDist;
            velocityProjection.position.y = localEnemyY + localVelDirY * velProjDist;
        } else {
            enemyVelocityArrow.visible = false;
            velocityProjection.visible = false;
        }
        
        // Red line: enemy facing direction
        mouseToEnemyLine.visible = true;
        const facePositions = mouseToEnemyLine.geometry.attributes.position.array;
        facePositions[0] = localEnemyX - localFacingDirX * LINE_LENGTH * 0.3;
        facePositions[1] = localEnemyY - localFacingDirY * LINE_LENGTH * 0.3;
        facePositions[2] = 0.3;
        facePositions[3] = localEnemyX + localFacingDirX * LINE_LENGTH;
        facePositions[4] = localEnemyY + localFacingDirY * LINE_LENGTH;
        facePositions[5] = 0.3;
        mouseToEnemyLine.geometry.attributes.position.needsUpdate = true;
        
        // Red circle: projection onto facing line
        const faceProjDist = enemy0.facingLeadFacing * LEAD_SCALE;
        facingProjection.visible = true;
        facingProjection.position.x = localEnemyX + localFacingDirX * faceProjDist;
        facingProjection.position.y = localEnemyY + localFacingDirY * faceProjDist;
    } else {
        leadIndicator.visible = false;
        mouseToEnemyLine.visible = false;
        enemyVelocityArrow.visible = false;
        velocityProjection.visible = false;
        facingProjection.visible = false;
    }
}

/**
 * Finds the nearest enemy ship to the player
 */
function findNearestEnemy(playerShip, allShips) {
    if (!allShips || !playerShip) return null;
    
    const scale = getArenaPhysicsScale();
    const playerX = playerShip.body.position.x / scale;
    const playerY = -playerShip.body.position.y / scale;
    
    let nearest = null;
    let nearestDist = Infinity;
    
    for (const ship of allShips) {
        if (ship === playerShip || ship.destroyed || !ship.body) continue;
        if (ship.team === playerShip.team) continue;
        
        const enemyX = ship.body.position.x / scale;
        const enemyY = -ship.body.position.y / scale;
        const dist = Math.sqrt((enemyX - playerX) ** 2 + (enemyY - playerY) ** 2);
        
        if (dist < nearestDist) {
            nearestDist = dist;
            nearest = ship;
        }
    }
    
    return nearest;
}

/**
 * Updates enemy indicator lines
 */
function updateEnemyIndicators(shipX, shipY, shipAngle, enemies) {
    // Remove old enemy lines
    for (const line of enemyLines) {
        debugGroup.remove(line);
        if (line.geometry) line.geometry.dispose();
        if (line.material) line.material.dispose();
    }
    enemyLines = [];
    
    if (!enemies) return;
    
    for (let i = 0; i < enemies.length; i++) {
        const enemy = enemies[i];
        if (enemy.present !== 1) continue;
        
        // Calculate enemy position from sensing data
        // angle is relative to ship forward, distance is normalized
        const worldAngle = enemy.angleFromForward * Math.PI + shipAngle + Math.PI / 2;
        const worldDist = enemy.distance * ARENA_DIAGONAL;
        
        const enemyX = Math.cos(worldAngle) * worldDist;
        const enemyY = Math.sin(worldAngle) * worldDist;
        
        // Create line from ship to enemy (in group-local coords, but we need world-relative)
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array([
            0, 0, 0.25,
            enemyX, enemyY, 0.25
        ]);
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        
        // Color based on distance (closer = brighter red)
        const brightness = 1 - enemy.distance * 0.5;
        const color = new THREE.Color(brightness, 0.2, 0.2);
        
        const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.8
        }));
        
        // Counter-rotate to appear in world space
        line.rotation.z = -shipAngle;
        
        debugGroup.add(line);
        enemyLines.push(line);
    }
}

/**
 * Updates blocker indicator circles
 */
function updateBlockerIndicators(shipX, shipY, shipAngle, blockers) {
    // Remove old blocker circles
    for (const circle of blockerCircles) {
        debugGroup.remove(circle);
        if (circle.geometry) circle.geometry.dispose();
        if (circle.material) circle.material.dispose();
    }
    blockerCircles = [];
    
    if (!blockers) return;
    
    for (const blocker of blockers) {
        if (blocker.present !== 1) continue;
        
        // Calculate blocker position from sensing data
        const worldAngle = blocker.angleFromForward * Math.PI + shipAngle + Math.PI / 2;
        const worldDist = blocker.distance * ARENA_DIAGONAL;
        
        const blockerX = Math.cos(worldAngle) * worldDist;
        const blockerY = Math.sin(worldAngle) * worldDist;
        
        // Create ring at blocker position
        const radius = blocker.radius * 10;  // Denormalize (MAX_BLOCKER_RADIUS = 10)
        const geometry = new THREE.RingGeometry(radius - 0.2, radius + 0.2, 24);
        const material = new THREE.MeshBasicMaterial({
            color: COLORS.blocker,
            transparent: true,
            opacity: 0.6,
            side: THREE.DoubleSide
        });
        
        const ring = new THREE.Mesh(geometry, material);
        ring.position.set(blockerX, blockerY, 0.2);
        ring.rotation.z = -shipAngle;  // Counter-rotate for world coords
        
        debugGroup.add(ring);
        blockerCircles.push(ring);
    }
}

/**
 * Updates the HTML debug panel with sensing values
 */
function updateDebugPanel(state) {
    if (!debugPanel) return;
    
    const fmt = (v) => v.toFixed(2).padStart(6);
    const fmtShort = (v) => v.toFixed(2);
    
    let text = '=== SENSING DEBUG ===\n';
    
    // Self
    text += `Self: vel(${fmtShort(state.self.velocityForward)}, ${fmtShort(state.self.velocityRight)}) `;
    text += `ang(${fmtShort(state.self.angularVelocity)}) `;
    text += `pos(${fmtShort(state.self.posX)}, ${fmtShort(state.self.posY)})\n`;
    
    // Walls
    text += `Walls: F(${fmtShort(state.walls.front)}) B(${fmtShort(state.walls.back)}) `;
    text += `L(${fmtShort(state.walls.left)}) R(${fmtShort(state.walls.right)})\n`;
    
    // Threats
    const threats = [
        state.threats.front, state.threats.frontRight,
        state.threats.right, state.threats.backRight,
        state.threats.back, state.threats.backLeft,
        state.threats.left, state.threats.frontLeft
    ];
    text += `Threats: [${threats.map(t => fmtShort(t)).join(' ')}]\n`;
    
    // Enemies (only present ones)
    for (let i = 0; i < state.enemies.length; i++) {
        const e = state.enemies[i];
        if (e.present !== 1) continue;
        text += `Enemy ${i}: dist(${fmtShort(e.distance)}) `;
        text += `angle(${fmtShort(e.angleFromForward)}) `;
        text += `faceOff(${fmtShort(e.facingOffsetToEnemy)}) `;
        text += `fLeadVel(${fmtShort(e.facingLeadVelocity)}) fLeadFace(${fmtShort(e.facingLeadFacing)})\n`;
    }
    
    // Blockers (only present ones)
    for (let i = 0; i < state.blockers.length; i++) {
        const b = state.blockers[i];
        if (b.present !== 1) continue;
        text += `Blocker ${i}: dist(${fmtShort(b.distance)}) `;
        text += `angle(${fmtShort(b.angleFromForward)}) `;
        text += `r(${fmtShort(b.radius)})\n`;
    }
    
    // Hazards (only present ones)
    for (let i = 0; i < state.hazards.length; i++) {
        const h = state.hazards[i];
        if (h.present !== 1) continue;
        text += `Hazard ${i}: dist(${fmtShort(h.distance)}) `;
        text += `angle(${fmtShort(h.angleFromForward)})\n`;
    }
    
    debugPanel.textContent = text;
}

// ============================================================================
// Exports
// ============================================================================

export {
    initSensingDebug,
    cleanupSensingDebug,
    updateSensingDebug,
    toggleSensingDebug,
    setSensingDebugEnabled,
    isSensingDebugEnabled
};
