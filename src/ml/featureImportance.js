// Feature importance - gradient-based sensitivity analysis
//
// Computes how much each of the 94 sensing inputs affects model output
// by averaging the absolute gradient of the output sum w.r.t. each input
// across many samples.

/* global tf */

import { SENSING_SIZE } from './schema.js';

/**
 * Computes per-feature importance using gradient magnitude
 * @param {tf.Sequential} model - Trained model
 * @param {tf.Tensor2D} inputData - Sensing data [numSamples, 94]
 * @param {number} maxSamples - Max samples to use (default 1000)
 * @returns {Float32Array} Importance values for each of the 94 features
 */
function computeFeatureImportance(model, inputData, maxSamples = 1000) {
    const numSamples = Math.min(inputData.shape[0], maxSamples);

    const importance = tf.tidy(() => {
        // Take a subset of samples
        const subset = inputData.slice([0, 0], [numSamples, SENSING_SIZE]);

        // Gradient of sum-of-all-outputs w.r.t. input
        const gradFn = tf.grad(x => model.predict(x).sum());
        const grads = gradFn(subset);

        // Mean of absolute gradients across samples → [94]
        return grads.abs().mean(0);
    });

    const values = importance.dataSync();
    importance.dispose();
    return new Float32Array(values);
}

/**
 * Returns top-N most important features sorted by importance
 * @param {Float32Array} importanceValues - Per-feature importance
 * @param {string[]} featureNames - Human-readable names
 * @param {number} topN - Number of top features to return
 * @returns {Array<{ index, name, importance }>}
 */
function getTopFeatures(importanceValues, featureNames, topN = 20) {
    const indexed = Array.from(importanceValues)
        .map((val, idx) => ({ index: idx, name: featureNames[idx], importance: val }));
    indexed.sort((a, b) => b.importance - a.importance);
    return indexed.slice(0, topN);
}

export { computeFeatureImportance, getTopFeatures };
