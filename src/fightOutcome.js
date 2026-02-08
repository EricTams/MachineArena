// Fight outcome overlay - shows VICTORY/DEFEATED banners with action buttons
//
// Flow: fight ends -> show "Training AI..." spinner -> show result + buttons.
// Callbacks are set by the caller (main.js) to wire up stage progression.

// ============================================================================
// State
// ============================================================================

let overlayEl = null;
let stylesInjected = false;

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
    `;
    document.head.appendChild(style);
}

export {
    showTrainingSpinner,
    updateTrainingProgress,
    showVictory,
    showDefeat,
    hideFightOutcome
};
