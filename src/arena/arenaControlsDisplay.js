// Arena controls display - shows player input state in real-time

// DOM element references
let panelElement = null;
let controlElements = {};

// Control definitions: maps input state keys to display info
const CONTROLS = {
    // Movement
    forward: { key: 'W', name: 'Forward', section: 'movement' },
    back: { key: 'S', name: 'Back', section: 'movement' },
    left: { key: 'A', name: 'Left', section: 'movement' },
    right: { key: 'D', name: 'Right', section: 'movement' },
    // Rotation
    turnLeft: { key: 'Q', name: 'Turn L', section: 'rotation' },
    turnRight: { key: 'E', name: 'Turn R', section: 'rotation' },
    // Mouse
    fireRequested: { key: 'LMB', name: 'Fire', section: 'mouse' },
    rightMouseDown: { key: 'RMB', name: 'Turn To', section: 'mouse' },
    // Modifier
    shiftHeld: { key: 'Shift', name: 'Fast Turn', section: 'modifier' }
};

// Section display names
const SECTIONS = {
    movement: 'Movement',
    rotation: 'Rotation',
    mouse: 'Mouse',
    modifier: 'Modifier'
};

/**
 * Initializes the arena controls display
 */
function initArenaControlsDisplay() {
    panelElement = document.getElementById('arena-controls-panel');
    if (!panelElement) {
        console.warn('Arena controls panel element not found');
        return;
    }
    
    // Build the panel content
    buildPanelContent();
    
    // Show the panel
    panelElement.classList.add('visible');
    console.log('Arena controls display initialized');
}

/**
 * Builds the panel DOM structure
 */
function buildPanelContent() {
    // Clear existing content
    panelElement.innerHTML = '';
    controlElements = {};
    
    // Add title
    const title = document.createElement('h4');
    title.textContent = 'Controls';
    panelElement.appendChild(title);
    
    // Create grid container
    const grid = document.createElement('div');
    grid.className = 'controls-grid';
    
    // Group controls by section
    const sections = {};
    for (const [stateKey, control] of Object.entries(CONTROLS)) {
        if (!sections[control.section]) {
            sections[control.section] = [];
        }
        sections[control.section].push({ stateKey, ...control });
    }
    
    // Create section elements
    for (const [sectionKey, controls] of Object.entries(sections)) {
        const sectionDiv = document.createElement('div');
        sectionDiv.className = 'controls-section';
        
        // Section title
        const sectionTitle = document.createElement('div');
        sectionTitle.className = 'controls-section-title';
        sectionTitle.textContent = SECTIONS[sectionKey];
        sectionDiv.appendChild(sectionTitle);
        
        // Control rows
        for (const control of controls) {
            const row = document.createElement('div');
            row.className = 'control-row';
            
            const nameSpan = document.createElement('span');
            nameSpan.className = 'control-name';
            nameSpan.textContent = control.name;
            
            const keySpan = document.createElement('span');
            keySpan.className = 'control-key';
            keySpan.textContent = control.key;
            
            row.appendChild(nameSpan);
            row.appendChild(keySpan);
            sectionDiv.appendChild(row);
            
            // Store reference for updates
            controlElements[control.stateKey] = keySpan;
        }
        
        grid.appendChild(sectionDiv);
    }
    
    panelElement.appendChild(grid);
}

/**
 * Updates the controls display based on current input state
 * @param {object} inputState - Current input state from arenaInput
 */
function updateArenaControlsDisplay(inputState) {
    if (!panelElement) return;
    
    for (const [stateKey, element] of Object.entries(controlElements)) {
        const isActive = inputState[stateKey];
        if (isActive) {
            element.classList.add('active');
        } else {
            element.classList.remove('active');
        }
    }
}

/**
 * Cleans up and hides the controls display
 */
function cleanupArenaControlsDisplay() {
    if (panelElement) {
        panelElement.classList.remove('visible');
        panelElement.innerHTML = '';
    }
    controlElements = {};
}

export {
    initArenaControlsDisplay,
    updateArenaControlsDisplay,
    cleanupArenaControlsDisplay
};
