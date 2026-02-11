// Arena input - WASD movement, mouse aiming, and weapon controls

import { toggleThrustDebug } from './thrustDebug.js';
import { toggleSensingDebug } from './sensingDebug.js';
import { toggleRecording } from '../ml/recording.js';
import { toggleAiControl } from './arena.js';

// Input state
const inputState = {
    forward: false,       // W
    back: false,          // S
    left: false,          // A
    right: false,         // D
    turnLeft: false,      // Q
    turnRight: false,     // E
    rightMouseDown: false, // Right-click held (turn toward mouse)
    shiftHeld: false,     // Shift held (fast turn modifier)
    mousePosition: null,  // Current mouse world position (for cannon aiming and turning)
    fireRequested: false  // Left-click to fire
};

// References
let arenaStateRef = null;
let screenToWorldFn = null;
let canvasRef = null;

/**
 * Sets up arena input handlers
 * @param {object} arenaState - Arena state with ship reference
 * @param {function} screenToWorld - Function to convert screen to world coords
 * @param {HTMLCanvasElement} canvas - The canvas element
 */
function setupArenaInput(arenaState, screenToWorld, canvas) {
    arenaStateRef = arenaState;
    screenToWorldFn = screenToWorld;
    canvasRef = canvas;
    
    // Keyboard events
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    
    // Prevent context menu on right-click
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    
    // Mouse buttons (left-click to fire, right-click to turn toward mouse)
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mouseup', onMouseUp);
    
    // Track mouse position for cannon aiming and turning
    canvas.addEventListener('mousemove', onMouseMove);
}

/**
 * Removes arena input handlers
 */
function removeArenaInput() {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    
    if (canvasRef) {
        canvasRef.removeEventListener('mousedown', onMouseDown);
        canvasRef.removeEventListener('mouseup', onMouseUp);
        canvasRef.removeEventListener('mousemove', onMouseMove);
    }
    
    // Reset state
    inputState.forward = false;
    inputState.back = false;
    inputState.left = false;
    inputState.right = false;
    inputState.turnLeft = false;
    inputState.turnRight = false;
    inputState.rightMouseDown = false;
    inputState.shiftHeld = false;
    inputState.mousePosition = null;
    inputState.fireRequested = false;
    
    arenaStateRef = null;
    screenToWorldFn = null;
    canvasRef = null;
}

/**
 * Handles key down events
 */
function onKeyDown(event) {
    // Ignore if typing in an input field
    if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') return;
    
    switch (event.code) {
        case 'KeyW':
            inputState.forward = true;
            event.preventDefault();
            break;
        case 'KeyS':
            inputState.back = true;
            event.preventDefault();
            break;
        case 'KeyA':
            inputState.left = true;
            event.preventDefault();
            break;
        case 'KeyD':
            inputState.right = true;
            event.preventDefault();
            break;
        case 'KeyQ':
            inputState.turnLeft = true;
            event.preventDefault();
            break;
        case 'KeyE':
            inputState.turnRight = true;
            event.preventDefault();
            break;
        case 'KeyG':
            // Toggle thrust debug visualization
            toggleThrustDebug();
            break;
        case 'KeyV':
            // Toggle sensing debug visualization
            toggleSensingDebug();
            break;
        case 'KeyR':
            // Toggle ML recording
            toggleRecording();
            break;
        case 'KeyI':
            // Toggle AI control
            toggleAiControl();
            break;
        case 'ShiftLeft':
        case 'ShiftRight':
            inputState.shiftHeld = true;
            break;
    }
}

/**
 * Handles key up events
 */
function onKeyUp(event) {
    switch (event.code) {
        case 'KeyW':
            inputState.forward = false;
            break;
        case 'KeyS':
            inputState.back = false;
            break;
        case 'KeyA':
            inputState.left = false;
            break;
        case 'KeyD':
            inputState.right = false;
            break;
        case 'KeyQ':
            inputState.turnLeft = false;
            break;
        case 'KeyE':
            inputState.turnRight = false;
            break;
        case 'ShiftLeft':
        case 'ShiftRight':
            inputState.shiftHeld = false;
            break;
    }
}

/**
 * Handles mouse button down (left-click to fire, right-click to turn toward mouse)
 */
function onMouseDown(event) {
    // Check if arena is active (ships array has items)
    if (!arenaStateRef || arenaStateRef.ships?.length === 0) return;
    
    // Left-click (button 0) to fire
    if (event.button === 0) {
        inputState.fireRequested = true;
    }
    
    // Right-click (button 2) to turn toward mouse
    if (event.button === 2) {
        inputState.rightMouseDown = true;
    }
}

/**
 * Handles mouse button up
 */
function onMouseUp(event) {
    // Right-click released
    if (event.button === 2) {
        inputState.rightMouseDown = false;
    }
}

/**
 * Handles mouse movement for cannon aiming
 */
function onMouseMove(event) {
    if (!screenToWorldFn) return;
    
    const worldPos = screenToWorldFn(event.clientX, event.clientY);
    inputState.mousePosition = { x: worldPos.x, y: worldPos.y };
}

/**
 * Gets current input state (for UI display)
 * @returns {object} Current input state
 */
function getInputState() {
    return { ...inputState };
}

/**
 * Clears the fire request flag (called after fire input is processed)
 */
function clearFireRequest() {
    inputState.fireRequested = false;
}

export {
    setupArenaInput,
    removeArenaInput,
    getInputState,
    clearFireRequest
};
