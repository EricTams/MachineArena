// Model module - TF.js model creation, training, evaluation, and weight persistence
//
// Uses a config-driven dense network. Output uses sigmoid activation so
// all values are in [0,1]. Continuous action channels (leads + residual)
// are scaled from [-1,1] to [0,1] for training and back for inference.

/* global tf */

import {
    SCHEMA_VERSION, SENSING_SIZE, ACTION_SIZE,
    DISCRETE_ACTION_INDICES, CONTINUOUS_ACTION_INDICES, ACTION_NAMES
} from './schema.js';
import { saveMetadata, loadMetadata } from './persistence.js';

const MODEL_IDB_KEY = 'indexeddb://machine-arena-model';
const CONFIG_META_KEY = 'modelConfig';

// ============================================================================
// Default config
// ============================================================================

const DEFAULT_MODEL_CONFIG = {
    inputSize: SENSING_SIZE,
    actionSize: ACTION_SIZE,
    hidden: [64, 64],
    activation: 'relu',
    learningRate: 0.001,
    epochs: 50,
    batchSize: 32,
    valRunFraction: 0.2
};

/** Returns a fresh copy of the default config */
function getDefaultConfig() {
    return { ...DEFAULT_MODEL_CONFIG, hidden: [...DEFAULT_MODEL_CONFIG.hidden] };
}

// ============================================================================
// Model creation
// ============================================================================

/**
 * Creates a TF.js sequential model from config
 * @param {object} config - Model config (inputSize, actionSize, hidden, activation)
 * @returns {tf.Sequential} Compiled model
 */
function createModel(config) {
    const model = tf.sequential();

    // Hidden layers
    for (let i = 0; i < config.hidden.length; i++) {
        const layerConfig = {
            units: config.hidden[i],
            activation: config.activation
        };
        if (i === 0) layerConfig.inputShape = [config.inputSize];
        model.add(tf.layers.dense(layerConfig));
    }

    // Output layer - sigmoid keeps all values in [0, 1]
    model.add(tf.layers.dense({
        units: config.actionSize,
        activation: 'sigmoid'
    }));

    model.compile({
        optimizer: tf.train.adam(config.learningRate),
        loss: 'meanSquaredError'
    });

    return model;
}

// ============================================================================
// Data preparation
// ============================================================================

/**
 * Splits runs into train/val and converts to tensors
 * Splits by run (not by frame) for proper generalization
 * @param {Array} runs - Array of { sensing: Float32Array[], action: Float32Array[] }
 * @param {number} valFraction - Fraction of runs for validation (default 0.2)
 * @returns {{ train: {x, y, numFrames}, val: {x, y, numFrames} }}
 */
function prepareTrainingData(runs, valFraction = 0.2) {
    if (runs.length === 0) throw new Error('No training data');

    // Shuffle runs and split
    const shuffled = [...runs].sort(() => Math.random() - 0.5);
    const valCount = Math.max(1, Math.round(shuffled.length * valFraction));
    const valRuns = shuffled.slice(0, valCount);
    const trainRuns = shuffled.slice(valCount);

    // AIDEV-NOTE: If only 1 run, use it for both train and val
    if (trainRuns.length === 0) trainRuns.push(...valRuns);

    return {
        train: runsToTensors(trainRuns),
        val: runsToTensors(valRuns)
    };
}

/** Packs runs into { x: Tensor2D, y: Tensor2D, numFrames } */
function runsToTensors(runs) {
    const allSense = [];
    const allAction = [];

    for (const run of runs) {
        for (let i = 0; i < run.sensing.length; i++) {
            allSense.push(new Float32Array(run.sensing[i]));
            allAction.push(scaleActionForTraining(run.action[i]));
        }
    }

    const numFrames = allSense.length;
    const senseFlat = new Float32Array(numFrames * SENSING_SIZE);
    const actionFlat = new Float32Array(numFrames * ACTION_SIZE);

    for (let i = 0; i < numFrames; i++) {
        senseFlat.set(allSense[i], i * SENSING_SIZE);
        actionFlat.set(allAction[i], i * ACTION_SIZE);
    }

    return {
        x: tf.tensor2d(senseFlat, [numFrames, SENSING_SIZE]),
        y: tf.tensor2d(actionFlat, [numFrames, ACTION_SIZE]),
        numFrames
    };
}

/** Scales continuous action channels from [-1,1] to [0,1] for training */
function scaleActionForTraining(action) {
    const scaled = new Float32Array(action);
    for (const idx of CONTINUOUS_ACTION_INDICES) {
        scaled[idx] = (action[idx] + 1) / 2;
    }
    return scaled;
}

// ============================================================================
// Class weights and composite loss
// ============================================================================

const MAX_CLASS_WEIGHT = 100;

/**
 * Computes positive-class weights for each discrete action from training labels.
 * Rare actions (like fire) get higher weight so the loss penalizes missing them.
 * @param {tf.Tensor2D} yTensor - Training labels [numFrames, ACTION_SIZE]
 * @returns {Float32Array} Weight per discrete action, clamped to [1, MAX_CLASS_WEIGHT]
 */
function computeClassWeights(yTensor) {
    const labels = yTensor.arraySync();
    const n = labels.length;
    const numDiscrete = DISCRETE_ACTION_INDICES.length;
    const weights = new Float32Array(numDiscrete);

    for (let d = 0; d < numDiscrete; d++) {
        const idx = DISCRETE_ACTION_INDICES[d];
        let posCount = 0;
        for (let i = 0; i < n; i++) {
            if (labels[i][idx] >= 0.5) posCount++;
        }
        // AIDEV-NOTE: weight = negCount / posCount. Balances positive vs negative
        // contribution since only the positive class is re-weighted (negative stays 1).
        const negCount = n - posCount;
        const raw = posCount > 0 ? negCount / posCount : MAX_CLASS_WEIGHT;
        weights[d] = Math.min(MAX_CLASS_WEIGHT, Math.max(1, raw));
    }

    return weights;
}

/**
 * Builds a composite loss: weighted BCE for discrete actions, MSE for continuous.
 * Returns the loss function and a dispose callback for the internal weight tensor.
 * @param {Float32Array} classWeights - Per discrete action positive-class weights
 * @returns {{ loss: function, dispose: function }}
 */
function buildCompositeLoss(classWeights) {
    const posWeightTensor = tf.tensor1d(classWeights);
    const numDiscrete = DISCRETE_ACTION_INDICES.length;
    const numContinuous = CONTINUOUS_ACTION_INDICES.length;

    const loss = (yTrue, yPred) => {
        // Discrete channels: weighted binary cross-entropy
        const dTrue = yTrue.slice([0, 0], [-1, numDiscrete]);
        const dPred = yPred.slice([0, 0], [-1, numDiscrete]).clipByValue(1e-7, 1 - 1e-7);
        const bce = dTrue.mul(dPred.log())
            .add(tf.sub(1, dTrue).mul(tf.sub(1, dPred).log()))
            .neg();
        // Per-sample weight: y*(w-1)+1 → positive gets posWeight, negative gets 1
        const sampleWeights = dTrue.mul(posWeightTensor.sub(1)).add(1);
        const bceLoss = bce.mul(sampleWeights).mean();

        // Continuous channels: MSE
        const cTrue = yTrue.slice([0, numDiscrete], [-1, numContinuous]);
        const cPred = yPred.slice([0, numDiscrete], [-1, numContinuous]);
        const mseLoss = cTrue.sub(cPred).square().mean();

        return bceLoss.add(mseLoss);
    };

    const dispose = () => posWeightTensor.dispose();
    return { loss, dispose };
}

/** Logs computed class weights to console for debugging */
function logClassWeights(weights) {
    const lines = DISCRETE_ACTION_INDICES.map((idx, i) =>
        `${ACTION_NAMES[idx]}: ${weights[i].toFixed(1)}`
    );
    console.log('Class weights:', lines.join(', '));
}

// ============================================================================
// Training
// ============================================================================

/**
 * Trains the model on prepared data using weighted BCE + MSE composite loss.
 * Automatically computes class weights from training labels so rare actions
 * (like fire) are properly learned.
 * @param {tf.Sequential} model - The model to train
 * @param {{ train, val }} data - From prepareTrainingData
 * @param {object} config - Training config (epochs, batchSize, learningRate)
 * @param {function} onEpochEnd - Callback(epoch, logs) for progress
 * @returns {tf.History} Training history
 */
async function trainModel(model, data, config, onEpochEnd) {
    const classWeights = computeClassWeights(data.train.y);
    logClassWeights(classWeights);

    // Compile with composite loss for training
    const { loss, dispose } = buildCompositeLoss(classWeights);
    model.compile({
        optimizer: tf.train.adam(config.learningRate),
        loss
    });

    try {
        const history = await model.fit(data.train.x, data.train.y, {
            epochs: config.epochs,
            batchSize: config.batchSize,
            validationData: [data.val.x, data.val.y],
            shuffle: true,
            callbacks: onEpochEnd ? { onEpochEnd } : undefined
        });
        return history;
    } finally {
        // Re-compile with named loss so saved models don't carry closure references
        model.compile({
            optimizer: tf.train.adam(config.learningRate),
            loss: 'meanSquaredError'
        });
        dispose();
    }
}

// ============================================================================
// Evaluation
// ============================================================================

/**
 * Evaluates model on validation data, returns per-action accuracy,
 * precision, recall, and aim MSE.
 * @param {tf.Sequential} model
 * @param {{ x, y }} valData
 * @returns {{ discreteAccuracies, discretePrecision, discreteRecall, aimMSE, overallAccuracy }}
 */
function evaluateModel(model, valData) {
    return tf.tidy(() => {
        const preds = model.predict(valData.x);
        const predArr = preds.arraySync();
        const actualArr = valData.y.arraySync();
        const n = predArr.length;

        // Per-action discrete metrics: accuracy, precision, recall
        const discreteAccuracies = {};
        const discretePrecision = {};
        const discreteRecall = {};
        for (const idx of DISCRETE_ACTION_INDICES) {
            const m = countDiscreteOutcomes(predArr, actualArr, n, idx);
            const name = ACTION_NAMES[idx];
            discreteAccuracies[name] = m.correct / n;
            discretePrecision[name] = m.predPos > 0 ? m.truePos / m.predPos : null;
            discreteRecall[name] = m.actualPos > 0 ? m.truePos / m.actualPos : null;
        }

        // Aim MSE (on scaled [0,1] values)
        let aimSumSq = 0;
        let aimCount = 0;
        for (const idx of CONTINUOUS_ACTION_INDICES) {
            for (let i = 0; i < n; i++) {
                const diff = predArr[i][idx] - actualArr[i][idx];
                aimSumSq += diff * diff;
                aimCount++;
            }
        }
        const aimMSE = aimCount > 0 ? aimSumSq / aimCount : 0;

        const overallAccuracy = Object.values(discreteAccuracies)
            .reduce((a, b) => a + b, 0) / DISCRETE_ACTION_INDICES.length;

        return { discreteAccuracies, discretePrecision, discreteRecall, aimMSE, overallAccuracy };
    });
}

/** Counts TP, predicted positives, actual positives, and correct for one discrete action */
function countDiscreteOutcomes(predArr, actualArr, n, actionIdx) {
    let correct = 0, truePos = 0, predPos = 0, actualPos = 0;
    for (let i = 0; i < n; i++) {
        const pred = predArr[i][actionIdx] >= 0.5 ? 1 : 0;
        const actual = Math.round(actualArr[i][actionIdx]);
        if (pred === actual) correct++;
        if (pred === 1 && actual === 1) truePos++;
        if (pred === 1) predPos++;
        if (actual === 1) actualPos++;
    }
    return { correct, truePos, predPos, actualPos };
}

// ============================================================================
// Model persistence (TF.js IndexedDB + our metadata)
// ============================================================================

/**
 * Saves model weights to IndexedDB and config to metadata
 * @param {tf.Sequential} model
 * @param {object} config - The config used to create this model
 * @param {object} [stats] - Optional training stats to persist
 * @param {number} [stats.newFrames] - Frames trained in this session (added to cumulative total)
 */
async function saveModelWeights(model, config, stats) {
    await model.save(MODEL_IDB_KEY);

    // Accumulate total frames trained across sessions
    let totalFramesTrained = 0;
    const existingMeta = await loadMetadata(CONFIG_META_KEY);
    if (existingMeta && existingMeta.totalFramesTrained) {
        totalFramesTrained = existingMeta.totalFramesTrained;
    }
    if (stats && stats.newFrames) {
        totalFramesTrained += stats.newFrames;
    }

    await saveMetadata(CONFIG_META_KEY, {
        config,
        schemaVersion: SCHEMA_VERSION,
        savedAt: Date.now(),
        totalFramesTrained
    });
    console.log(`Model weights saved (total frames trained: ${totalFramesTrained})`);
}

/**
 * Loads model from IndexedDB, verifies schema compatibility
 * @returns {{ model: tf.Sequential, config: object, totalFramesTrained: number } | null}
 */
async function loadModelWeights() {
    const meta = await loadMetadata(CONFIG_META_KEY);
    if (!meta) {
        console.warn('No saved model config found');
        return null;
    }
    if (meta.schemaVersion !== SCHEMA_VERSION) {
        console.warn(`Model schema v${meta.schemaVersion} incompatible with current v${SCHEMA_VERSION}`);
        return null;
    }

    try {
        const model = await tf.loadLayersModel(MODEL_IDB_KEY);
        model.compile({
            optimizer: tf.train.adam(meta.config.learningRate),
            loss: 'meanSquaredError'
        });
        console.log('Model loaded from IndexedDB');
        return { model, config: meta.config, totalFramesTrained: meta.totalFramesTrained || 0 };
    } catch (err) {
        console.warn('Failed to load model from IndexedDB:', err.message);
        return null;
    }
}

/**
 * Loads just the model metadata (no model weights) for quick status checks.
 * @returns {{ totalFramesTrained: number, savedAt: number } | null}
 */
async function getModelStats() {
    const meta = await loadMetadata(CONFIG_META_KEY);
    if (!meta || meta.schemaVersion !== SCHEMA_VERSION) return null;
    return {
        totalFramesTrained: meta.totalFramesTrained || 0,
        savedAt: meta.savedAt || 0
    };
}

// ============================================================================
// Portable weight export / import (JSON-friendly)
// ============================================================================

/**
 * Exports a TF.js model to a JSON-friendly object (topology + base64 weights).
 * The resulting object can be stored in Firestore or saved to IndexedDB as-is.
 * @param {tf.Sequential} model - Trained model
 * @param {object} config - Model config used to create/train this model
 * @returns {Promise<object>} { topology, weightsBase64, config, schemaVersion }
 */
async function exportModelAsJson(model, config) {
    // model.toJSON() returns a JSON string; parse it so we store a plain object
    const topology = JSON.parse(model.toJSON());

    // Extract raw weight data as a single concatenated ArrayBuffer
    const saveResult = await model.save(tf.io.withSaveHandler(async (artifacts) => {
        return { modelArtifactsInfo: { dateSaved: new Date() }, ...artifacts };
    }));

    // The weightData is an ArrayBuffer; encode as base64 for JSON compatibility
    const weightData = saveResult.weightData;
    const weightsBase64 = arrayBufferToBase64(weightData);

    return {
        topology,
        weightSpecs: saveResult.weightSpecs,
        weightsBase64,
        config,
        schemaVersion: SCHEMA_VERSION
    };
}

/**
 * Reconstructs a TF.js model from a portable JSON export.
 * @param {object} exported - Object from exportModelAsJson
 * @returns {Promise<{ model: tf.Sequential, config: object }>}
 */
async function importModelFromJson(exported) {
    if (exported.schemaVersion !== SCHEMA_VERSION) {
        throw new Error(
            `Schema mismatch: export v${exported.schemaVersion}, current v${SCHEMA_VERSION}`
        );
    }

    const weightData = base64ToArrayBuffer(exported.weightsBase64);

    // topology may be a JSON string (from model.toJSON()) or a parsed object
    const topologyObj = typeof exported.topology === 'string'
        ? JSON.parse(exported.topology)
        : exported.topology;

    const model = await tf.loadLayersModel(tf.io.fromMemory(
        topologyObj,
        exported.weightSpecs,
        weightData
    ));

    const lr = exported.config?.learningRate ?? DEFAULT_MODEL_CONFIG.learningRate;
    model.compile({
        optimizer: tf.train.adam(lr),
        loss: 'meanSquaredError'
    });

    return { model, config: exported.config };
}

// ============================================================================
// Base64 helpers
// ============================================================================

function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
}

// ============================================================================
// Cleanup helpers
// ============================================================================

/** Disposes tensors in training data */
function disposeTrainingData(data) {
    if (data.train) {
        data.train.x.dispose();
        data.train.y.dispose();
    }
    if (data.val) {
        data.val.x.dispose();
        data.val.y.dispose();
    }
}

export {
    DEFAULT_MODEL_CONFIG,
    getDefaultConfig,
    createModel,
    prepareTrainingData,
    trainModel,
    evaluateModel,
    saveModelWeights,
    loadModelWeights,
    getModelStats,
    exportModelAsJson,
    importModelFromJson,
    disposeTrainingData
};
