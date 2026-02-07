// Ship persistence - IndexedDB storage for saved ship designs + weights
//
// Uses a separate database from the ML training data to keep concerns clean.
// Each saved fighter bundles the ship layout with its trained model weights.

import { getPlayerName } from './naming.js';
import { loadModelWeights, exportModelAsJson } from './ml/model.js';

const DB_NAME = 'MachineArenaShips';
const DB_VERSION = 1;
const STORE_NAME = 'savedShips';

// ============================================================================
// Database connection
// ============================================================================

function openShipDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
                store.createIndex('shipName', 'shipName', { unique: false });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(new Error(`Ship DB open failed: ${request.error}`));
    });
}

// ============================================================================
// Save / Load / Delete
// ============================================================================

/**
 * Saves a ship design + current model weights to IndexedDB.
 * @param {string} shipName - Display name for this ship
 * @param {Array} layout - Ship layout array
 * @returns {Promise<number>} The saved record ID
 */
async function saveShip(shipName, layout) {
    const playerName = getPlayerName() || 'Unknown';

    // Try to bundle current model weights (may be null if no model trained)
    let weightData = null;
    const loaded = await loadModelWeights();
    if (loaded) {
        try {
            weightData = await exportModelAsJson(loaded.model, loaded.config);
        } catch (err) {
            console.warn('Could not export model weights for save:', err.message);
        }
    }

    const record = {
        shipName,
        playerName,
        layout: layout.map(item => ({ ...item })),
        topology: weightData?.topology ?? null,
        weightSpecs: weightData?.weightSpecs ?? null,
        weightsBase64: weightData?.weightsBase64 ?? null,
        modelConfig: weightData?.config ?? null,
        schemaVersion: weightData?.schemaVersion ?? null,
        timestamp: Date.now()
    };

    const db = await openShipDatabase();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    const id = await new Promise((resolve, reject) => {
        const req = store.add(record);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });

    await txComplete(tx);
    db.close();
    console.log(`Saved ship "${shipName}" (id: ${id})`);
    return id;
}

/**
 * Loads all saved ships (lightweight - no weight blobs, just metadata + layout).
 * @returns {Promise<Array>} Array of saved ship records
 */
async function listSavedShips() {
    const db = await openShipDatabase();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const records = await getAllRecords(store);
    db.close();

    // Return lightweight summaries (exclude large weight blobs)
    return records.map(r => ({
        id: r.id,
        shipName: r.shipName,
        playerName: r.playerName,
        layout: r.layout,
        hasWeights: !!r.weightsBase64,
        timestamp: r.timestamp
    }));
}

/**
 * Loads a full saved ship record by ID (including weight data).
 * @param {number} id - Record ID
 * @returns {Promise<object|null>} Full ship record or null
 */
async function loadSavedShip(id) {
    const db = await openShipDatabase();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const record = await getRecord(store, id);
    db.close();
    return record ?? null;
}

/**
 * Deletes a saved ship by ID.
 * @param {number} id - Record ID
 */
async function deleteSavedShip(id) {
    const db = await openShipDatabase();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    await txComplete(tx);
    db.close();
    console.log(`Deleted saved ship (id: ${id})`);
}

// ============================================================================
// Helpers
// ============================================================================

function txComplete(tx) {
    return new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
    });
}

function getAllRecords(store) {
    return new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function getRecord(store, key) {
    return new Promise((resolve, reject) => {
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export {
    saveShip,
    listSavedShips,
    loadSavedShip,
    deleteSavedShip
};
