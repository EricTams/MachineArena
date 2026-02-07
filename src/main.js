// Main entry point - initializes all systems and runs the game loop

import { createScene, resizeScene, getRenderer, getScene, getCamera, screenToWorld } from './scene.js';
import { createPhysicsWorld, stepPhysics } from './physics.js';
import { createGrid, getGridGroup } from './grid.js';
import { createBin, syncBinPiecesToPhysics, getBinGroup } from './bin.js';
import { setupInput } from './input.js';
import { spawnInitialParts, removePiece } from './pieces/piece.js';
import { initDebug, updateDebug } from './debug.js';
import { enterArena, enterArenaWithOpponent, exitArena, updateArena, isArenaActive, resizeArena, setOutcomeCallbacks } from './arena/arena.js';
import { initStatsPanel, hideStats } from './statsPanel.js';
import { setShipLayout, getShipLayout, clearGridPieces, createPiecesFromLayout } from './layout.js';
import { generateName, setPlayerName, getPlayerName, setShipName, getShipName, needsPlayerName } from './naming.js';
import { saveShip, listSavedShips, loadSavedShip, deleteSavedShip } from './shipPersistence.js';
import {
    importModelFromJson, exportModelAsJson, saveModelWeights, loadModelWeights,
    createModel, getDefaultConfig, prepareTrainingData, trainModel, disposeTrainingData
} from './ml/model.js';
import { startRecording, stopRecording, isRecording, getCompletedRuns, clearRuns } from './ml/recording.js';
import { initFirebase, isOnline, uploadFighter, fetchFighters, fetchFighter, fetchFighterForStage } from './firebase.js';
import { getCurrentStage, advanceStage, retreatStage } from './stages.js';
import { showTrainingSpinner, showVictory, showDefeat, hideFightOutcome } from './fightOutcome.js';

// Game state
const gameState = {
    pieces: [],        // All pieces in the game
    gridPieces: [],    // Pieces placed on the grid (no physics)
    binPieces: [],     // Pieces in the bin (physics simulated)
    selectedPiece: null,
    dragging: false
};

// Landing screen and loading bar helpers
const landingScreen = document.getElementById('landing-screen');
const loadingBar = document.getElementById('loading-bar');
const loadingStatus = document.getElementById('loading-status');

function updateLoading(percent, status) {
    if (loadingBar) loadingBar.style.width = `${percent}%`;
    if (loadingStatus) loadingStatus.textContent = status;
}

function hideLandingScreen() {
    if (landingScreen) {
        landingScreen.classList.add('hidden');
        setTimeout(() => landingScreen.remove(), 400);
    }
}

/**
 * Dismisses the getting-started tips panel.
 */
function dismissTips() {
    const panel = document.getElementById('tips-panel');
    if (panel) {
        panel.classList.add('hidden');
        setTimeout(() => panel.remove(), 350);
    }
}

// Ship presets - each defines a ship layout
// Equipment angle convention: forward (+Y) at angle 0
// angle 0 = forward/up (+Y), π/2 = left (-X), π = back/down (-Y), 3π/2 = right (+X)
const ANGLE_UP = 0;
const ANGLE_LEFT = Math.PI / 2;
const ANGLE_DOWN = Math.PI;
const ANGLE_RIGHT = Math.PI * 3 / 2;

const SHIP_PRESETS = {
    // Balanced starter ship
    starter: [
        { type: "block_2x2", col: 4, row: 5, angle: 0 },
        { type: "block_2x1", col: 3, row: 5, angle: ANGLE_RIGHT },
        { type: "core", col: 4, row: 4, angle: 0 },
        { type: "block_2x1", col: 4, row: 3, angle: 0 },
        { type: "block_1x1", col: 5, row: 4, angle: 0 },
        { type: "block_1x1", col: 3, row: 4, angle: ANGLE_RIGHT },
        { type: "block_1x1", col: 3, row: 3, angle: 0 },
        // Main thrusters at back - exhaust down to push forward
        { type: "thruster", col: 3, row: 3, angle: ANGLE_DOWN },
        { type: "thruster", col: 5, row: 3, angle: ANGLE_DOWN },
        // Side thrusters for strafing
        { type: "thruster", col: 5, row: 5, angle: ANGLE_RIGHT },
        { type: "thruster", col: 3, row: 5, angle: ANGLE_LEFT },
        // Cannons at front - fire forward
        { type: "cannon", col: 3, row: 6, angle: ANGLE_UP },
        { type: "cannon", col: 5, row: 6, angle: ANGLE_UP }
    ],
    // Combat-focused ship with triple cannons
    gunboat: [
        { type: "core", col: 4, row: 4, angle: 0 },
        { type: "block_2x1", col: 3, row: 3, angle: ANGLE_RIGHT },
        { type: "block_2x1", col: 5, row: 3, angle: ANGLE_RIGHT },
        { type: "block_1x1", col: 3, row: 5, angle: 0 },
        { type: "block_1x1", col: 4, row: 5, angle: 0 },
        { type: "block_1x1", col: 5, row: 5, angle: 0 },
        // Triple cannons at front - fire forward
        { type: "cannon", col: 3, row: 5, angle: ANGLE_UP },
        { type: "cannon", col: 4, row: 5, angle: ANGLE_UP },
        { type: "cannon", col: 5, row: 5, angle: ANGLE_UP },
        // Main thrusters - exhaust down to push forward
        { type: "thruster", col: 3, row: 4, angle: ANGLE_DOWN },
        { type: "thruster", col: 5, row: 4, angle: ANGLE_DOWN },
        // Rear thrusters - exhaust up to brake/reverse
        { type: "thruster", col: 3, row: 3, angle: ANGLE_UP },
        { type: "thruster", col: 5, row: 3, angle: ANGLE_UP }
    ],
    // Fast, lightweight ship
    speeder: [
        { type: "core", col: 4, row: 4, angle: 0 },
        { type: "block_1x1", col: 3, row: 4, angle: 0 },
        { type: "block_1x1", col: 5, row: 4, angle: 0 },
        { type: "block_1x1", col: 4, row: 5, angle: 0 },
        // Main thrusters - exhaust down to push forward
        { type: "thruster", col: 3, row: 4, angle: ANGLE_DOWN },
        { type: "thruster", col: 5, row: 4, angle: ANGLE_DOWN },
        // Cannon at front - fire forward
        { type: "cannon", col: 4, row: 5, angle: ANGLE_UP }
    ],
    // Heavy, armored ship
    tank: [
        { type: "core", col: 4, row: 4, angle: 0 },
        { type: "block_2x2", col: 3, row: 2, angle: 0 },
        { type: "block_2x2", col: 5, row: 2, angle: 0 },
        { type: "block_2x2", col: 3, row: 5, angle: 0 },
        { type: "block_2x2", col: 5, row: 5, angle: 0 },
        { type: "block_2x1", col: 2, row: 4, angle: ANGLE_DOWN },
        { type: "block_2x1", col: 6, row: 4, angle: ANGLE_DOWN },
        // Cannons at front - fire forward
        { type: "cannon", col: 4, row: 6, angle: ANGLE_UP },
        { type: "cannon", col: 5, row: 6, angle: ANGLE_UP },
        // Side thrusters for strafing
        { type: "thruster", col: 3, row: 3, angle: ANGLE_LEFT },
        { type: "thruster", col: 3, row: 5, angle: ANGLE_LEFT },
        { type: "thruster", col: 6, row: 3, angle: ANGLE_RIGHT },
        { type: "thruster", col: 6, row: 5, angle: ANGLE_RIGHT },
        // Main thrusters at back - exhaust down to push forward
        { type: "thruster", col: 4, row: 3, angle: ANGLE_DOWN },
        { type: "thruster", col: 5, row: 3, angle: ANGLE_DOWN },
        // Front thrusters - exhaust up to brake
        { type: "thruster", col: 4, row: 2, angle: ANGLE_UP },
        { type: "thruster", col: 5, row: 2, angle: ANGLE_UP }
    ]
};

// Default ship layout (starter)
const DEFAULT_SHIP_LAYOUT = SHIP_PRESETS.starter;

/**
 * Spawns the default ship layout on grid + extra parts in bin
 * @param {object} gameState - The game state
 */
function spawnDefaultShip(gameState) {
    // Set the layout - this renders the grid pieces automatically
    setShipLayout(DEFAULT_SHIP_LAYOUT, gameState);
    
    // Spawn extra parts in bin (cannons not in default layout)
    spawnInitialParts(gameState, { skipDefaultShipParts: true });
}

/**
 * Shows the landing screen and waits for the player to click Start.
 * Handles first-visit name generation and connection status display.
 * @returns {Promise<void>} Resolves when the player clicks Start
 */
function showLandingScreen() {
    return new Promise(resolve => {
        const playerNameInput = document.getElementById('landing-player-name');
        const shipNameEl = document.getElementById('landing-ship-name');
        const rerollBtn = document.getElementById('landing-reroll-btn');
        const startBtn = document.getElementById('landing-start-btn');
        const statusDot = document.querySelector('#landing-status .status-dot');
        const statusText = document.getElementById('landing-status-text');

        if (!playerNameInput || !shipNameEl || !startBtn) {
            resolve();
            return;
        }

        // Player name: load existing or leave empty for first visit
        playerNameInput.value = getPlayerName() || '';

        // Ship name: load existing or generate new
        let currentShip = getShipName() || generateName();
        shipNameEl.textContent = currentShip;

        // Reroll generates a new ship name
        rerollBtn.addEventListener('click', () => {
            currentShip = generateName();
            shipNameEl.textContent = currentShip;
        });

        // Check Firebase connection status
        initFirebase();
        if (isOnline()) {
            statusDot.className = 'status-dot online';
            statusText.textContent = 'Online - fighters will sync';
        } else {
            statusDot.className = 'status-dot offline';
            statusText.textContent = 'Offline - play locally';
        }

        // Show start button
        startBtn.style.display = '';
        startBtn.textContent = isOnline() ? 'Start' : 'Start Offline';

        // Start button: validate, save names, begin loading
        startBtn.addEventListener('click', () => {
            const playerName = playerNameInput.value.trim();
            if (!playerName) {
                playerNameInput.focus();
                playerNameInput.style.borderColor = '#e53e3e';
                return;
            }

            setPlayerName(playerName);
            setShipName(currentShip);
            currentShipName = currentShip;

            startBtn.style.display = 'none';
            rerollBtn.style.display = 'none';

            const loadingEl = document.getElementById('landing-loading');
            if (loadingEl) loadingEl.classList.add('active');

            resolve();
        });

        // Clear red border on input when typing
        playerNameInput.addEventListener('input', () => {
            playerNameInput.style.borderColor = '';
        });
    });
}

async function init() {
    // Show landing screen and wait for Start
    await showLandingScreen();

    const canvas = document.getElementById('game-canvas');
    
    // Helper to update loading and yield to browser
    const step = (percent, status, action) => {
        return new Promise(resolve => {
            updateLoading(percent, status);
            // Small delay lets browser repaint the loading bar
            setTimeout(() => {
                action();
                resolve();
            }, 20);
        });
    };
    
    await step(10, 'Setting up renderer...', () => {
        createScene(canvas);
    });
    
    await step(25, 'Initializing physics...', () => {
        createPhysicsWorld();
    });
    
    await step(40, 'Creating grid...', () => {
        createGrid();
    });
    
    await step(50, 'Creating parts bin...', () => {
        createBin();
    });
    
    await step(60, 'Setting up input...', () => {
        setupInput(gameState);
    });
    
    await step(75, 'Spawning ship...', () => {
        spawnDefaultShip(gameState);
    });
    
    await step(85, 'Initializing debug...', () => {
        initDebug();
        initStatsPanel();
    });
    
    await step(95, 'Finishing up...', () => {
        // Handle window resize
        window.addEventListener('resize', () => {
            resizeScene();
            resizeArena();
        });
        
        // Setup arena mode toggle (T key)
        setupArenaModeToggle();
        
        // Setup UI buttons
        setupCopyLayoutButton();
        setupFightButton();
        setupTestArenaButton();
        setupShipSelector();
        setupSaveShipButton();
        setupMyShipsDropdown();
        setupOpponentsDropdown();
        setupTipsDismiss();
        updateStageIndicator();
    });
    
    // All done - hide landing screen and start game
    updateLoading(100, 'Ready!');
    setTimeout(() => {
        hideLandingScreen();
        requestAnimationFrame(gameLoop);
    }, 150);
}

/**
 * Sets up the T key to exit arena mode (only exits, doesn't enter)
 */
function setupArenaModeToggle() {
    window.addEventListener('keydown', (e) => {
        if (e.key === 't' || e.key === 'T') {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            if (isArenaActive()) exitArenaMode();
        }
    });
}

/**
 * Sets up the dismiss button on the getting-started tips panel.
 */
function setupTipsDismiss() {
    const btn = document.getElementById('tips-dismiss');
    if (btn) btn.addEventListener('click', dismissTips);
}

/**
 * Sets up the copy layout button
 */
function setupCopyLayoutButton() {
    const btn = document.getElementById('copy-layout-btn');
    if (!btn) return;
    
    btn.addEventListener('click', () => {
        copyShipLayoutToClipboard();
    });
}

/**
 * Sets up the FIGHT! button
 */
function setupFightButton() {
    const btn = document.getElementById('fight-btn');
    if (btn) btn.addEventListener('click', () => enterFight());
}

/**
 * Sets up the Test Arena button (dev/sandbox)
 */
function setupTestArenaButton() {
    const btn = document.getElementById('test-arena-btn');
    if (!btn) return;
    btn.addEventListener('click', () => enterTestArena());
}

/**
 * Sets up the ship selector dropdown
 */
function setupShipSelector() {
    const selectorBtn = document.getElementById('ship-selector-btn');
    const dropdown = document.getElementById('ship-dropdown');
    if (!selectorBtn || !dropdown) return;
    
    // Toggle dropdown on button click
    selectorBtn.addEventListener('click', () => {
        dropdown.classList.toggle('open');
    });
    
    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.ship-selector')) {
            dropdown.classList.remove('open');
        }
    });
    
    // Handle ship option clicks
    const options = dropdown.querySelectorAll('.ship-option');
    for (const option of options) {
        option.addEventListener('click', () => {
            const shipName = option.dataset.ship;
            loadShipPreset(shipName);
            dropdown.classList.remove('open');
        });
    }
}

/**
 * Updates the stage indicator to show the current stage.
 */
function updateStageIndicator() {
    const el = document.getElementById('stage-indicator');
    if (!el) return;
    el.textContent = `Stage ${getCurrentStage()}`;

    // AIDEV-NOTE: Debug convenience -- click to go back a stage
    if (!el._hasRetreatHandler) {
        el.style.cursor = 'pointer';
        el.addEventListener('click', () => {
            retreatStage();
            updateStageIndicator();
        });
        el._hasRetreatHandler = true;
    }
}

// ============================================================================
// Save Ship UI
// ============================================================================

/**
 * Sets up the Save Ship button and dialog
 */
function setupSaveShipButton() {
    const btn = document.getElementById('save-ship-btn');
    const dialog = document.getElementById('save-ship-dialog');
    const input = document.getElementById('save-ship-name');
    const confirmBtn = document.getElementById('save-ship-confirm');
    const cancelBtn = document.getElementById('save-ship-cancel');
    if (!btn || !dialog || !input || !confirmBtn || !cancelBtn) return;

    btn.addEventListener('click', () => {
        if (isArenaActive()) return;
        input.value = '';
        dialog.classList.remove('hidden');
        input.focus();
    });

    const closeDialog = () => dialog.classList.add('hidden');
    cancelBtn.addEventListener('click', closeDialog);

    const doSave = async () => {
        const name = input.value.trim();
        if (!name) return;
        closeDialog();
        btn.textContent = 'Saving...';
        try {
            const layout = getShipLayout();
            await saveShip(name, layout);
            btn.textContent = 'Saved!';
            refreshMyShipsDropdown();
        } catch (err) {
            console.error('Save failed:', err);
            btn.textContent = 'Error!';
        }
        setTimeout(() => { btn.textContent = 'Save Ship'; }, 1200);
    };

    confirmBtn.addEventListener('click', doSave);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') doSave();
        if (e.key === 'Escape') closeDialog();
    });
}

// ============================================================================
// My Ships dropdown
// ============================================================================

/**
 * Sets up the My Ships dropdown (load design, fight against, delete)
 */
function setupMyShipsDropdown() {
    const selectorBtn = document.getElementById('my-ships-btn');
    const dropdown = document.getElementById('my-ships-dropdown');
    if (!selectorBtn || !dropdown) return;

    selectorBtn.addEventListener('click', () => {
        dropdown.classList.toggle('open');
        if (dropdown.classList.contains('open')) {
            refreshMyShipsDropdown();
        }
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('#my-ships-selector')) {
            dropdown.classList.remove('open');
        }
    });
}

/**
 * Refreshes the My Ships dropdown contents from IndexedDB
 */
async function refreshMyShipsDropdown() {
    const dropdown = document.getElementById('my-ships-dropdown');
    if (!dropdown) return;

    const ships = await listSavedShips();
    dropdown.innerHTML = '';

    if (ships.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'my-ships-empty';
        empty.textContent = 'No saved ships yet';
        dropdown.appendChild(empty);
        return;
    }

    for (const ship of ships) {
        const row = document.createElement('div');
        row.className = 'my-ship-item';

        const nameBtn = document.createElement('span');
        nameBtn.className = 'my-ship-name';
        nameBtn.textContent = ship.shipName;
        nameBtn.title = 'Load this design';
        nameBtn.addEventListener('click', () => {
            loadSavedShipDesign(ship.id);
            dropdown.classList.remove('open');
        });

        const fightBtn = document.createElement('button');
        fightBtn.className = 'my-ship-fight';
        fightBtn.textContent = 'Fight';
        fightBtn.title = 'Fight against this ship';
        fightBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            fightAgainstSavedShip(ship.id);
            dropdown.classList.remove('open');
        });

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'my-ship-delete';
        deleteBtn.textContent = '\u00D7';
        deleteBtn.title = 'Delete';
        deleteBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await deleteSavedShip(ship.id);
            refreshMyShipsDropdown();
        });

        row.appendChild(nameBtn);
        if (ship.hasWeights) row.appendChild(fightBtn);
        row.appendChild(deleteBtn);
        dropdown.appendChild(row);
    }
}

// ============================================================================
// Opponents dropdown (community browser)
// ============================================================================

/**
 * Sets up the Opponents dropdown for fighting community opponents
 */
function setupOpponentsDropdown() {
    const selectorBtn = document.getElementById('opponents-btn');
    const dropdown = document.getElementById('opponents-dropdown');
    if (!selectorBtn || !dropdown) return;

    selectorBtn.addEventListener('click', () => {
        dropdown.classList.toggle('open');
        if (dropdown.classList.contains('open')) {
            refreshOpponentsDropdown();
        }
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('#opponents-selector')) {
            dropdown.classList.remove('open');
        }
    });
}

/**
 * Refreshes the Opponents dropdown from Firestore
 */
async function refreshOpponentsDropdown() {
    const dropdown = document.getElementById('opponents-dropdown');
    if (!dropdown) return;

    dropdown.innerHTML = '';

    if (!isOnline()) {
        const msg = document.createElement('div');
        msg.className = 'my-ships-empty';
        msg.textContent = 'Online features not configured';
        dropdown.appendChild(msg);
        return;
    }

    const loading = document.createElement('div');
    loading.className = 'my-ships-empty';
    loading.textContent = 'Loading...';
    dropdown.appendChild(loading);

    const fighters = await fetchFighters();
    dropdown.innerHTML = '';

    // Filter out current player's own entries
    const playerName = getPlayerName();
    const others = fighters.filter(f => f.playerName !== playerName && f.hasWeights);

    if (others.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'my-ships-empty';
        empty.textContent = 'No opponents found';
        dropdown.appendChild(empty);
        return;
    }

    for (const fighter of others) {
        const row = document.createElement('div');
        row.className = 'opponent-item';

        const info = document.createElement('div');
        info.className = 'opponent-info';

        const name = document.createElement('div');
        name.className = 'opponent-name';
        name.textContent = fighter.playerName;

        const detail = document.createElement('div');
        detail.className = 'opponent-detail';
        detail.textContent = `${fighter.shipName} \u2022 Level ${fighter.levelNum}`;

        info.appendChild(name);
        info.appendChild(detail);

        const fightBtn = document.createElement('button');
        fightBtn.className = 'opponent-fight';
        fightBtn.textContent = 'Fight';
        fightBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            fightAgainstOnlineOpponent(fighter.docId);
            dropdown.classList.remove('open');
        });

        row.appendChild(info);
        row.appendChild(fightBtn);
        dropdown.appendChild(row);
    }
}

/**
 * Enters arena to fight against an online opponent from Firestore
 * @param {string} docId - Firestore document ID
 */
async function fightAgainstOnlineOpponent(docId) {
    const record = await fetchFighter(docId);
    if (!record || !record.weightsBase64 || !record.topology) {
        console.error('Opponent has no trained weights');
        return;
    }

    let opponentModel;
    try {
        const result = await importModelFromJson({
            topology: record.topology,
            weightSpecs: record.weightSpecs,
            weightsBase64: record.weightsBase64,
            config: record.modelConfig,
            schemaVersion: record.schemaVersion
        });
        opponentModel = result.model;
    } catch (err) {
        console.error('Failed to load opponent model:', err.message);
        return;
    }

    const playerLayout = getShipLayout();
    const playerPieces = createPiecesFromLayout(playerLayout);
    if (playerPieces.length === 0) {
        console.log('Place some pieces on the grid first');
        opponentModel.dispose();
        return;
    }

    const opponentPieces = createPiecesFromLayout(record.layout);
    if (opponentPieces.length === 0) {
        console.error('Opponent ship layout is empty');
        opponentModel.dispose();
        return;
    }

    const scene = getScene();
    const camera = getCamera();
    const renderer = getRenderer();

    const success = enterArenaWithOpponent(
        playerPieces, opponentPieces, opponentModel,
        scene, camera, renderer, screenToWorld
    );

    if (success) {
        startRecording();
        showDesignMode(false);
        updateFightButtonText();
    } else {
        opponentModel.dispose();
    }
}

// ============================================================================
// Auto-train and upload at end of fight
// ============================================================================

// Track current ship name for uploads (set from landing screen or preset load)
let currentShipName = 'unnamed';

// Auto-training config: fewer epochs for quick post-fight training
const AUTO_TRAIN_EPOCHS = 15;

/**
 * Auto-trains the ML model from recorded fight data, then saves weights.
 * Returns the trained model and config, or null if training failed.
 * @returns {Promise<{model, config}|null>}
 */
async function autoTrainFromRecording() {
    const runs = getCompletedRuns();
    if (runs.length === 0) {
        console.log('No recorded data to train on');
        return null;
    }

    const config = getDefaultConfig();
    config.epochs = AUTO_TRAIN_EPOCHS;

    let data;
    try {
        data = prepareTrainingData(runs, config.valRunFraction);
    } catch (err) {
        console.warn('Auto-train data error:', err.message);
        return null;
    }

    // Try to continue training from existing weights (accumulates learning across fights)
    let model;
    const existing = await loadModelWeights();
    if (existing) {
        model = existing.model;
        console.log('Continuing training from existing weights');
    } else {
        model = createModel(config);
        console.log('No existing weights — training from scratch');
    }

    try {
        await trainModel(model, data, config);
        await saveModelWeights(model, config);
        console.log(`Auto-trained on ${data.train.numFrames} frames (${AUTO_TRAIN_EPOCHS} epochs)`);
        return { model, config };
    } catch (err) {
        console.warn('Auto-train failed:', err.message);
        model.dispose();
        return null;
    } finally {
        disposeTrainingData(data);
    }
}

/**
 * Uploads the current ship design + freshly trained weights to Firestore.
 * @param {number} stageNum - The stage to tag the upload with
 * @param {{model, config}|null} trained - Result from autoTrainFromRecording
 */
async function uploadFighterForStage(stageNum, trained) {
    if (!isOnline()) return;

    const playerName = getPlayerName();
    if (!playerName) return;

    const layout = getShipLayout();
    if (layout.length === 0) return;

    const shipName = currentShipName || getShipName() || 'unnamed';

    let weightData = null;
    if (trained) {
        try {
            weightData = await exportModelAsJson(trained.model, trained.config);
        } catch (err) {
            console.warn('Could not export weights for upload:', err.message);
        }
    }

    uploadFighter({
        shipName,
        levelNum: stageNum,
        layout,
        topology: weightData?.topology ?? null,
        weightSpecs: weightData?.weightSpecs ?? null,
        weightsBase64: weightData?.weightsBase64 ?? null,
        modelConfig: weightData?.config ?? null,
        schemaVersion: weightData?.schemaVersion ?? null
    });
}

/**
 * Loads a saved ship design onto the grid
 * @param {number} shipId - Saved ship record ID
 */
async function loadSavedShipDesign(shipId) {
    if (isArenaActive()) {
        console.log('Exit arena first to load a different ship');
        return;
    }
    const record = await loadSavedShip(shipId);
    if (!record) {
        console.error('Ship not found');
        return;
    }
    setShipLayout(record.layout, gameState);
    currentShipName = record.shipName;

    // Also load weights into IndexedDB if the save has them
    if (record.weightsBase64 && record.topology) {
        try {
            const { model, config } = await importModelFromJson({
                topology: record.topology,
                weightSpecs: record.weightSpecs,
                weightsBase64: record.weightsBase64,
                config: record.modelConfig,
                schemaVersion: record.schemaVersion
            });
            await saveModelWeights(model, config);
            model.dispose();
            console.log(`Loaded weights for "${record.shipName}"`);
        } catch (err) {
            console.warn('Could not load saved weights:', err.message);
        }
    }
    console.log(`Loaded ship design: ${record.shipName}`);
}

/**
 * Enters arena to fight against a saved ship's AI
 * @param {number} shipId - Saved ship record ID
 */
async function fightAgainstSavedShip(shipId) {
    const record = await loadSavedShip(shipId);
    if (!record || !record.weightsBase64 || !record.topology) {
        console.error('Ship has no trained weights to fight against');
        return;
    }

    // Import the opponent's model
    let opponentModel;
    try {
        const result = await importModelFromJson({
            topology: record.topology,
            weightSpecs: record.weightSpecs,
            weightsBase64: record.weightsBase64,
            config: record.modelConfig,
            schemaVersion: record.schemaVersion
        });
        opponentModel = result.model;
    } catch (err) {
        console.error('Failed to load opponent model:', err.message);
        return;
    }

    // Create player pieces from current grid layout
    const playerLayout = getShipLayout();
    const playerPieces = createPiecesFromLayout(playerLayout);
    if (playerPieces.length === 0) {
        console.log('Place some pieces on the grid first');
        opponentModel.dispose();
        return;
    }

    // Create opponent pieces from saved layout
    const opponentPieces = createPiecesFromLayout(record.layout);
    if (opponentPieces.length === 0) {
        console.error('Saved ship layout is empty');
        opponentModel.dispose();
        return;
    }

    // Enter arena with the opponent
    const scene = getScene();
    const camera = getCamera();
    const renderer = getRenderer();

    const success = enterArenaWithOpponent(
        playerPieces, opponentPieces, opponentModel,
        scene, camera, renderer, screenToWorld
    );

    if (success) {
        startRecording();
        showDesignMode(false);
        updateFightButtonText();
    } else {
        opponentModel.dispose();
    }
}

/**
 * Creates pieces from a ship preset (for enemy ships in levels)
 * Uses the single path: layout -> createPiecesFromLayout
 * @param {string} presetName - Name of the preset
 * @returns {Array} Array of pieces ready for arena ship creation
 */
function getPresetPieces(presetName) {
    const layout = SHIP_PRESETS[presetName];
    if (!layout) {
        console.error(`Unknown ship preset: ${presetName}`);
        return [];
    }
    
    // Single path: layout -> pieces
    return createPiecesFromLayout(layout);
}

/**
 * Clears all pieces from the grid
 */
function clearGrid() {
    clearGridPieces(gameState);
}

/**
 * Loads a ship preset by name
 * @param {string} presetName - Name of the preset (e.g., 'starter', 'gunboat')
 */
function loadShipPreset(presetName) {
    const layout = SHIP_PRESETS[presetName];
    if (!layout) {
        console.error(`Unknown ship preset: ${presetName}`);
        return;
    }
    
    // Don't load ships while in arena
    if (isArenaActive()) {
        console.log('Exit arena first to load a different ship');
        return;
    }
    
    // Set the layout - this clears and re-renders automatically
    setShipLayout(layout, gameState);
    currentShipName = presetName;
    
    console.log(`Loaded ship: ${presetName}`);
}

/**
 * Serializes ship layout and copies to clipboard
 */
function copyShipLayoutToClipboard() {
    const layout = getShipLayout();
    const json = JSON.stringify(layout, null, 2);
    
    navigator.clipboard.writeText(json).then(() => {
        console.log('Ship layout copied to clipboard!');
        console.log(json);
        // Brief visual feedback
        const btn = document.getElementById('copy-layout-btn');
        if (btn) {
            const originalText = btn.textContent;
            btn.textContent = 'Copied!';
            setTimeout(() => { btn.textContent = originalText; }, 1000);
        }
    }).catch(err => {
        console.error('Failed to copy:', err);
    });
}

// ============================================================================
// Stage-based fight flow
// ============================================================================

// Whether the current arena session is a stage fight (vs. test/sandbox)
let isStageFight = false;
// The stage number for the current fight
let currentFightStage = 0;

/**
 * Exits arena mode and returns to design.
 * For non-stage fights (test arena, saved ship fights), just exits.
 * Stage fights use outcome callbacks instead of this exit path.
 */
function exitArenaMode() {
    if (!isArenaActive()) return;

    // Stop auto-recording if active
    if (isRecording()) stopRecording();

    isStageFight = false;
    currentFightStage = 0;
    hideFightOutcome();
    exitArena();
    showDesignMode(true);
    updateFightButtonText();
}

/**
 * FIGHT! button -- enters a stage fight against a Firebase opponent.
 * Fetches a random opponent for the current stage, falls back to preset if none found.
 */
async function enterFight() {
    if (isArenaActive()) {
        exitArenaMode();
        return;
    }

    if (gameState.gridPieces.length === 0) {
        console.log('Place some pieces on the grid first! (Need at least a Core)');
        return;
    }

    const stage = getCurrentStage();
    currentFightStage = stage;
    console.log(`[Fight] Entering Stage ${stage}...`);

    // Try to fetch an opponent from Firebase for this stage
    const opponent = await fetchFighterForStage(stage);

    if (opponent) {
        await startStageFightWithRecord(opponent);
    } else {
        console.log(`No Stage ${stage} opponents found -- using preset fallback`);
        startStageFightWithPreset();
    }
}

/**
 * Starts a stage fight against a Firebase opponent record.
 * @param {object} record - Full fighter document from Firestore
 */
async function startStageFightWithRecord(record) {
    let opponentModel;
    try {
        const result = await importModelFromJson({
            topology: record.topology,
            weightSpecs: record.weightSpecs,
            weightsBase64: record.weightsBase64,
            config: record.modelConfig,
            schemaVersion: record.schemaVersion
        });
        opponentModel = result.model;
    } catch (err) {
        console.error('Failed to load opponent model:', err.message);
        console.log('Falling back to preset opponent');
        startStageFightWithPreset();
        return;
    }

    const playerPieces = createPiecesFromLayout(getShipLayout());
    if (playerPieces.length === 0) {
        console.log('Place some pieces on the grid first');
        opponentModel.dispose();
        return;
    }

    const opponentPieces = createPiecesFromLayout(record.layout);
    if (opponentPieces.length === 0) {
        console.error('Opponent ship layout is empty');
        opponentModel.dispose();
        return;
    }

    const success = enterArenaWithOpponent(
        playerPieces, opponentPieces, opponentModel,
        getScene(), getCamera(), getRenderer(), screenToWorld
    );

    if (success) {
        isStageFight = true;
        wireStageOutcomeCallbacks();
        startRecording();
        showDesignMode(false);
        updateFightButtonText();
        console.log(`Stage ${currentFightStage}: Fighting ${record.playerName}'s ${record.shipName}`);
    } else {
        opponentModel.dispose();
    }
}

/**
 * Starts a stage fight against a random preset ship (fallback when no opponents).
 */
function startStageFightWithPreset() {
    const presetNames = Object.keys(SHIP_PRESETS);
    const pick = presetNames[Math.floor(Math.random() * presetNames.length)];
    const opponentPieces = createPiecesFromLayout(SHIP_PRESETS[pick]);

    if (opponentPieces.length === 0) {
        console.error('Failed to create opponent from preset:', pick);
        return;
    }

    const opponentModel = createModel(getDefaultConfig());

    const playerPieces = createPiecesFromLayout(getShipLayout());
    if (playerPieces.length === 0) {
        console.log('Place some pieces on the grid first');
        opponentModel.dispose();
        return;
    }

    const success = enterArenaWithOpponent(
        playerPieces, opponentPieces, opponentModel,
        getScene(), getCamera(), getRenderer(), screenToWorld
    );

    if (success) {
        isStageFight = true;
        wireStageOutcomeCallbacks();
        startRecording();
        showDesignMode(false);
        updateFightButtonText();
        console.log(`Stage ${currentFightStage}: Fighting preset ${pick} (fallback)`);
    } else {
        opponentModel.dispose();
    }
}

/**
 * Wires up the win/loss callbacks for a stage fight.
 * On fight end: stop recording -> show spinner -> auto-train -> show result.
 */
function wireStageOutcomeCallbacks() {
    setOutcomeCallbacks(
        () => handleStageFightEnd('won'),
        () => handleStageFightEnd('lost')
    );
}

/**
 * Handles the end of a stage fight (win or lose).
 * Stops recording, auto-trains, and shows the appropriate overlay.
 * @param {'won'|'lost'} outcome
 */
async function handleStageFightEnd(outcome) {
    const stage = currentFightStage;

    // Stop recording player actions
    if (isRecording()) stopRecording();

    // Show training spinner
    showTrainingSpinner();

    // Auto-train from this fight's recorded data
    const trained = await autoTrainFromRecording();

    // Clean up recorded runs (already trained, don't accumulate indefinitely)
    clearRuns();

    // Exit the arena (clears physics, ships, etc.)
    exitArena();

    if (outcome === 'won') {
        // Upload fighter for this stage
        if (trained) {
            await uploadFighterForStage(stage, trained);
            trained.model.dispose();
        }
        advanceStage();
        updateStageIndicator();

        showVictory(stage, {
            onNextStage: () => {
                showDesignMode(true);
                updateFightButtonText();
                // Immediately start next stage fight
                enterFight();
            },
            onBackToDesigner: () => {
                showDesignMode(true);
                updateFightButtonText();
            }
        });
    } else {
        // Still dispose trained model on loss
        if (trained) trained.model.dispose();

        showDefeat(stage, {
            onRetry: () => {
                showDesignMode(true);
                updateFightButtonText();
                // Retry the same stage
                enterFight();
            },
            onBackToDesigner: () => {
                showDesignMode(true);
                updateFightButtonText();
            }
        });
    }

    isStageFight = false;
    currentFightStage = 0;
}

/**
 * Test Arena button -- enters free flight (no enemies), no auto-upload.
 * Sandbox for testing ship movement and controls.
 */
function enterTestArena() {
    if (isArenaActive()) {
        exitArenaMode();
        return;
    }

    if (gameState.gridPieces.length === 0) {
        console.log('Place some pieces on the grid first! (Need at least a Core)');
        return;
    }

    const scene = getScene();
    const camera = getCamera();
    const renderer = getRenderer();
    const playerLayout = getShipLayout();
    const playerPieces = createPiecesFromLayout(playerLayout);

    const success = enterArena(
        playerPieces,
        scene, camera, renderer,
        screenToWorld
    );

    if (success) {
        showDesignMode(false);
        updateFightButtonText();
    }
}

/**
 * Updates the FIGHT button text based on current mode
 */
function updateFightButtonText() {
    const fightBtn = document.getElementById('fight-btn');
    const testBtn = document.getElementById('test-arena-btn');
    if (fightBtn) fightBtn.textContent = isArenaActive() ? 'Exit' : 'FIGHT!';
    if (testBtn) testBtn.textContent = isArenaActive() ? 'Exit' : 'Free Flight';
}

/**
 * Shows or hides design mode elements
 * @param {boolean} visible - Whether to show design elements
 */
function showDesignMode(visible) {
    // Hide/show grid
    const gridGroup = getGridGroup();
    if (gridGroup) {
        gridGroup.visible = visible;
    }
    
    // Hide/show bin
    const binGroup = getBinGroup();
    if (binGroup) {
        binGroup.visible = visible;
    }
    
    // Hide/show all pieces
    for (const piece of gameState.pieces) {
        if (piece.mesh) {
            piece.mesh.visible = visible;
        }
    }
    
    // Hide stats panel and tips when leaving design mode (entering arena)
    if (!visible) {
        hideStats();
        dismissTips();
    }
    
    // Hide/show design-only toolbar elements
    const stageIndicator = document.getElementById('stage-indicator');
    const saveBtn = document.getElementById('save-ship-btn');
    const myShips = document.getElementById('my-ships-selector');
    const opponents = document.getElementById('opponents-selector');
    const devToolbar = document.getElementById('dev-toolbar');
    if (stageIndicator) stageIndicator.style.display = visible ? '' : 'none';
    if (saveBtn) saveBtn.style.display = visible ? '' : 'none';
    if (myShips) myShips.style.display = visible ? '' : 'none';
    if (opponents) opponents.style.display = visible ? '' : 'none';
    if (devToolbar) devToolbar.style.display = visible ? '' : 'none';
}

let lastTime = 0;
function gameLoop(currentTime) {
    const deltaTime = (currentTime - lastTime) / 1000;
    lastTime = currentTime;
    
    if (isArenaActive()) {
        // Arena mode update
        updateArena(deltaTime);
    } else {
        // Design mode update
        // Step physics for bin pieces
        stepPhysics(deltaTime);
        
        // Sync bin piece positions from physics
        syncBinPiecesToPhysics(gameState.binPieces);
        
        // Update debug visualization
        updateDebug(gameState.pieces);
    }
    
    // Render
    const renderer = getRenderer();
    const scene = getScene();
    const camera = getCamera();
    renderer.render(scene, camera);
    
    requestAnimationFrame(gameLoop);
}

// Start when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

export { gameState, SHIP_PRESETS };
