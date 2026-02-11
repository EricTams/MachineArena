// Fight outcome overlay - shows VICTORY/DEFEATED banners with action buttons
//
// Flow: fight ends -> show "Training AI..." spinner -> training results (click)
//       -> VICTORY / DEFEATED (click).
// Callbacks are set by the caller (main.js) to wire up stage progression.

// ============================================================================
// State
// ============================================================================

let overlayEl = null;
let stylesInjected = false;

// Short display names for discrete actions (matches ACTION_NAMES order for indices 0-8)
const SHORT_ACTION_NAMES = {
    forward: 'fwd',
    back: 'back',
    left: 'left',
    right: 'right',
    turnLeft: 'turnL',
    turnRight: 'turnR',
    turnToward: 'toward',
    fastTurn: 'fast',
    weaponActive: 'fire'
};

// ============================================================================
// Public API
// ============================================================================

/**
 * Shows the "Training AI..." spinner overlay with a progress bar.
 * Call this immediately when the fight ends, before training starts.
 */
function showTrainingSpinner() {
    ensureOverlay();
    overlayEl.innerHTML = `
        <div class="fo-box">
            <div class="fo-spinner"></div>
            <div class="fo-training-text">Training AI...</div>
            <div class="fo-progress-wrap">
                <div class="fo-progress-track">
                    <div class="fo-progress-bar" id="fo-progress-bar"></div>
                </div>
                <div class="fo-progress-label" id="fo-progress-label">Preparing data...</div>
            </div>
        </div>
    `;
    overlayEl.classList.remove('hidden');
}

/**
 * Updates the training progress bar.
 * @param {number} epoch - Current epoch (0-based)
 * @param {number} totalEpochs - Total number of epochs
 * @param {number} [loss] - Current training loss (optional)
 */
function updateTrainingProgress(epoch, totalEpochs, loss) {
    const bar = document.getElementById('fo-progress-bar');
    const label = document.getElementById('fo-progress-label');
    if (!bar || !label) return;

    const pct = Math.round(((epoch + 1) / totalEpochs) * 100);
    bar.style.width = `${pct}%`;

    const lossStr = loss != null ? ` · loss ${loss.toFixed(4)}` : '';
    label.textContent = `Epoch ${epoch + 1} / ${totalEpochs}${lossStr}`;
}

/**
 * Shows the training results screen with diagnostics.
 * Returns a promise that resolves when the player clicks Continue.
 * @param {object} diagnostics - From autoTrainFromRecording
 * @param {number[]} diagnostics.lossHistory - Per-epoch training loss
 * @param {number[]} diagnostics.valLossHistory - Per-epoch validation loss
 * @param {object} diagnostics.metrics - Evaluation metrics
 * @param {number} diagnostics.trainFrames - Number of training frames
 * @param {number} diagnostics.epochsRun - Actual epochs run (may be < max due to early stopping)
 * @param {Array} diagnostics.sessions - Session history for trend display
 * @returns {Promise<void>} Resolves on Continue click
 */
function showTrainingResults(diagnostics) {
    ensureOverlay();

    const { lossHistory, valLossHistory, metrics, trainFrames, totalRuns, epochsRun, sessions, config, predictionSummary } = diagnostics;
    const hasPrediction = !!predictionSummary;

    // Build prediction summary HTML (old model's live predictions vs actual player actions)
    let predictionHtml = '';
    if (hasPrediction) {
        const predAccPct = (predictionSummary.overallAccuracy * 100).toFixed(1);
        const predAimPct = Math.max(0, (1 - Math.sqrt(predictionSummary.aimMSE)) * 100).toFixed(1);

        let predActionBarsHtml = '';
        const predActionNames = Object.keys(predictionSummary.perAction || {});
        for (const name of predActionNames) {
            const acc = predictionSummary.perAction[name];
            const accPct = Math.round(acc * 100);
            const shortName = SHORT_ACTION_NAMES[name] || name;
            predActionBarsHtml += `
                <div class="fo-tr-action-row">
                    <span class="fo-tr-action-name">${shortName}</span>
                    <div class="fo-tr-bar-pair">
                        <div class="fo-tr-bar-track">
                            <div class="fo-tr-bar fo-tr-bar-pred-acc" style="width:${accPct}%"></div>
                        </div>
                    </div>
                    <span class="fo-tr-action-pct">${accPct}%</span>
                </div>`;
        }

        predictionHtml = `
            <div class="fo-tr-col">
                <div class="fo-tr-section-title">Old Model Predictions <span class="fo-tr-hint">(live during fight)</span></div>
                <div class="fo-tr-metrics" style="margin-top:6px">
                    <div class="fo-tr-metric">
                        <div class="fo-tr-metric-value">${predAccPct}%</div>
                        <div class="fo-tr-metric-label">Action Prediction</div>
                    </div>
                    <div class="fo-tr-metric">
                        <div class="fo-tr-metric-value">${predAimPct}%</div>
                        <div class="fo-tr-metric-label">Aim Prediction</div>
                    </div>
                </div>
                <div class="fo-tr-section" style="margin-top:8px">
                    <div class="fo-tr-section-title">Per-Action Accuracy</div>
                    ${predActionBarsHtml}
                </div>
                <div class="fo-tr-session-info" style="margin-top:6px">${predictionSummary.totalFrames.toLocaleString()} frames evaluated</div>
            </div>`;
    }

    // Build action rates HTML
    const actionNames = Object.keys(metrics.predictedRates || {});
    let actionBarsHtml = '';
    for (const name of actionNames) {
        const pred = metrics.predictedRates[name];
        const actual = metrics.actualRates[name];
        const predPct = Math.round(pred * 100);
        const actualPct = Math.round(actual * 100);
        const diff = Math.abs(predPct - actualPct);
        const warn = diff > 15 ? '<span class="fo-tr-warn">!!</span>' : '';
        const shortName = SHORT_ACTION_NAMES[name] || name;
        actionBarsHtml += `
            <div class="fo-tr-action-row">
                <span class="fo-tr-action-name">${shortName}</span>
                <div class="fo-tr-bar-pair">
                    <div class="fo-tr-bar-track">
                        <div class="fo-tr-bar fo-tr-bar-pred" style="width:${predPct}%"></div>
                    </div>
                    <div class="fo-tr-bar-track">
                        <div class="fo-tr-bar fo-tr-bar-actual" style="width:${actualPct}%"></div>
                    </div>
                </div>
                <span class="fo-tr-action-pct">${predPct}%/${actualPct}%${warn}</span>
            </div>`;
    }

    // Build session trend HTML
    let sessionHtml = '';
    if (sessions && sessions.length >= 2) {
        const recent = sessions.slice(-5);
        const accValues = recent.map(s => Math.round((s.accuracy || 0) * 100));
        const trendStr = accValues.join('% \u2192 ') + '%';
        const totalFrames = sessions.reduce((sum, s) => sum + (s.frames || 0), 0);
        const direction = accValues[accValues.length - 1] >= accValues[0] ? 'trending up' : 'trending down';
        sessionHtml = `
            <div class="fo-tr-section">
                <div class="fo-tr-section-title">Progress</div>
                <div class="fo-tr-session-info">Session ${sessions.length} \u2014 accuracy ${trendStr} (${direction})</div>
                <div class="fo-tr-session-info">Total frames trained: ${totalFrames.toLocaleString()}</div>
            </div>`;
    } else if (sessions && sessions.length === 1) {
        sessionHtml = `
            <div class="fo-tr-section">
                <div class="fo-tr-section-title">Progress</div>
                <div class="fo-tr-session-info">First training session \u2014 ${trainFrames} frames</div>
            </div>`;
    }

    // Use two-column layout: left = new model results, right = old model predictions
    // Falls back to single-column (centered) when no prediction summary
    overlayEl.innerHTML = `
        <div class="fo-box fo-tr-box ${hasPrediction ? 'fo-tr-wide' : ''}">
            <div class="fo-tr-header">
                <div class="fo-tr-title">TRAINING COMPLETE</div>
                <div class="fo-tr-subtitle">${trainFrames.toLocaleString()} frames from ${totalRuns || '?'} fight${totalRuns !== 1 ? 's' : ''} \u2014 ${epochsRun} epochs + fine-tuned on latest</div>
            </div>

            <div class="fo-tr-columns">
                <div class="fo-tr-col">
                    <div class="fo-tr-section-title">Loss Curve</div>
                    <canvas id="fo-tr-loss-canvas" width="400" height="120"></canvas>
                    <div class="fo-tr-legend">
                        <span class="fo-tr-legend-item"><span class="fo-tr-swatch fo-tr-swatch-train"></span>train</span>
                        <span class="fo-tr-legend-item"><span class="fo-tr-swatch fo-tr-swatch-val"></span>val</span>
                    </div>

                    <div class="fo-tr-metrics" style="margin-top:10px">
                        <div class="fo-tr-metric">
                            <div class="fo-tr-metric-value">${(metrics.overallAccuracy * 100).toFixed(1)}%</div>
                            <div class="fo-tr-metric-label">Action Accuracy</div>
                        </div>
                        <div class="fo-tr-metric">
                            <div class="fo-tr-metric-value">${Math.max(0, (1 - Math.sqrt(metrics.aimMSE)) * 100).toFixed(1)}%</div>
                            <div class="fo-tr-metric-label">Aim Accuracy</div>
                        </div>
                    </div>

                    <div class="fo-tr-section" style="margin-top:10px">
                        <div class="fo-tr-section-title">Action Rates <span class="fo-tr-hint">(predicted / actual)</span></div>
                        ${actionBarsHtml}
                    </div>

                    ${sessionHtml}
                </div>

                ${predictionHtml}
            </div>

            <div class="fo-buttons" style="margin-top:18px">
                <button class="fo-btn fo-btn-primary" id="fo-tr-continue">Continue</button>
            </div>
        </div>
    `;
    overlayEl.classList.remove('hidden');

    // Draw loss curve
    drawLossCurve(lossHistory, valLossHistory);

    // Return promise resolved by Continue button
    return new Promise(resolve => {
        const btn = document.getElementById('fo-tr-continue');
        if (btn) btn.addEventListener('click', () => resolve());
    });
}

// ============================================================================
// Loss curve drawing
// ============================================================================

/**
 * Draws train/val loss curves on the canvas.
 * @param {number[]} trainLoss - Per-epoch training loss
 * @param {number[]} valLoss - Per-epoch validation loss
 */
function drawLossCurve(trainLoss, valLoss) {
    const canvas = document.getElementById('fo-tr-loss-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    const pad = { top: 10, right: 10, bottom: 24, left: 45 };
    const plotW = W - pad.left - pad.right;
    const plotH = H - pad.top - pad.bottom;

    // Clear
    ctx.clearRect(0, 0, W, H);

    const allVals = [...trainLoss, ...valLoss];
    const maxLoss = Math.max(...allVals);
    const minLoss = Math.min(...allVals);
    const range = maxLoss - minLoss || 1;
    const epochs = trainLoss.length;

    // Helper: data coords -> canvas coords
    const toX = (i) => pad.left + (i / Math.max(1, epochs - 1)) * plotW;
    const toY = (v) => pad.top + (1 - (v - minLoss) / range) * plotH;

    // Draw axes
    ctx.strokeStyle = '#4a5568';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.left, pad.top);
    ctx.lineTo(pad.left, pad.top + plotH);
    ctx.lineTo(pad.left + plotW, pad.top + plotH);
    ctx.stroke();

    // Y-axis labels
    ctx.fillStyle = '#718096';
    ctx.font = '10px Segoe UI, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(maxLoss.toFixed(2), pad.left - 4, pad.top + 10);
    ctx.fillText(minLoss.toFixed(2), pad.left - 4, pad.top + plotH);

    // X-axis labels
    ctx.textAlign = 'center';
    ctx.fillText('1', toX(0), H - 4);
    ctx.fillText(String(epochs), toX(epochs - 1), H - 4);

    // Draw line function
    function drawLine(data, color) {
        if (data.length < 2) return;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(toX(0), toY(data[0]));
        for (let i = 1; i < data.length; i++) {
            ctx.lineTo(toX(i), toY(data[i]));
        }
        ctx.stroke();
    }

    // Draw val first (behind), then train (on top)
    drawLine(valLoss, '#718096');
    drawLine(trainLoss, '#ffcc00');
}

/**
 * Shows the victory overlay with action buttons.
 * @param {number} stage - The stage that was beaten
 * @param {object} callbacks - { onNextStage, onBackToDesigner }
 */
function showVictory(stage, callbacks) {
    ensureOverlay();
    overlayEl.innerHTML = `
        <div class="fo-box">
            <div class="fo-title fo-victory">VICTORY</div>
            <div class="fo-subtitle">Stage ${stage} cleared!</div>
            <div class="fo-buttons">
                <button class="fo-btn fo-btn-primary" id="fo-next-stage">Next Stage</button>
                <button class="fo-btn" id="fo-back-designer">Back to Designer</button>
            </div>
        </div>
    `;
    overlayEl.classList.remove('hidden');
    wireButton('fo-next-stage', callbacks.onNextStage);
    wireButton('fo-back-designer', callbacks.onBackToDesigner);
}

/**
 * Shows the defeat overlay with action buttons.
 * @param {number} stage - The stage that was attempted
 * @param {object} callbacks - { onRetry, onBackToDesigner }
 */
function showDefeat(stage, callbacks) {
    ensureOverlay();
    overlayEl.innerHTML = `
        <div class="fo-box">
            <div class="fo-title fo-defeat">DEFEATED</div>
            <div class="fo-subtitle">Stage ${stage}</div>
            <div class="fo-buttons">
                <button class="fo-btn fo-btn-primary" id="fo-retry">Retry</button>
                <button class="fo-btn" id="fo-back-designer">Back to Designer</button>
            </div>
        </div>
    `;
    overlayEl.classList.remove('hidden');
    wireButton('fo-retry', callbacks.onRetry);
    wireButton('fo-back-designer', callbacks.onBackToDesigner);
}

/**
 * Hides the fight outcome overlay.
 */
function hideFightOutcome() {
    if (overlayEl) overlayEl.classList.add('hidden');
}

// ============================================================================
// Internal helpers
// ============================================================================

function ensureOverlay() {
    if (!stylesInjected) injectStyles();
    if (!overlayEl) {
        overlayEl = document.createElement('div');
        overlayEl.id = 'fight-outcome-overlay';
        overlayEl.className = 'hidden';
        document.body.appendChild(overlayEl);
    }
}

function wireButton(id, callback) {
    const btn = document.getElementById(id);
    if (btn && callback) {
        btn.addEventListener('click', () => {
            hideFightOutcome();
            callback();
        });
    }
}

function injectStyles() {
    if (document.getElementById('fo-styles')) return;
    stylesInjected = true;
    const style = document.createElement('style');
    style.id = 'fo-styles';
    style.textContent = `
        #fight-outcome-overlay {
            position: fixed;
            top: 0; left: 0;
            width: 100%; height: 100%;
            background: rgba(10, 10, 25, 0.82);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 3000;
            transition: opacity 0.25s ease-out;
        }
        #fight-outcome-overlay.hidden {
            display: none;
        }
        .fo-box {
            text-align: center;
            min-width: 280px;
        }
        .fo-title {
            font-family: 'Segoe UI', sans-serif;
            font-size: 48px;
            font-weight: 700;
            letter-spacing: 4px;
            margin-bottom: 8px;
        }
        .fo-victory { color: #ffcc00; }
        .fo-defeat  { color: #fc8181; }
        .fo-subtitle {
            font-family: 'Segoe UI', sans-serif;
            font-size: 16px;
            color: #a0aec0;
            margin-bottom: 32px;
        }
        .fo-buttons {
            display: flex;
            justify-content: center;
            gap: 12px;
        }
        .fo-btn {
            padding: 12px 28px;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-family: 'Segoe UI', sans-serif;
            font-size: 15px;
            font-weight: 600;
            background: #4a5568;
            color: #e2e8f0;
            transition: background 0.15s, transform 0.1s;
        }
        .fo-btn:hover { background: #5a6578; }
        .fo-btn:active { transform: scale(0.97); }
        .fo-btn-primary {
            background: linear-gradient(135deg, #ffcc00, #ff9900);
            color: #1a1a2e;
        }
        .fo-btn-primary:hover {
            background: linear-gradient(135deg, #ffd633, #ffaa22);
        }
        .fo-spinner {
            width: 36px; height: 36px;
            border: 4px solid #4a5568;
            border-top-color: #ffcc00;
            border-radius: 50%;
            margin: 0 auto 16px;
            animation: fo-spin 0.8s linear infinite;
        }
        @keyframes fo-spin {
            to { transform: rotate(360deg); }
        }
        .fo-training-text {
            font-family: 'Segoe UI', sans-serif;
            font-size: 18px;
            color: #a0aec0;
        }
        .fo-progress-wrap {
            margin-top: 20px;
            width: 260px;
            margin-left: auto;
            margin-right: auto;
        }
        .fo-progress-track {
            width: 100%;
            height: 8px;
            background: #2d3748;
            border-radius: 4px;
            overflow: hidden;
        }
        .fo-progress-bar {
            height: 100%;
            width: 0%;
            background: linear-gradient(90deg, #ffcc00, #ff9900);
            border-radius: 4px;
            transition: width 0.15s ease-out;
        }
        .fo-progress-label {
            font-family: 'Segoe UI', sans-serif;
            font-size: 12px;
            color: #718096;
            margin-top: 8px;
        }

        /* Training results screen */
        .fo-tr-box {
            min-width: 420px;
            max-width: 480px;
            max-height: calc(100vh - 40px);
            overflow-y: auto;
        }
        .fo-tr-box.fo-tr-wide {
            min-width: 700px;
            max-width: 880px;
        }
        .fo-tr-header {
            text-align: center;
            margin-bottom: 14px;
        }
        .fo-tr-title {
            font-family: 'Segoe UI', sans-serif;
            font-size: 28px;
            font-weight: 700;
            letter-spacing: 3px;
            color: #ffcc00;
            margin-bottom: 4px;
        }
        .fo-tr-subtitle {
            font-family: 'Segoe UI', sans-serif;
            font-size: 13px;
            color: #a0aec0;
        }
        .fo-tr-columns {
            display: flex;
            gap: 28px;
            align-items: flex-start;
        }
        .fo-tr-col {
            flex: 1;
            min-width: 0;
            text-align: left;
        }
        /* When single column (no prediction), center the lone column */
        .fo-tr-box:not(.fo-tr-wide) .fo-tr-columns {
            justify-content: center;
        }
        .fo-tr-box:not(.fo-tr-wide) .fo-tr-col {
            flex: 0 1 480px;
        }
        /* Divider between columns */
        .fo-tr-wide .fo-tr-col + .fo-tr-col {
            border-left: 1px solid #2d3748;
            padding-left: 28px;
        }
        .fo-tr-section {
            margin-top: 14px;
            text-align: left;
        }
        .fo-tr-section-title {
            font-family: 'Segoe UI', sans-serif;
            font-size: 10px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 1px;
            color: #718096;
            margin-bottom: 6px;
        }
        .fo-tr-hint {
            font-weight: 400;
            letter-spacing: 0;
            text-transform: none;
        }
        #fo-tr-loss-canvas {
            display: block;
            width: 100%;
            height: 120px;
            background: rgba(45, 55, 72, 0.4);
            border-radius: 4px;
        }
        .fo-tr-legend {
            display: flex;
            gap: 16px;
            justify-content: center;
            margin-top: 4px;
            font-size: 10px;
            color: #718096;
        }
        .fo-tr-legend-item {
            display: flex;
            align-items: center;
            gap: 4px;
        }
        .fo-tr-swatch {
            display: inline-block;
            width: 12px;
            height: 3px;
            border-radius: 1px;
        }
        .fo-tr-swatch-train { background: #ffcc00; }
        .fo-tr-swatch-val   { background: #718096; }

        .fo-tr-metrics {
            display: flex;
            justify-content: center;
            gap: 32px;
            margin-top: 14px;
        }
        .fo-tr-metric { text-align: center; }
        .fo-tr-metric-value {
            font-family: 'Segoe UI', sans-serif;
            font-size: 24px;
            font-weight: 700;
            color: #e2e8f0;
        }
        .fo-tr-metric-label {
            font-family: 'Segoe UI', sans-serif;
            font-size: 11px;
            color: #718096;
            margin-top: 2px;
        }

        .fo-tr-action-row {
            display: flex;
            align-items: center;
            gap: 6px;
            margin: 3px 0;
        }
        .fo-tr-action-name {
            width: 46px;
            text-align: right;
            font-family: 'Segoe UI', sans-serif;
            font-size: 11px;
            color: #a0aec0;
            flex-shrink: 0;
        }
        .fo-tr-bar-pair {
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 2px;
        }
        .fo-tr-bar-track {
            height: 6px;
            background: rgba(45, 55, 72, 0.5);
            border-radius: 3px;
            overflow: hidden;
        }
        .fo-tr-bar {
            height: 100%;
            border-radius: 3px;
            transition: width 0.3s ease-out;
        }
        .fo-tr-bar-pred { background: #ffcc00; }
        .fo-tr-bar-actual { background: #718096; }
        .fo-tr-bar-pred-acc { background: linear-gradient(90deg, #68d391, #48bb78); }
        .fo-tr-action-pct {
            width: 72px;
            font-family: monospace;
            font-size: 10px;
            color: #a0aec0;
            flex-shrink: 0;
        }
        .fo-tr-warn {
            color: #fc8181;
            font-weight: bold;
            margin-left: 2px;
        }

        .fo-tr-session-info {
            font-family: 'Segoe UI', sans-serif;
            font-size: 12px;
            color: #a0aec0;
            margin: 2px 0;
        }
    `;
    document.head.appendChild(style);
}

export {
    showTrainingSpinner,
    updateTrainingProgress,
    showTrainingResults,
    showVictory,
    showDefeat,
    hideFightOutcome
};
