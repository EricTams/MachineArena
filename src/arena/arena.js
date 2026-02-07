// Arena mode - test arena for flying ships

import * as THREE from 'three';
import { createArenaPhysics, stepArenaPhysics, clearArenaPhysics, getArenaDimensions, removeFromArena } from './arenaPhysics.js';
import { createArenaShip, syncShipMeshToBody, destroyArenaShip } from './arenaShip.js';
import { setupArenaInput, removeArenaInput, getInputState, clearFireRequest } from './arenaInput.js';
import { initThrustDebug, updateThrustDebug, cleanupThrustDebug, setThrustDebugEnabled } from './thrustDebug.js';
import { initTargetIndicator, setTargetPosition, updateTargetIndicator, cleanupTargetIndicator } from './targetIndicator.js';
import { initWeaponSystem, cleanupWeaponSystem, updateWeaponSystem, checkProjectileCollisions, getProjectiles } from './weaponSystem.js';
import { setDebugVisible } from '../debug.js';
import { applyInputToShip, createPlayerController, createController } from './controllers.js';
import { getLevel } from './levels.js';
import { initArenaControlsDisplay, updateArenaControlsDisplay, cleanupArenaControlsDisplay } from './arenaControlsDisplay.js';
import { computeSensingState } from './sensing.js';
import { initSensingDebug, cleanupSensingDebug, updateSensingDebug } from './sensingDebug.js';
import { isRecording, stopRecording, recordFrame } from '../ml/recording.js';
import { initMlPanel, cleanupMlPanel } from '../ml/mlPanel.js';
import { createMlController } from '../ml/mlController.js';
import { resolveArenaType } from './arenaTypes.js';
import { initHazards, updateHazards, checkHazardCollisions, cleanupHazards, getHazardSensingData } from './hazards.js';

// Delay before showing fight outcome (let destruction sink in)
const OUTCOME_DELAY_MS = 1500;

// Arena state
const arenaState = {
    active: false,
    ships: [],           // All ships in the arena
    playerShip: null,    // Reference to the player's ship
    currentLevel: null,  // Current level definition
    scene: null,
    camera: null,
    renderer: null,
    arenaVisuals: null,  // Group for arena-specific visuals (walls, background)
    lastTime: 0,
    hazards: [],         // Moving hazards (future use)
    blockers: [],        // Static circular obstacles (future use)
    sensingState: null,  // Current sensing state for player ship
    onFightWon: null,    // Callback when player wins (all enemies destroyed)
    onFightLost: null,   // Callback when player loses (player core destroyed)
    outcomeResolved: false  // Prevents double-firing outcome callbacks
};

// Store original camera settings to restore on exit
let originalCameraSettings = null;

// Store original scene background to restore on exit
let originalBackground = null;

// Current arena config (from arenaTypes.js) for the active session
let currentArenaConfig = null;

// AI control state
let savedPlayerController = null;  // Original player controller (saved when switching to AI)
let activeMlController = null;     // Active ML controller instance (null when player-controlled)

/**
 * Enters arena mode with a specific level
 * @param {number} levelId - Level ID to load
 * @param {Array} playerGridPieces - Player's ship pieces from the design grid
 * @param {THREE.Scene} scene - The Three.js scene
 * @param {THREE.Camera} camera - The camera
 * @param {THREE.Renderer} renderer - The renderer
 * @param {function} screenToWorld - Screen to world conversion function
 * @param {function} getPresetPieces - Function to get grid pieces from a preset name
 * @param {string} arenaType - Arena type key ('base', 'saw', 'energy', or 'random')
 */
function enterArenaLevel(levelId, playerGridPieces, scene, camera, renderer, screenToWorld, getPresetPieces, arenaType = 'random') {
    if (arenaState.active) {
        console.warn('Already in arena mode');
        return false;
    }
    
    const level = getLevel(levelId);
    if (!level) {
        console.warn(`Level ${levelId} not found`);
        return false;
    }
    
    if (!playerGridPieces || playerGridPieces.length === 0) {
        console.warn('No pieces on grid to test');
        return false;
    }
    
    // Check for core piece in player ship
    const hasCore = playerGridPieces.some(p => p.category === 'CORE' || p.type === 'core');
    if (!hasCore) {
        console.warn('Ship needs a core piece to fly');
        return false;
    }
    
    const { config } = resolveArenaType(arenaType);
    currentArenaConfig = config;
    
    console.log(`Entering arena - ${config.name} - ${level.name}...`);
    
    // Store references
    arenaState.scene = scene;
    arenaState.camera = camera;
    arenaState.renderer = renderer;
    arenaState.currentLevel = level;
    arenaState.ships = [];
    
    // Save original camera settings
    originalCameraSettings = {
        left: camera.left,
        right: camera.right,
        top: camera.top,
        bottom: camera.bottom,
        position: camera.position.clone()
    };
    
    // Initialize arena physics
    createArenaPhysics();
    
    // Create arena visuals (walls, background) with theme
    createArenaVisuals(scene, config.theme);
    
    // Initialize hazards
    initHazards(scene, config);
    
    // Create player ship with PlayerController
    const playerController = createPlayerController(getInputState);
    arenaState.playerShip = createArenaShip(playerGridPieces, {
        team: 1,
        spawnX: level.playerSpawn.x,
        spawnY: level.playerSpawn.y,
        controller: playerController
    });
    
    if (!arenaState.playerShip) {
        console.error('Failed to create player ship');
        exitArena();
        return false;
    }
    
    arenaState.ships.push(arenaState.playerShip);
    scene.add(arenaState.playerShip.mesh);
    
    // Create enemy ships from level definition
    for (const enemyDef of level.enemies) {
        const enemyPieces = getPresetPieces(enemyDef.preset);
        if (!enemyPieces || enemyPieces.length === 0) {
            console.warn(`Failed to get pieces for enemy preset: ${enemyDef.preset}`);
            continue;
        }
        
        const enemyController = createController(enemyDef.controller);
        const enemyShip = createArenaShip(enemyPieces, {
            team: 2,
            spawnX: enemyDef.spawnX,
            spawnY: enemyDef.spawnY,
            controller: enemyController
        });
        
        if (enemyShip) {
            arenaState.ships.push(enemyShip);
            scene.add(enemyShip.mesh);
        }
    }
    
    // Setup arena camera (zoom out to see arena)
    setupArenaCamera(camera);
    
    // Initialize thrust debug visualization
    initThrustDebug(scene);
    setThrustDebugEnabled(true); // Start with debug on
    
    // Initialize target facing indicator
    initTargetIndicator(scene);
    
    // Initialize weapon system
    initWeaponSystem(scene);
    
    // Initialize controls display
    initArenaControlsDisplay();
    
    // Initialize sensing debug visualization
    initSensingDebug(scene);
    
    // Initialize ML panel
    initMlPanel();
    
    // Setup input handling (for player input events)
    setupArenaInput(arenaState, screenToWorld, renderer.domElement);
    
    // Hide design mode debug visualization
    setDebugVisible(false);
    
    arenaState.active = true;
    arenaState.lastTime = performance.now();
    
    // Show arena name overlay
    showArenaNameOverlay(config.name);
    
    console.log(`Arena mode active - ${config.name}. WASD to move, mouse to aim. G for debug, V for sensing, M for ML panel, T to exit.`);
    
    return true;
}

/**
 * Enters arena mode with the current grid pieces (free flight / test mode)
 * @param {Array} gridPieces - Pieces from the design grid
 * @param {THREE.Scene} scene - The Three.js scene
 * @param {THREE.Camera} camera - The camera
 * @param {THREE.Renderer} renderer - The renderer
 * @param {function} screenToWorld - Screen to world conversion function
 * @param {string} arenaType - Arena type key ('base', 'saw', 'energy', or 'random')
 */
function enterArena(gridPieces, scene, camera, renderer, screenToWorld, arenaType = 'base') {
    if (arenaState.active) {
        console.warn('Already in arena mode');
        return false;
    }
    
    if (!gridPieces || gridPieces.length === 0) {
        console.warn('No pieces on grid to test');
        return false;
    }
    
    // Check for core piece
    const hasCore = gridPieces.some(p => p.category === 'CORE' || p.type === 'core');
    if (!hasCore) {
        console.warn('Ship needs a core piece to fly');
        return false;
    }
    
    const { config } = resolveArenaType(arenaType);
    currentArenaConfig = config;
    
    console.log(`Entering arena - ${config.name}...`);
    
    // Store references
    arenaState.scene = scene;
    arenaState.camera = camera;
    arenaState.renderer = renderer;
    arenaState.currentLevel = null;
    arenaState.ships = [];
    
    // Save original camera settings
    originalCameraSettings = {
        left: camera.left,
        right: camera.right,
        top: camera.top,
        bottom: camera.bottom,
        position: camera.position.clone()
    };
    
    // Initialize arena physics
    createArenaPhysics();
    
    // Create arena visuals (walls, background) with theme
    createArenaVisuals(scene, config.theme);
    
    // Initialize hazards
    initHazards(scene, config);
    
    // Create player ship with PlayerController at center
    const playerController = createPlayerController(getInputState);
    arenaState.playerShip = createArenaShip(gridPieces, {
        team: 1,
        spawnX: 0,
        spawnY: 0,
        controller: playerController
    });
    
    if (!arenaState.playerShip) {
        console.error('Failed to create arena ship');
        exitArena();
        return false;
    }
    
    arenaState.ships.push(arenaState.playerShip);
    scene.add(arenaState.playerShip.mesh);
    
    // Setup arena camera (zoom out to see arena)
    setupArenaCamera(camera);
    
    // Initialize thrust debug visualization
    initThrustDebug(scene);
    setThrustDebugEnabled(true); // Start with debug on
    
    // Initialize target facing indicator
    initTargetIndicator(scene);
    
    // Initialize weapon system
    initWeaponSystem(scene);
    
    // Initialize controls display
    initArenaControlsDisplay();
    
    // Initialize sensing debug visualization
    initSensingDebug(scene);
    
    // Initialize ML panel
    initMlPanel();
    
    // Setup input handling
    setupArenaInput(arenaState, screenToWorld, renderer.domElement);
    
    // Hide design mode debug visualization
    setDebugVisible(false);
    
    arenaState.active = true;
    arenaState.lastTime = performance.now();
    
    // Show arena name overlay
    showArenaNameOverlay(config.name);
    
    console.log(`Arena mode active - ${config.name}. WASD to move, mouse to aim. G for debug, V for sensing, M for ML panel, T to exit.`);
    
    return true;
}

/**
 * Exits arena mode and returns to design mode
 */
function exitArena() {
    if (!arenaState.active && !arenaState.scene) {
        return;
    }
    
    console.log('Exiting arena mode...');
    
    // Restore player control if AI was active
    if (activeMlController) switchToPlayerControl();
    
    // Stop ML recording if active
    if (isRecording()) stopRecording();
    
    // Hide ML panel
    cleanupMlPanel();
    
    // Remove input handlers
    removeArenaInput();
    
    // Clean up hazards, thrust debug, sensing debug, weapon system, and controls display
    if (arenaState.scene) {
        cleanupHazards();
        cleanupThrustDebug(arenaState.scene);
        cleanupTargetIndicator(arenaState.scene);
        cleanupSensingDebug();
        cleanupWeaponSystem();
    }
    cleanupArenaControlsDisplay();
    removeArenaNameOverlay();
    
    // Destroy all ships
    for (const ship of arenaState.ships) {
        destroyArenaShip(ship, arenaState.scene);
    }
    arenaState.ships = [];
    arenaState.playerShip = null;
    
    // Remove arena visuals
    if (arenaState.arenaVisuals && arenaState.scene) {
        arenaState.scene.remove(arenaState.arenaVisuals);
        arenaState.arenaVisuals.traverse((child) => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        });
        arenaState.arenaVisuals = null;
    }
    
    // Clear arena physics
    clearArenaPhysics();
    
    // Restore camera
    if (originalCameraSettings && arenaState.camera) {
        arenaState.camera.left = originalCameraSettings.left;
        arenaState.camera.right = originalCameraSettings.right;
        arenaState.camera.top = originalCameraSettings.top;
        arenaState.camera.bottom = originalCameraSettings.bottom;
        arenaState.camera.position.copy(originalCameraSettings.position);
        arenaState.camera.updateProjectionMatrix();
    }
    
    // Restore scene background
    if (originalBackground && arenaState.scene) {
        arenaState.scene.background = originalBackground;
    }
    originalBackground = null;
    currentArenaConfig = null;
    
    arenaState.active = false;
    arenaState.currentLevel = null;
    arenaState.scene = null;
    arenaState.camera = null;
    arenaState.renderer = null;
    arenaState.hazards = [];
    arenaState.blockers = [];
    arenaState.sensingState = null;
    arenaState.onFightWon = null;
    arenaState.onFightLost = null;
    arenaState.outcomeResolved = false;
    
    // Restore design mode debug visibility
    setDebugVisible(true);
    
    console.log('Returned to design mode.');
}

/**
 * Updates arena simulation (called from game loop)
 * @param {number} deltaTime - Time since last frame in seconds
 */
function updateArena(deltaTime) {
    if (!arenaState.active || arenaState.ships.length === 0) return;
    
    let allActiveThrusts = [];
    let playerInput = null;
    const inputState = getInputState();
    const mousePos = inputState.mousePosition;
    
    // Update all ships
    for (const ship of arenaState.ships) {
        if (!ship || !ship.body || ship.destroyed) continue;
        
        // Get input from ship's controller
        if (ship.controller) {
            const input = ship.controller.getInput(ship, deltaTime);
            
            // Capture player input for ML recording
            if (ship === arenaState.playerShip) playerInput = input;
            
            // Apply input to ship physics
            const thrusts = applyInputToShip(ship, input);
            allActiveThrusts.push(...thrusts);
            
            // Post-update for controller (clear one-shot inputs)
            ship.controller.postUpdate();
        }
        
        // Update weapon system for this ship
        let aimTarget = null;
        if (ship === arenaState.playerShip) {
            aimTarget = activeMlController
                ? activeMlController.getLastAimTarget()
                : mousePos;
        } else if (ship.controller && ship.controller.getLastAimTarget) {
            aimTarget = ship.controller.getLastAimTarget();
        }
        updateWeaponSystem(ship, deltaTime, aimTarget);
        
        // Sync ship mesh to physics body
        syncShipMeshToBody(ship);
    }
    
    // Clear fire request after processing (for player controller)
    clearFireRequest();
    
    // Step physics
    stepArenaPhysics(deltaTime);
    
    // Update hazards (movement, animation) and expose positions to sensing
    updateHazards(deltaTime);
    arenaState.hazards = getHazardSensingData();
    
    // Check projectile collisions and apply damage
    const destroyedShips = checkProjectileCollisions(arenaState.ships);
    
    // Check hazard collisions and apply damage + impulse
    const hazardDestroyed = checkHazardCollisions(arenaState.ships);
    for (const ship of hazardDestroyed) {
        if (!destroyedShips.includes(ship)) destroyedShips.push(ship);
    }
    
    // Handle destroyed ships
    for (const ship of destroyedShips) {
        handleShipDestroyed(ship);
    }
    
    // Update thrust debug visualization (player ship only for now)
    updateThrustDebug(allActiveThrusts);
    
    // Update target facing indicator
    // AI mode: always show the predicted aim target
    // Player mode: show only while right-click is held
    if (activeMlController) {
        setTargetPosition(activeMlController.getLastAimTarget());
    } else if (inputState.rightMouseDown && mousePos) {
        setTargetPosition(mousePos);
    } else {
        setTargetPosition(null);
    }
    updateTargetIndicator(deltaTime);
    
    // Compute sensing state for player ship (for ML training data)
    if (arenaState.playerShip && !arenaState.playerShip.destroyed) {
        const projectiles = getProjectiles();
        arenaState.sensingState = computeSensingState(
            arenaState.playerShip,
            arenaState.ships,
            arenaState.hazards,
            arenaState.blockers,
            projectiles
        );
        
        // Update sensing debug visualization (pass ships for lead indicator)
        updateSensingDebug(arenaState.sensingState, arenaState.playerShip, mousePos, arenaState.ships);
        
        // Feed sensing to ML controller for next frame's inference
        if (activeMlController) {
            activeMlController.setSensingState(arenaState.sensingState);
        }
        
        // Record frame for ML training (sense + action from this frame)
        if (isRecording() && playerInput) {
            recordFrame(arenaState.sensingState, playerInput, arenaState.playerShip, mousePos);
        }
    }

    // Compute sensing for non-player ML-controlled ships (opponents)
    const projectilesForOpponents = getProjectiles();
    for (const ship of arenaState.ships) {
        if (!ship || ship === arenaState.playerShip || ship.destroyed) continue;
        if (ship.controller && ship.controller.type === 'ml' && ship.controller.setSensingState) {
            const opponentSensing = computeSensingState(
                ship, arenaState.ships,
                arenaState.hazards, arenaState.blockers,
                projectilesForOpponents
            );
            ship.controller.setSensingState(opponentSensing);
        }
    }
    
    // Update controls display (show AI's decisions when AI-controlled)
    if (activeMlController && playerInput) {
        updateArenaControlsDisplay({
            forward: playerInput.forward,
            back: playerInput.back,
            left: playerInput.left,
            right: playerInput.right,
            turnLeft: playerInput.turnLeft,
            turnRight: playerInput.turnRight,
            fireRequested: playerInput.fire,
            rightMouseDown: !!playerInput.turnToward,
            shiftHeld: playerInput.fastTurn
        });
    } else {
        updateArenaControlsDisplay(inputState);
    }
}

/**
 * Handles a ship being destroyed (core destroyed).
 * Checks for win/loss conditions and fires outcome callbacks.
 * @param {object} ship - The destroyed ship
 */
function handleShipDestroyed(ship) {
    if (!ship) return;
    
    console.log(`Ship destroyed! Team ${ship.team}`);
    
    // Remove the ship's physics body from the arena
    if (ship.body) {
        removeFromArena(ship.body);
        ship.body = null;
    }
    
    // Hide the ship mesh
    if (ship.mesh) {
        ship.mesh.visible = false;
    }

    if (arenaState.outcomeResolved) return;

    // Check if player was destroyed -> LOSS
    if (ship === arenaState.playerShip) {
        console.log('Player ship destroyed!');
        resolveFightOutcome('lost');
        return;
    }
    
    // Check if all enemies are destroyed -> WIN
    const enemiesAlive = arenaState.ships.some(
        s => s !== arenaState.playerShip && !s.destroyed
    );
    if (!enemiesAlive) {
        console.log('All enemies destroyed!');
        resolveFightOutcome('won');
    }
}

/**
 * Fires the appropriate outcome callback after a delay.
 * @param {'won'|'lost'} outcome
 */
function resolveFightOutcome(outcome) {
    if (arenaState.outcomeResolved) return;
    arenaState.outcomeResolved = true;

    const callback = outcome === 'won'
        ? arenaState.onFightWon
        : arenaState.onFightLost;

    if (!callback) {
        console.log(`Fight ${outcome} (no callback set)`);
        return;
    }

    // Delay so the player sees the destruction before the overlay
    setTimeout(() => callback(), OUTCOME_DELAY_MS);
}

/**
 * Sets outcome callbacks for the current arena session.
 * @param {function|null} onWon - Called when player wins
 * @param {function|null} onLost - Called when player loses
 */
function setOutcomeCallbacks(onWon, onLost) {
    arenaState.onFightWon = onWon;
    arenaState.onFightLost = onLost;
    arenaState.outcomeResolved = false;
}

/**
 * Creates arena visual elements (walls, floor pattern) themed by arena config
 * @param {THREE.Scene} scene - The scene
 * @param {object} theme - Theme colors from arenaTypes config
 */
function createArenaVisuals(scene, theme) {
    arenaState.arenaVisuals = new THREE.Group();
    
    const { width, height } = getArenaDimensions();
    const halfWidth = width / 2;
    const halfHeight = height / 2;
    
    // Apply arena background color
    originalBackground = scene.background ? scene.background.clone() : null;
    scene.background = new THREE.Color(theme.backgroundColor);
    
    // Wall material
    const wallMaterial = new THREE.MeshStandardMaterial({
        color: theme.wallColor,
        roughness: 0.7,
        metalness: 0.3
    });
    
    const wallDepth = 0.5;
    const wallThickness = 2;
    
    // Top wall
    const topGeom = new THREE.BoxGeometry(width + wallThickness * 2, wallThickness, wallDepth);
    const topWall = new THREE.Mesh(topGeom, wallMaterial);
    topWall.position.set(0, halfHeight + wallThickness / 2, 0);
    arenaState.arenaVisuals.add(topWall);
    
    // Bottom wall
    const bottomWall = new THREE.Mesh(topGeom, wallMaterial);
    bottomWall.position.set(0, -halfHeight - wallThickness / 2, 0);
    arenaState.arenaVisuals.add(bottomWall);
    
    // Left wall
    const sideGeom = new THREE.BoxGeometry(wallThickness, height, wallDepth);
    const leftWall = new THREE.Mesh(sideGeom, wallMaterial);
    leftWall.position.set(-halfWidth - wallThickness / 2, 0, 0);
    arenaState.arenaVisuals.add(leftWall);
    
    // Right wall
    const rightWall = new THREE.Mesh(sideGeom, wallMaterial);
    rightWall.position.set(halfWidth + wallThickness / 2, 0, 0);
    arenaState.arenaVisuals.add(rightWall);
    
    // Floor grid pattern
    const gridHelper = new THREE.GridHelper(Math.max(width, height), 20, theme.gridColor1, theme.gridColor2);
    gridHelper.rotation.x = Math.PI / 2;
    gridHelper.position.z = -0.1;
    arenaState.arenaVisuals.add(gridHelper);
    
    // Add corner markers for visual reference
    const markerGeom = new THREE.CircleGeometry(1, 16);
    const markerMaterial = new THREE.MeshBasicMaterial({ color: theme.markerColor });
    
    const corners = [
        { x: -halfWidth + 5, y: halfHeight - 5 },
        { x: halfWidth - 5, y: halfHeight - 5 },
        { x: -halfWidth + 5, y: -halfHeight + 5 },
        { x: halfWidth - 5, y: -halfHeight + 5 }
    ];
    
    for (const corner of corners) {
        const marker = new THREE.Mesh(markerGeom, markerMaterial);
        marker.position.set(corner.x, corner.y, -0.05);
        arenaState.arenaVisuals.add(marker);
    }
    
    scene.add(arenaState.arenaVisuals);
}

/**
 * Configures camera for arena view
 * @param {THREE.Camera} camera - The camera (optional, uses stored ref)
 */
function setupArenaCamera(camera) {
    const cam = camera || arenaState.camera;
    if (!cam) return;
    
    const { width, height } = getArenaDimensions();
    
    // Calculate view to show entire arena with some padding
    const padding = 5;
    const aspect = window.innerWidth / window.innerHeight;
    const viewHeight = height + padding * 2;
    const viewWidth = viewHeight * aspect;
    
    cam.left = -viewWidth / 2;
    cam.right = viewWidth / 2;
    cam.top = viewHeight / 2;
    cam.bottom = -viewHeight / 2;
    cam.position.set(0, 0, 10);
    cam.updateProjectionMatrix();
}

/**
 * Handles window resize when in arena mode
 */
function resizeArena() {
    if (!arenaState.active) return;
    setupArenaCamera();
}

/**
 * Checks if arena mode is active
 * @returns {boolean} Whether arena is active
 */
function isArenaActive() {
    return arenaState.active;
}

/**
 * Gets current arena state (for external access)
 * @returns {object} Arena state
 */
function getArenaState() {
    return arenaState;
}

// ============================================================================
// AI Control Switching
// ============================================================================

/**
 * Switches player ship to ML AI control
 * @param {tf.Sequential} model - Trained TF.js model
 */
function switchToAiControl(model) {
    if (!arenaState.playerShip) {
        console.warn('No player ship to switch to AI control');
        return false;
    }
    if (activeMlController) {
        console.log('Already in AI control mode');
        return true;
    }

    savedPlayerController = arenaState.playerShip.controller;
    activeMlController = createMlController(model);

    // Seed with current sensing state if available
    if (arenaState.sensingState) {
        activeMlController.setSensingState(arenaState.sensingState);
    }

    arenaState.playerShip.controller = activeMlController;
    console.log('Switched to AI control');
    return true;
}

/** Switches player ship back to human control */
function switchToPlayerControl() {
    if (!activeMlController) return;
    if (arenaState.playerShip && savedPlayerController) {
        arenaState.playerShip.controller = savedPlayerController;
    }
    savedPlayerController = null;
    activeMlController = null;
    console.log('Switched to player control');
}

/** Returns whether AI control is currently active */
function isAiControlled() {
    return activeMlController !== null;
}

/**
 * Enters arena with a specific opponent ship controlled by an ML model.
 * Used for "Fight Against" saved ships (offline opponent training).
 * @param {Array} playerPieces - Player's ship pieces
 * @param {Array} opponentPieces - Opponent's ship pieces
 * @param {tf.Sequential} opponentModel - Trained model for the opponent
 * @param {THREE.Scene} scene - The Three.js scene
 * @param {THREE.Camera} camera - The camera
 * @param {THREE.Renderer} renderer - The renderer
 * @param {function} screenToWorld - Screen to world conversion function
 * @param {string} arenaType - Arena type key ('base', 'saw', 'energy', or 'random')
 * @returns {boolean} Whether arena was entered successfully
 */
function enterArenaWithOpponent(playerPieces, opponentPieces, opponentModel, scene, camera, renderer, screenToWorld, arenaType = 'random') {
    if (arenaState.active) {
        console.warn('Already in arena mode');
        return false;
    }

    const hasCore = playerPieces.some(p => p.category === 'CORE' || p.type === 'core');
    if (!hasCore) {
        console.warn('Ship needs a core piece to fly');
        return false;
    }

    const { config } = resolveArenaType(arenaType);
    currentArenaConfig = config;

    console.log(`Entering arena - ${config.name} - Fight Against saved opponent...`);

    arenaState.scene = scene;
    arenaState.camera = camera;
    arenaState.renderer = renderer;
    arenaState.currentLevel = null;
    arenaState.ships = [];

    originalCameraSettings = {
        left: camera.left,
        right: camera.right,
        top: camera.top,
        bottom: camera.bottom,
        position: camera.position.clone()
    };

    createArenaPhysics();
    createArenaVisuals(scene, config.theme);
    initHazards(scene, config);

    // Create player ship
    const playerController = createPlayerController(getInputState);
    arenaState.playerShip = createArenaShip(playerPieces, {
        team: 1,
        spawnX: 0,
        spawnY: -20,
        controller: playerController
    });

    if (!arenaState.playerShip) {
        console.error('Failed to create player ship');
        exitArena();
        return false;
    }
    arenaState.ships.push(arenaState.playerShip);
    scene.add(arenaState.playerShip.mesh);

    // Create opponent ship with ML controller
    const mlController = createMlController(opponentModel);
    const opponentShip = createArenaShip(opponentPieces, {
        team: 2,
        spawnX: 0,
        spawnY: 15,
        controller: mlController
    });

    if (opponentShip) {
        arenaState.ships.push(opponentShip);
        scene.add(opponentShip.mesh);
    }

    setupArenaCamera(camera);
    initThrustDebug(scene);
    setThrustDebugEnabled(true);
    initTargetIndicator(scene);
    initWeaponSystem(scene);
    initArenaControlsDisplay();
    initSensingDebug(scene);
    initMlPanel();
    setupArenaInput(arenaState, screenToWorld, renderer.domElement);
    setDebugVisible(false);

    arenaState.active = true;
    arenaState.lastTime = performance.now();

    showArenaNameOverlay(config.name);

    console.log(`Arena mode active - ${config.name}. WASD to move, mouse to aim, T to exit.`);
    return true;
}

// ============================================================================
// Arena Name Overlay
// ============================================================================

const OVERLAY_FADE_DELAY_MS = 500;
const OVERLAY_REMOVE_DELAY_MS = 2500;

/** Shows a centered arena name that fades out */
function showArenaNameOverlay(name) {
    removeArenaNameOverlay();
    const el = document.createElement('div');
    el.id = 'arena-name-overlay';
    el.textContent = name;
    document.body.appendChild(el);

    // Trigger fade-out after a short display
    setTimeout(() => el.classList.add('fade-out'), OVERLAY_FADE_DELAY_MS);

    // Remove from DOM after transition completes
    setTimeout(() => removeArenaNameOverlay(), OVERLAY_REMOVE_DELAY_MS);
}

/** Removes the name overlay if present */
function removeArenaNameOverlay() {
    const el = document.getElementById('arena-name-overlay');
    if (el) el.remove();
}

export {
    enterArena,
    enterArenaLevel,
    enterArenaWithOpponent,
    exitArena,
    updateArena,
    isArenaActive,
    getArenaState,
    resizeArena,
    switchToAiControl,
    switchToPlayerControl,
    isAiControlled,
    setOutcomeCallbacks
};
