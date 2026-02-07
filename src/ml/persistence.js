// Persistence module - IndexedDB storage for ML training runs and model config
//
// Database: 'MachineArenaML'
// Object stores:
//   'runs'     - training data (sensing + action arrays per run)
//   'metadata' - model config, schema version, etc.

import { SCHEMA_VERSION, SENSING_SIZE, ACTION_SIZE } from './schema.js';

const DB_NAME = 'MachineArenaML';
const DB_VERSION = 1;

// ============================================================================
// Database connection
// ============================================================================

function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('runs')) {
                db.createObjectStore('runs', { keyPath: 'id', autoIncrement: true });
            }
            if (!db.objectStoreNames.contains('metadata')) {
                db.createObjectStore('metadata', { keyPath: 'key' });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(new Error(`IndexedDB open failed: ${request.error}`));
    });
}

// ============================================================================
// Run persistence
// ============================================================================

/**
 * Saves multiple runs to IndexedDB
 * Each run's per-frame arrays are packed into contiguous Float32Arrays
 * @param {Array} runs - Array of { sensing: Float32Array[], action: Float32Array[] }
 */
async function saveRuns(runs) {
    if (runs.length === 0) return 0;
    const db = await openDatabase();
    const tx = db.transaction('runs', 'readwrite');
    const store = tx.objectStore('runs');
    let saved = 0;

    for (const run of runs) {
        const frameCount = run.sensing.length;
        if (frameCount === 0) continue;

        const record = {
            schemaVersion: SCHEMA_VERSION,
            sensingSize: SENSING_SIZE,
            actionSize: ACTION_SIZE,
            frameCount,
            sensing: packFrames(run.sensing, SENSING_SIZE),
            action: packFrames(run.action, ACTION_SIZE),
            timestamp: Date.now()
        };
        store.add(record);
        saved++;
    }

    await txComplete(tx);
    db.close();
    console.log(`Saved ${saved} run(s) to IndexedDB`);
    return saved;
}

/**
 * Loads all runs from IndexedDB, returns unpacked per-frame arrays
 * @returns {Array} Array of { sensing: Float32Array[], action: Float32Array[] }
 */
async function loadRuns() {
    const db = await openDatabase();
    const tx = db.transaction('runs', 'readonly');
    const store = tx.objectStore('runs');
    const records = await getAllRecords(store);
    db.close();

    const runs = [];
    for (const record of records) {
        if (record.schemaVersion !== SCHEMA_VERSION) {
            console.warn(`Skipping run with schema v${record.schemaVersion} (current: v${SCHEMA_VERSION})`);
            continue;
        }
        runs.push({
            sensing: unpackFrames(record.sensing, record.sensingSize, record.frameCount),
            action: unpackFrames(record.action, record.actionSize, record.frameCount)
        });
    }
    console.log(`Loaded ${runs.length} run(s) from IndexedDB`);
    return runs;
}

/** Deletes all saved runs from IndexedDB */
async function clearSavedRuns() {
    const db = await openDatabase();
    const tx = db.transaction('runs', 'readwrite');
    tx.objectStore('runs').clear();
    await txComplete(tx);
    db.close();
    console.log('Cleared all saved runs from IndexedDB');
}

// ============================================================================
// Metadata persistence (model config, etc.)
// ============================================================================

async function saveMetadata(key, value) {
    const db = await openDatabase();
    const tx = db.transaction('metadata', 'readwrite');
    tx.objectStore('metadata').put({ key, value });
    await txComplete(tx);
    db.close();
}

async function loadMetadata(key) {
    const db = await openDatabase();
    const tx = db.transaction('metadata', 'readonly');
    const result = await getRecord(tx.objectStore('metadata'), key);
    db.close();
    return result ? result.value : null;
}

// ============================================================================
// JSON backup (download / upload)
// ============================================================================

/**
 * Downloads all in-memory runs as a JSON file
 * @param {Array} runs - Array of { sensing: Float32Array[], action: Float32Array[] }
 */
function downloadRunsAsJson(runs) {
    const data = {
        schemaVersion: SCHEMA_VERSION,
        sensingSize: SENSING_SIZE,
        actionSize: ACTION_SIZE,
        runs: runs.map(run => ({
            frameCount: run.sensing.length,
            sensing: Array.from(packFrames(run.sensing, SENSING_SIZE)),
            action: Array.from(packFrames(run.action, ACTION_SIZE))
        }))
    };
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ml-training-data-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

/**
 * Parses uploaded JSON and returns runs
 * @param {string} jsonString - JSON content from uploaded file
 * @returns {Array} Array of { sensing: Float32Array[], action: Float32Array[] }
 */
function parseRunsFromJson(jsonString) {
    const data = JSON.parse(jsonString);
    if (data.schemaVersion !== SCHEMA_VERSION) {
        throw new Error(`Schema mismatch: file v${data.schemaVersion}, current v${SCHEMA_VERSION}`);
    }
    return data.runs.map(run => ({
        sensing: unpackFrames(new Float32Array(run.sensing), data.sensingSize, run.frameCount),
        action: unpackFrames(new Float32Array(run.action), data.actionSize, run.frameCount)
    }));
}

// ============================================================================
// Helpers
// ============================================================================

/** Packs array of Float32Arrays into one contiguous Float32Array */
function packFrames(frames, frameSize) {
    const packed = new Float32Array(frames.length * frameSize);
    for (let i = 0; i < frames.length; i++) {
        packed.set(frames[i], i * frameSize);
    }
    return packed;
}

/** Unpacks contiguous Float32Array into array of per-frame Float32Arrays */
function unpackFrames(packed, frameSize, frameCount) {
    const frames = [];
    for (let i = 0; i < frameCount; i++) {
        frames.push(packed.slice(i * frameSize, (i + 1) * frameSize));
    }
    return frames;
}

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
    saveRuns,
    loadRuns,
    clearSavedRuns,
    saveMetadata,
    loadMetadata,
    downloadRunsAsJson,
    parseRunsFromJson
};
