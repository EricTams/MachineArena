// Firebase module - Firestore integration for sharing fighters
//
// Auto-uploads ship design + model weights at the end of each arena fight.
// Provides read access for the community opponent browser.
//
// AIDEV-NOTE: Firebase config is loaded from window.__FIREBASE_CONFIG
// which is set in index.html. If not configured, all operations silently no-op.

/* global firebase */

import { getPlayerName, sanitizeForDocId } from './naming.js';

const COLLECTION = 'fighters';

// ============================================================================
// Initialization
// ============================================================================

let db = null;
let firebaseReady = false;

/**
 * Initializes Firebase if config is available.
 * Call once at startup. Silently no-ops if Firebase SDK or config is missing.
 */
function initFirebase() {
    if (typeof firebase === 'undefined' || !firebase.apps) {
        console.log('Firebase SDK not loaded - online features disabled');
        return;
    }

    const config = window.__FIREBASE_CONFIG;
    if (!config) {
        console.log('Firebase config not set - online features disabled');
        return;
    }

    try {
        if (firebase.apps.length === 0) {
            firebase.initializeApp(config);
        }
        db = firebase.firestore();
        firebaseReady = true;
        console.log('Firebase initialized');
    } catch (err) {
        console.warn('Firebase init failed:', err.message);
    }
}

/** Returns whether Firebase is available for online features */
function isOnline() {
    return firebaseReady && db !== null;
}

// ============================================================================
// Auto-upload (end of fight)
// ============================================================================

/**
 * Uploads a fighter document to Firestore (fire-and-forget).
 * Called automatically at the end of each arena fight.
 * @param {object} fighterData - { shipName, levelNum, layout, topology, weightSpecs, weightsBase64, modelConfig, schemaVersion }
 */
function uploadFighter(fighterData) {
    if (!isOnline()) return;

    const playerName = getPlayerName();
    if (!playerName) return;

    const sanitized = sanitizeForDocId(playerName);
    const shipSlug = sanitizeForDocId(fighterData.shipName || 'unnamed');
    const docId = `${sanitized}_${shipSlug}_${fighterData.levelNum ?? 0}`;

    const doc = {
        playerName,
        shipName: fighterData.shipName || 'unnamed',
        levelNum: fighterData.levelNum ?? 0,
        layout: fighterData.layout,
        topology: fighterData.topology ?? null,
        weightSpecs: fighterData.weightSpecs ?? null,
        weightsBase64: fighterData.weightsBase64 ?? null,
        modelConfig: fighterData.modelConfig ?? null,
        schemaVersion: fighterData.schemaVersion ?? null,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    // Fire-and-forget: don't await, just log result
    db.collection(COLLECTION).doc(docId).set(doc, { merge: true })
        .then(() => console.log(`Uploaded fighter: ${docId}`))
        .catch(err => console.warn(`Fighter upload failed: ${err.message}`));
}

// ============================================================================
// Community browser (read)
// ============================================================================

/**
 * Fetches all fighters from Firestore for the community browser.
 * Returns lightweight summaries (excludes weight blobs for the list).
 * @returns {Promise<Array>} Array of fighter summaries
 */
async function fetchFighters() {
    if (!isOnline()) return [];

    try {
        const snapshot = await db.collection(COLLECTION)
            .orderBy('updatedAt', 'desc')
            .limit(100)
            .get();

        return snapshot.docs.map(doc => {
            const d = doc.data();
            return {
                docId: doc.id,
                playerName: d.playerName,
                shipName: d.shipName,
                levelNum: d.levelNum,
                hasWeights: !!d.weightsBase64,
                updatedAt: d.updatedAt?.toDate?.() ?? null
            };
        });
    } catch (err) {
        console.warn('Failed to fetch fighters:', err.message);
        return [];
    }
}

/**
 * Fetches a single fighter document by ID (includes weight data).
 * @param {string} docId - Firestore document ID
 * @returns {Promise<object|null>} Full fighter document or null
 */
async function fetchFighter(docId) {
    if (!isOnline()) return null;

    try {
        const doc = await db.collection(COLLECTION).doc(docId).get();
        if (!doc.exists) return null;
        return { docId: doc.id, ...doc.data() };
    } catch (err) {
        console.warn('Failed to fetch fighter:', err.message);
        return null;
    }
}

/**
 * Fetches a random opponent for a given stage from Firestore.
 * Excludes the current player's own entries.
 * @param {number} stageNum - Stage number to query
 * @returns {Promise<object|null>} Full fighter document or null if none found
 */
async function fetchFighterForStage(stageNum) {
    if (!isOnline()) return null;

    const playerName = getPlayerName();

    try {
        const snapshot = await db.collection(COLLECTION)
            .where('levelNum', '==', stageNum)
            .get();

        // Filter out own entries and entries without weights
        const candidates = snapshot.docs.filter(doc => {
            const d = doc.data();
            return d.playerName !== playerName && !!d.weightsBase64;
        });

        if (candidates.length === 0) return null;

        // Pick a random candidate
        const pick = candidates[Math.floor(Math.random() * candidates.length)];
        return { docId: pick.id, ...pick.data() };
    } catch (err) {
        console.warn('Failed to fetch stage opponent:', err.message);
        return null;
    }
}

export {
    initFirebase,
    isOnline,
    uploadFighter,
    fetchFighters,
    fetchFighter,
    fetchFighterForStage
};
