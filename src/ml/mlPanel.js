// ML Panel - UI controls for recording, training, persistence, and diagnostics
//
// Creates a fixed-position panel (toggled with M key) that provides:
// - Recording status and data stats
// - Save/Load/Clear data buttons
// - Training controls (config, train, progress)
// - Metrics display (per-action accuracy, aim MSE)
// - Model save/load
// - Feature importance display

import { isRecording, getRunCount, getTotalFrames, getCompletedRuns, clearRuns, importRuns } from './recording.js';
import { saveRuns, loadRuns, clearSavedRuns, downloadRunsAsJson, parseRunsFromJson } from './persistence.js';
import {
    getDefaultConfig, createModel, prepareTrainingData,
    trainModel, evaluateModel, saveModelWeights, loadModelWeights,
    disposeTrainingData
} from './model.js';
import { computeFeatureImportance, getTopFeatures } from './featureImportance.js';
import { SENSING_FEATURE_NAMES, ACTION_NAMES, DISCRETE_ACTION_INDICES } from './schema.js';
import { switchToAiControl, switchToPlayerControl, isAiControlled } from '../arena/arena.js';

let panelEl = null;
let visible = false;
let currentModel = null;
let currentConfig = null;
let lastTrainedFrames = 0;

// ============================================================================
// Panel lifecycle
// ============================================================================

function initMlPanel() {
    if (panelEl) return;
    injectStyles();
    panelEl = createPanelDOM();
    document.body.appendChild(panelEl);
    setupEvents();
    refreshDisplay();
}

function showMlPanel() {
    initMlPanel();
    visible = true;
    panelEl.classList.add('visible');
    refreshDisplay();
}

function hideMlPanel() {
    if (!panelEl) return;
    visible = false;
    panelEl.classList.remove('visible');
}

function toggleMlPanel() {
    if (visible) hideMlPanel();
    else showMlPanel();
}

function isMlPanelVisible() {
    return visible;
}

function cleanupMlPanel() {
    hideMlPanel();
}

// ============================================================================
// DOM creation
// ============================================================================

function createPanelDOM() {
    const panel = document.createElement('div');
    panel.id = 'ml-panel';
    panel.innerHTML = `
        <h4>ML Training</h4>
        <div class="ml-section">
            <div class="ml-section-title">Recording</div>
            <div class="ml-row">
                <span id="ml-rec-status">Idle</span>
                <span class="ml-hint">[R] toggle</span>
            </div>
            <div class="ml-row">
                <span class="ml-label">Runs:</span>
                <span id="ml-run-count">0</span>
                <span class="ml-label" style="margin-left:8px">Frames:</span>
                <span id="ml-frame-count">0</span>
            </div>
        </div>
        <div class="ml-section">
            <div class="ml-section-title">Data</div>
            <div class="ml-btn-row">
                <button class="ml-btn" id="ml-save-data">Save</button>
                <button class="ml-btn" id="ml-load-data">Load</button>
                <button class="ml-btn ml-btn-danger" id="ml-clear-data">Clear</button>
                <button class="ml-btn" id="ml-download-data">Export</button>
            </div>
        </div>
        <div class="ml-section">
            <div class="ml-section-title">Model Config</div>
            <div class="ml-row">
                <span class="ml-label">Hidden:</span>
                <input type="text" id="ml-hidden" class="ml-input" value="64, 64" />
            </div>
            <div class="ml-row">
                <span class="ml-label">Epochs:</span>
                <input type="number" id="ml-epochs" class="ml-input ml-input-sm" value="50" min="1" />
                <span class="ml-label" style="margin-left:6px">LR:</span>
                <input type="text" id="ml-lr" class="ml-input ml-input-sm" value="0.001" />
            </div>
        </div>
        <div class="ml-section">
            <div class="ml-btn-row">
                <button class="ml-btn ml-btn-primary" id="ml-train">Train</button>
                <button class="ml-btn" id="ml-save-model">Save Model</button>
                <button class="ml-btn" id="ml-load-model">Load Model</button>
            </div>
            <div id="ml-progress" class="ml-progress" style="display:none">
                <div id="ml-progress-bar" class="ml-progress-bar"></div>
            </div>
            <div id="ml-train-status" class="ml-status"></div>
        </div>
        <div class="ml-section" id="ml-metrics-section" style="display:none">
            <div class="ml-section-title">Metrics</div>
            <div id="ml-metrics"></div>
        </div>
        <div class="ml-section">
            <button class="ml-btn" id="ml-importance">Feature Importance</button>
            <div id="ml-importance-display" style="display:none"></div>
        </div>
        <div class="ml-section">
            <div class="ml-section-title">AI Control</div>
            <div class="ml-row">
                <button class="ml-btn" id="ml-ai-toggle">Enable AI</button>
                <span id="ml-ai-status" class="ml-label">OFF</span>
                <span class="ml-hint">[I] toggle</span>
            </div>
        </div>
    `;
    return panel;
}

// ============================================================================
// Event handlers
// ============================================================================

function setupEvents() {
    qs('#ml-save-data').addEventListener('click', onSaveData);
    qs('#ml-load-data').addEventListener('click', onLoadData);
    qs('#ml-clear-data').addEventListener('click', onClearData);
    qs('#ml-download-data').addEventListener('click', onDownloadData);
    qs('#ml-train').addEventListener('click', onTrain);
    qs('#ml-save-model').addEventListener('click', onSaveModel);
    qs('#ml-load-model').addEventListener('click', onLoadModel);
    qs('#ml-importance').addEventListener('click', onFeatureImportance);
    qs('#ml-ai-toggle').addEventListener('click', onToggleAiControl);
}

async function onSaveData() {
    const runs = getCompletedRuns();
    if (runs.length === 0) return setStatus('No runs to save');
    setStatus('Saving...');
    await saveRuns(runs);
    setStatus(`Saved ${runs.length} run(s)`);
}

async function onLoadData() {
    setStatus('Loading...');
    const runs = await loadRuns();
    if (runs.length === 0) return setStatus('No saved runs found');
    importRuns(runs);
    refreshDisplay();
    setStatus(`Loaded ${runs.length} run(s)`);
}

async function onClearData() {
    clearRuns();
    await clearSavedRuns();
    refreshDisplay();
    setStatus('All data cleared');
}

function onDownloadData() {
    const runs = getCompletedRuns();
    if (runs.length === 0) return setStatus('No runs to export');
    downloadRunsAsJson(runs);
    setStatus('Exported to file');
}

async function onTrain() {
    const runs = getCompletedRuns();
    if (runs.length === 0) return setStatus('No training data. Record some runs first.');

    const config = readConfigFromUI();
    currentConfig = config;

    setStatus('Preparing data...');
    showProgress(0);

    let data;
    try {
        data = prepareTrainingData(runs, config.valRunFraction);
    } catch (err) {
        return setStatus(`Data error: ${err.message}`);
    }

    setStatus(`Training on ${data.train.numFrames} frames (val: ${data.val.numFrames})...`);
    lastTrainedFrames = data.train.numFrames;
    currentModel = createModel(config);

    try {
        await trainModel(currentModel, data, config, (epoch, logs) => {
            const pct = ((epoch + 1) / config.epochs) * 100;
            showProgress(pct);
            setStatus(`Epoch ${epoch + 1}/${config.epochs} — loss: ${logs.loss.toFixed(4)}, val_loss: ${logs.val_loss.toFixed(4)}`);
        });

        // Evaluate
        const metrics = evaluateModel(currentModel, data.val);
        displayMetrics(metrics);
        setStatus('Training complete');
    } catch (err) {
        setStatus(`Training error: ${err.message}`);
    } finally {
        hideProgress();
        disposeTrainingData(data);
    }
}

async function onSaveModel() {
    if (!currentModel) return setStatus('No model to save. Train first.');
    setStatus('Saving model...');
    await saveModelWeights(currentModel, currentConfig, { newFrames: lastTrainedFrames });
    setStatus('Model saved');
}

async function onLoadModel() {
    setStatus('Loading model...');
    const result = await loadModelWeights();
    if (!result) return setStatus('No compatible model found');
    currentModel = result.model;
    currentConfig = result.config;
    applyConfigToUI(currentConfig);
    setStatus('Model loaded');
}

async function onFeatureImportance() {
    if (!currentModel) return setStatus('No model. Train or load one first.');
    const runs = getCompletedRuns();
    if (runs.length === 0) return setStatus('No data for importance analysis');

    setStatus('Computing feature importance...');

    // Build a sensing tensor from all runs (up to 1000 frames)
    let data;
    try {
        data = prepareTrainingData(runs, 0);
    } catch (err) {
        return setStatus(`Data error: ${err.message}`);
    }

    try {
        const importance = computeFeatureImportance(currentModel, data.train.x);
        const top = getTopFeatures(importance, SENSING_FEATURE_NAMES, 20);
        displayImportance(top);
        setStatus('Feature importance computed');
    } catch (err) {
        setStatus(`Importance error: ${err.message}`);
    } finally {
        disposeTrainingData(data);
    }
}

// ============================================================================
// AI Control
// ============================================================================

async function onToggleAiControl() {
    await toggleAiControl();
}

/**
 * Toggles between player and AI control
 * Loads model from IndexedDB if no model is in memory
 */
async function toggleAiControl() {
    if (isAiControlled()) {
        switchToPlayerControl();
        refreshAiDisplay();
        setStatus('Switched to player control');
        return;
    }

    // Need a model -- try in-memory first, then IndexedDB
    if (!currentModel) {
        setStatus('Loading model for AI...');
        const result = await loadModelWeights();
        if (!result) {
            setStatus('No model found. Train or load one first.');
            return;
        }
        currentModel = result.model;
        currentConfig = result.config;
        applyConfigToUI(currentConfig);
    }

    const success = switchToAiControl(currentModel);
    refreshAiDisplay();
    setStatus(success ? 'AI control enabled' : 'Failed to enable AI control');
}

function refreshAiDisplay() {
    const btn = qs('#ml-ai-toggle');
    const status = qs('#ml-ai-status');
    const active = isAiControlled();
    if (btn) btn.textContent = active ? 'Disable AI' : 'Enable AI';
    if (status) {
        status.textContent = active ? 'ON' : 'OFF';
        status.style.color = active ? '#48bb78' : '';
    }
}

// ============================================================================
// Config UI helpers
// ============================================================================

function readConfigFromUI() {
    const config = getDefaultConfig();
    const hiddenStr = qs('#ml-hidden').value;
    config.hidden = hiddenStr.split(',').map(s => parseInt(s.trim(), 10)).filter(n => n > 0);
    if (config.hidden.length === 0) config.hidden = [64];
    config.epochs = parseInt(qs('#ml-epochs').value, 10) || 50;
    config.learningRate = parseFloat(qs('#ml-lr').value) || 0.001;
    return config;
}

function applyConfigToUI(config) {
    qs('#ml-hidden').value = config.hidden.join(', ');
    qs('#ml-epochs').value = config.epochs;
    qs('#ml-lr').value = config.learningRate;
}

// ============================================================================
// Display helpers
// ============================================================================

function refreshDisplay() {
    if (!panelEl) return;
    const recStatus = qs('#ml-rec-status');
    if (recStatus) {
        recStatus.textContent = isRecording() ? 'RECORDING' : 'Idle';
        recStatus.className = isRecording() ? 'ml-rec-active' : '';
    }
    const runCount = qs('#ml-run-count');
    if (runCount) runCount.textContent = getRunCount();
    const frameCount = qs('#ml-frame-count');
    if (frameCount) frameCount.textContent = getTotalFrames();
    refreshAiDisplay();
}

function setStatus(msg) {
    const el = qs('#ml-train-status');
    if (el) el.textContent = msg;
}

function showProgress(pct) {
    const container = qs('#ml-progress');
    const bar = qs('#ml-progress-bar');
    if (container) container.style.display = '';
    if (bar) bar.style.width = `${pct}%`;
}

function hideProgress() {
    const container = qs('#ml-progress');
    if (container) container.style.display = 'none';
}

function displayMetrics(metrics) {
    const section = qs('#ml-metrics-section');
    const el = qs('#ml-metrics');
    if (!section || !el) return;
    section.style.display = '';

    let html = `<div class="ml-row"><span class="ml-label">Overall accuracy:</span> <strong>${(metrics.overallAccuracy * 100).toFixed(1)}%</strong></div>`;
    html += `<div class="ml-row"><span class="ml-label">Aim MSE:</span> <strong>${metrics.aimMSE.toFixed(4)}</strong></div>`;
    html += '<div class="ml-section-title" style="margin-top:6px">Per-action: Acc (Precision / Recall)</div>';
    for (const idx of DISCRETE_ACTION_INDICES) {
        const name = ACTION_NAMES[idx];
        const acc = metrics.discreteAccuracies[name];
        const prec = metrics.discretePrecision?.[name];
        const rec = metrics.discreteRecall?.[name];
        const precStr = prec != null ? `${(prec * 100).toFixed(0)}%` : '—';
        const recStr = rec != null ? `${(rec * 100).toFixed(0)}%` : '—';
        html += `<div class="ml-row"><span class="ml-label">${name}:</span> ${(acc * 100).toFixed(1)}%`;
        html += ` <span class="ml-hint">P:${precStr} R:${recStr}</span></div>`;
    }
    el.innerHTML = html;
}

function displayImportance(topFeatures) {
    const el = qs('#ml-importance-display');
    if (!el) return;
    el.style.display = '';

    const maxVal = topFeatures[0]?.importance || 1;
    let html = '<div class="ml-section-title" style="margin-top:6px">Top features</div>';
    for (const feat of topFeatures) {
        const barWidth = (feat.importance / maxVal) * 100;
        html += `<div class="ml-imp-row">
            <span class="ml-imp-name">${feat.name}</span>
            <div class="ml-imp-bar-bg"><div class="ml-imp-bar" style="width:${barWidth}%"></div></div>
            <span class="ml-imp-val">${feat.importance.toFixed(3)}</span>
        </div>`;
    }
    el.innerHTML = html;
}

function qs(selector) {
    return panelEl ? panelEl.querySelector(selector) : null;
}

// ============================================================================
// Injected styles
// ============================================================================

function injectStyles() {
    if (document.getElementById('ml-panel-styles')) return;
    const style = document.createElement('style');
    style.id = 'ml-panel-styles';
    style.textContent = `
        #ml-panel {
            position: fixed;
            top: 50px;
            right: 10px;
            width: 280px;
            max-height: calc(100vh - 60px);
            overflow-y: auto;
            background: rgba(30, 30, 50, 0.96);
            border: 1px solid #4a5568;
            border-radius: 6px;
            padding: 12px;
            font-family: 'Segoe UI', sans-serif;
            font-size: 12px;
            color: #e2e8f0;
            z-index: 200;
            display: none;
        }
        #ml-panel.visible { display: block; }
        #ml-panel h4 {
            margin: 0 0 8px 0;
            font-size: 14px;
            color: #ffcc00;
            border-bottom: 1px solid #4a5568;
            padding-bottom: 6px;
        }
        .ml-section {
            margin-top: 8px;
            padding-top: 6px;
            border-top: 1px solid #3a4558;
        }
        .ml-section-title {
            font-size: 10px;
            text-transform: uppercase;
            color: #718096;
            margin-bottom: 4px;
        }
        .ml-row {
            display: flex;
            align-items: center;
            gap: 4px;
            margin: 3px 0;
            flex-wrap: wrap;
        }
        .ml-label { color: #a0aec0; }
        .ml-hint { color: #718096; font-size: 10px; margin-left: auto; }
        .ml-rec-active { color: #fc8181; font-weight: bold; }
        .ml-btn-row { display: flex; gap: 4px; flex-wrap: wrap; }
        .ml-btn {
            padding: 4px 8px;
            background: #4a5568;
            color: #e2e8f0;
            border: 1px solid #5a6578;
            border-radius: 3px;
            cursor: pointer;
            font-size: 11px;
            font-family: inherit;
        }
        .ml-btn:hover { background: #5a6578; }
        .ml-btn-primary { background: #2b6cb0; border-color: #3182ce; }
        .ml-btn-primary:hover { background: #3182ce; }
        .ml-btn-danger { background: #742a2a; border-color: #9b2c2c; }
        .ml-btn-danger:hover { background: #9b2c2c; }
        .ml-input {
            background: #2d3748;
            border: 1px solid #4a5568;
            border-radius: 3px;
            color: #e2e8f0;
            padding: 3px 6px;
            font-size: 11px;
            font-family: monospace;
            width: 80px;
        }
        .ml-input-sm { width: 50px; }
        .ml-progress {
            margin-top: 4px;
            height: 6px;
            background: #2d3748;
            border-radius: 3px;
            overflow: hidden;
        }
        .ml-progress-bar {
            height: 100%;
            background: linear-gradient(90deg, #2b6cb0, #63b3ed);
            border-radius: 3px;
            transition: width 0.15s;
            width: 0%;
        }
        .ml-status {
            margin-top: 4px;
            font-size: 11px;
            color: #a0aec0;
            word-break: break-word;
        }
        .ml-imp-row {
            display: flex;
            align-items: center;
            gap: 4px;
            margin: 2px 0;
            font-size: 10px;
        }
        .ml-imp-name { width: 100px; color: #a0aec0; text-align: right; }
        .ml-imp-bar-bg {
            flex: 1;
            height: 8px;
            background: #2d3748;
            border-radius: 2px;
            overflow: hidden;
        }
        .ml-imp-bar {
            height: 100%;
            background: #48bb78;
            border-radius: 2px;
        }
        .ml-imp-val { width: 40px; color: #718096; font-family: monospace; }
    `;
    document.head.appendChild(style);
}

// Periodically refresh display while panel is visible
setInterval(() => {
    if (visible) refreshDisplay();
}, 500);

export {
    initMlPanel,
    showMlPanel,
    hideMlPanel,
    toggleMlPanel,
    isMlPanelVisible,
    cleanupMlPanel,
    toggleAiControl
};
