// Shop module - buy/sell equipment between fights
//
// The shop is an always-visible HTML panel on the right side of the screen.
// It displays 6 randomised item slots with rarity weighting, a reroll button,
// and a sell drop-target.

import { BLOCK_DEFINITIONS } from './pieces/blocks.js';
import { EQUIPMENT_DEFINITIONS } from './pieces/equipment.js';
import { createPiece, removePiece, getPieceDefinition, PieceCategory } from './pieces/piece.js';
import { getRandomBinPosition } from './bin.js';
import { getRunMoney, spendMoney, addMoney, saveInventory } from './run.js';
import { getShipLayout } from './layout.js';

// ============================================================================
// Constants
// ============================================================================

const SLOT_COUNT = 6;
const REROLL_COST = 1;

/** Rarity weights — must sum to 1 */
const TIER_WEIGHTS = [
    { tier: 'starter',  weight: 0.50 },
    { tier: 'common',   weight: 0.30 },
    { tier: 'uncommon', weight: 0.15 },
    { tier: 'rare',     weight: 0.05 }
];

/** Visual colour per tier (CSS) */
const TIER_COLORS = {
    starter:  '#8b7355',
    common:   '#5588cc',
    uncommon: '#9b59b6',
    rare:     '#f1c40f'
};

const TIER_LABELS = {
    starter:  'Starter',
    common:   'Common',
    uncommon: 'Uncommon',
    rare:     'Rare'
};

// ============================================================================
// State
// ============================================================================

let gameStateRef = null;
/** @type {Array<{type: string, tier: string, cost: number, name: string, sold: boolean}>} */
let slots = [];
let shopPanelEl = null;
let sellZoneEl = null;
let tooltipEl = null;
let stylesInjected = false;
/** Callback supplied by main.js to refresh money display */
let onMoneyChanged = null;

// ============================================================================
// Item pool (built once)
// ============================================================================

/** @type {Map<string, Array<{type: string, tier: string, cost: number, name: string}>>} */
let poolByTier = null;

function buildItemPool() {
    poolByTier = new Map();
    for (const { tier } of TIER_WEIGHTS) {
        poolByTier.set(tier, []);
    }

    // Add blocks (excluding core)
    for (const [type, def] of Object.entries(BLOCK_DEFINITIONS)) {
        const tier = def.tier || 'common';
        if (!poolByTier.has(tier)) continue;
        poolByTier.get(tier).push({
            type,
            tier,
            cost: def.cost ?? 1,
            name: def.name || type
        });
    }

    // Add equipment
    for (const [type, def] of Object.entries(EQUIPMENT_DEFINITIONS)) {
        const tier = def.tier || 'common';
        if (!poolByTier.has(tier)) continue;
        poolByTier.get(tier).push({
            type,
            tier,
            cost: def.cost ?? 1,
            name: def.name || type
        });
    }
}

// ============================================================================
// Slot generation
// ============================================================================

/**
 * Picks a random tier according to TIER_WEIGHTS.
 * @returns {string}
 */
function pickRandomTier() {
    const r = Math.random();
    let cumulative = 0;
    for (const { tier, weight } of TIER_WEIGHTS) {
        cumulative += weight;
        if (r < cumulative) return tier;
    }
    return TIER_WEIGHTS[TIER_WEIGHTS.length - 1].tier;
}

/**
 * Rolls all 6 shop slots.
 */
function rollShop() {
    if (!poolByTier) buildItemPool();

    slots = [];
    for (let i = 0; i < SLOT_COUNT; i++) {
        let tier = pickRandomTier();
        let pool = poolByTier.get(tier);

        // Fallback: if a tier pool is empty, pick another
        if (!pool || pool.length === 0) {
            tier = 'common';
            pool = poolByTier.get(tier);
        }

        const item = pool[Math.floor(Math.random() * pool.length)];
        slots.push({ ...item, sold: false });
    }

    renderSlots();
}

// ============================================================================
// DOM creation & rendering
// ============================================================================

function ensureStyles() {
    if (stylesInjected) return;
    stylesInjected = true;
    const style = document.createElement('style');
    style.id = 'shop-styles';
    style.textContent = `
        #shop-panel {
            position: fixed;
            top: 50%;
            right: 12px;
            transform: translateY(-50%);
            width: 170px;
            background: rgba(20, 24, 36, 0.92);
            border: 1px solid #4a5568;
            border-radius: 8px;
            padding: 10px 10px 8px;
            font-family: 'Segoe UI', sans-serif;
            z-index: 100;
            display: flex;
            flex-direction: column;
            gap: 6px;
            user-select: none;
        }
        .shop-title {
            text-align: center;
            font-size: 13px;
            font-weight: 700;
            color: #e2e8f0;
            letter-spacing: 1.5px;
            text-transform: uppercase;
            margin-bottom: 2px;
        }
        .shop-slot {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 7px 8px;
            background: rgba(30, 34, 50, 0.85);
            border: 1px solid #3a3f52;
            border-left: 3px solid #888;
            border-radius: 5px;
            cursor: grab;
            transition: background 0.12s, border-color 0.12s;
        }
        .shop-slot:hover:not(.shop-slot-sold) {
            background: rgba(45, 50, 70, 0.95);
            border-color: #6a7090;
        }
        .shop-slot-sold {
            opacity: 0.35;
            cursor: default;
            pointer-events: none;
        }
        .shop-slot-info {
            flex: 1;
            min-width: 0;
        }
        .shop-slot-name {
            font-size: 11px;
            font-weight: 600;
            color: #cbd5e0;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .shop-slot-tier {
            font-size: 9px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-top: 1px;
        }
        .shop-slot-cost {
            font-size: 12px;
            font-weight: 700;
            color: #48bb78;
            white-space: nowrap;
        }
        #shop-reroll-btn {
            margin-top: 2px;
            padding: 6px 0;
            width: 100%;
            border: 1px solid #4a5568;
            border-radius: 5px;
            background: rgba(30, 34, 50, 0.85);
            color: #a0aec0;
            font-family: 'Segoe UI', sans-serif;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            transition: background 0.15s, color 0.15s;
        }
        #shop-reroll-btn:hover {
            background: rgba(50, 55, 78, 0.95);
            color: #e2e8f0;
        }
        #shop-reroll-btn:disabled {
            opacity: 0.4;
            cursor: default;
        }
        #shop-sell-zone {
            margin-top: 4px;
            padding: 10px 0;
            text-align: center;
            border: 2px dashed #4a5568;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 700;
            color: #718096;
            letter-spacing: 1px;
            text-transform: uppercase;
            transition: background 0.15s, border-color 0.15s, color 0.15s;
        }
        #shop-sell-zone.sell-hover {
            background: rgba(255, 80, 80, 0.15);
            border-color: #fc8181;
            color: #fc8181;
        }
        /* Credits flash animation */
        @keyframes credits-flash {
            0%   { transform: scale(1);   color: #48bb78; }
            30%  { transform: scale(1.25); color: #68d391; }
            100% { transform: scale(1);   color: #48bb78; }
        }
        #money-display.flash {
            animation: credits-flash 0.4s ease-out;
        }
        /* Insufficient funds flash */
        @keyframes credits-flash-red {
            0%   { transform: scale(1);   color: #48bb78; }
            30%  { transform: scale(1.18); color: #fc8181; }
            100% { transform: scale(1);   color: #48bb78; }
        }
        #money-display.flash-red {
            animation: credits-flash-red 0.4s ease-out;
        }
        /* Shop tooltip */
        #shop-tooltip {
            position: fixed;
            pointer-events: none;
            z-index: 200;
            max-width: 240px;
            background: rgba(16, 18, 28, 0.96);
            border: 1px solid #4a5568;
            border-radius: 6px;
            padding: 10px 12px;
            font-family: 'Segoe UI', sans-serif;
            opacity: 0;
            transition: opacity 0.12s ease-out;
        }
        #shop-tooltip.visible {
            opacity: 1;
        }
        .tip-name {
            font-size: 12px;
            font-weight: 700;
            color: #e2e8f0;
            margin-bottom: 2px;
        }
        .tip-tier {
            font-size: 9px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 6px;
        }
        .tip-desc {
            font-size: 11px;
            color: #a0aec0;
            line-height: 1.45;
            margin-bottom: 6px;
        }
        .tip-stats {
            display: flex;
            flex-direction: column;
            gap: 2px;
        }
        .tip-stat {
            display: flex;
            justify-content: space-between;
            font-size: 10px;
        }
        .tip-stat-label {
            color: #718096;
        }
        .tip-stat-value {
            color: #cbd5e0;
            font-weight: 600;
        }
    `;
    document.head.appendChild(style);
}

/**
 * Initialises the shop panel DOM and wires internal events.
 * @param {object} gameState - The game state reference
 * @param {object} [callbacks] - Optional callbacks
 * @param {Function} [callbacks.onMoneyChanged] - Called after any buy/sell/reroll
 */
function initShop(gameState, callbacks = {}) {
    gameStateRef = gameState;
    onMoneyChanged = callbacks.onMoneyChanged || null;

    ensureStyles();
    if (!poolByTier) buildItemPool();

    // Create panel
    shopPanelEl = document.getElementById('shop-panel');
    if (!shopPanelEl) {
        shopPanelEl = document.createElement('div');
        shopPanelEl.id = 'shop-panel';
        document.body.appendChild(shopPanelEl);
    }

    // Initial roll
    rollShop();
}

/**
 * Re-renders the slot cards inside the shop panel.
 */
function renderSlots() {
    if (!shopPanelEl) return;

    const money = getRunMoney();

    let html = `<div class="shop-title">Shop</div>`;

    for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        const tierColor = TIER_COLORS[slot.tier] || '#888';
        const tierLabel = TIER_LABELS[slot.tier] || slot.tier;
        const soldClass = slot.sold ? ' shop-slot-sold' : '';
        const canAfford = !slot.sold && money >= slot.cost;
        const costColor = canAfford ? '#48bb78' : '#fc8181';

        html += `
            <div class="shop-slot${soldClass}" data-slot="${i}" style="border-left-color:${tierColor}">
                <div class="shop-slot-info">
                    <div class="shop-slot-name">${slot.name}</div>
                    <div class="shop-slot-tier" style="color:${tierColor}">${tierLabel}</div>
                </div>
                <div class="shop-slot-cost" style="color:${costColor}">${slot.cost} cr</div>
            </div>`;
    }

    // Reroll button
    const canReroll = money >= REROLL_COST;
    html += `<button id="shop-reroll-btn" ${canReroll ? '' : 'disabled'}>Reroll (${REROLL_COST} cr)</button>`;

    // Sell zone
    html += `<div id="shop-sell-zone">Drag here to sell ½ price</div>`;

    shopPanelEl.innerHTML = html;

    // Cache sell zone ref
    sellZoneEl = document.getElementById('shop-sell-zone');

    // Wire reroll
    const rerollBtn = document.getElementById('shop-reroll-btn');
    if (rerollBtn) {
        rerollBtn.addEventListener('click', handleReroll);
    }

    // Wire mousedown on slots for buying (drag-to-buy)
    const slotEls = shopPanelEl.querySelectorAll('.shop-slot:not(.shop-slot-sold)');
    slotEls.forEach(el => {
        el.addEventListener('mousedown', onSlotMouseDown);
        el.addEventListener('mouseenter', onSlotMouseEnter);
        el.addEventListener('mouseleave', onSlotMouseLeave);
    });
}

// ============================================================================
// Tooltip
// ============================================================================

function ensureTooltip() {
    if (tooltipEl) return;
    tooltipEl = document.createElement('div');
    tooltipEl.id = 'shop-tooltip';
    document.body.appendChild(tooltipEl);
}

/**
 * Builds the tooltip HTML for a given slot item.
 * @param {{type: string, tier: string, cost: number, name: string}} slot
 * @returns {string}
 */
function buildTooltipHTML(slot) {
    const def = getPieceDefinition(slot.type);
    if (!def) return '';

    const tierColor = TIER_COLORS[slot.tier] || '#888';
    const tierLabel = TIER_LABELS[slot.tier] || slot.tier;

    let html = `<div class="tip-name">${slot.name}</div>`;
    html += `<div class="tip-tier" style="color:${tierColor}">${tierLabel}</div>`;

    if (def.description) {
        html += `<div class="tip-desc">${def.description}</div>`;
    }

    // Stat lines
    const stats = [];
    if (def.hp != null) stats.push(['HP', def.hp]);
    if (def.mass != null) stats.push(['Mass', def.mass]);
    if (def.width != null && def.height != null) stats.push(['Size', `${def.width}×${def.height}`]);
    if (def.damage != null) stats.push(['Damage', def.damage]);
    if (def.reloadTime != null) stats.push(['Reload', `${def.reloadTime}s`]);
    if (def.projectileSpeed != null) stats.push(['Proj Speed', def.projectileSpeed]);
    if (def.spread != null) stats.push(['Spread', `±${(def.spread * (180 / Math.PI)).toFixed(1)}°`]);
    if (def.thrustForce != null) stats.push(['Thrust', def.thrustForce]);

    if (stats.length) {
        html += '<div class="tip-stats">';
        for (const [label, value] of stats) {
            html += `<div class="tip-stat"><span class="tip-stat-label">${label}</span><span class="tip-stat-value">${value}</span></div>`;
        }
        html += '</div>';
    }

    return html;
}

/**
 * Positions the tooltip to the left of the hovered element.
 * @param {HTMLElement} slotEl
 */
function positionTooltip(slotEl) {
    if (!tooltipEl) return;
    const rect = slotEl.getBoundingClientRect();
    const tipRect = tooltipEl.getBoundingClientRect();
    let left = rect.left - tipRect.width - 10;
    let top = rect.top + (rect.height / 2) - (tipRect.height / 2);

    // Clamp to viewport
    if (left < 4) left = rect.right + 10;
    if (top < 4) top = 4;
    if (top + tipRect.height > window.innerHeight - 4) {
        top = window.innerHeight - tipRect.height - 4;
    }

    tooltipEl.style.left = `${left}px`;
    tooltipEl.style.top = `${top}px`;
}

/**
 * Shows tooltip on mouseenter over a shop slot.
 * @param {MouseEvent} event
 */
function onSlotMouseEnter(event) {
    const slotIndex = parseInt(event.currentTarget.dataset.slot, 10);
    if (isNaN(slotIndex)) return;
    const slot = slots[slotIndex];
    if (!slot || slot.sold) return;

    ensureTooltip();
    tooltipEl.innerHTML = buildTooltipHTML(slot);
    // Show off-screen first to measure, then position
    tooltipEl.style.left = '-9999px';
    tooltipEl.style.top = '-9999px';
    tooltipEl.classList.add('visible');

    // Capture element ref — event.currentTarget is nulled after the event ends
    const slotEl = event.currentTarget;
    // Use rAF so the browser has laid out the element before we measure
    requestAnimationFrame(() => {
        positionTooltip(slotEl);
    });
}

/**
 * Hides tooltip on mouseleave.
 */
function onSlotMouseLeave() {
    if (tooltipEl) tooltipEl.classList.remove('visible');
}

// ============================================================================
// Buy / Sell / Reroll
// ============================================================================

/**
 * Handles mousedown on a shop slot (start of drag-to-buy).
 * @param {MouseEvent} event
 */
function onSlotMouseDown(event) {
    // Only left-click
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    // Hide tooltip immediately on click
    if (tooltipEl) tooltipEl.classList.remove('visible');

    const slotIndex = parseInt(event.currentTarget.dataset.slot, 10);
    if (isNaN(slotIndex)) return;

    const result = handleShopBuy(slotIndex);
    if (!result) return;

    // Dispatch a custom event so input.js can start dragging this piece
    const evt = new CustomEvent('shop-piece-bought', {
        detail: { piece: result.piece, originalEvent: event }
    });
    document.dispatchEvent(evt);
}

/**
 * Attempts to buy an item from the given slot.
 * @param {number} slotIndex
 * @returns {{piece: object}|null} The created piece, or null if purchase failed
 */
function handleShopBuy(slotIndex) {
    const slot = slots[slotIndex];
    if (!slot || slot.sold) return null;

    // Check funds
    if (getRunMoney() < slot.cost) {
        flashCreditsRed();
        return null;
    }

    // Charge
    spendMoney(slot.cost);
    flashCredits();

    // Create piece at a position off-screen (it will snap to cursor via drag)
    const pos = getRandomBinPosition();
    const piece = createPiece(slot.type, pos.x, pos.y);
    if (!piece) return null;

    // Add to game state
    gameStateRef.pieces.push(piece);
    // Don't push to binPieces yet — input.js will start dragging it

    // Mark slot sold
    slot.sold = true;
    renderSlots();

    // Persist inventory so the piece survives a reload.
    // The piece is about to be dragged (not yet in binPieces), so include it manually.
    const binTypes = gameStateRef.binPieces.map(p => p.type);
    binTypes.push(piece.type);
    saveInventory(getShipLayout(), binTypes);

    return { piece };
}

/**
 * Sells a piece: removes it from the game and refunds half its cost (rounded up).
 * @param {object} piece
 * @returns {boolean} True if sold successfully
 */
function handleSellPiece(piece) {
    if (!piece || !gameStateRef) return false;

    // Cannot sell the core
    if (piece.category === PieceCategory.CORE) return false;

    // Determine cost from definition
    const def = getPieceDefinition(piece.type);
    const cost = def ? (def.cost ?? 0) : 0;
    if (cost <= 0) return false;

    const refund = Math.ceil(cost / 2);
    addMoney(refund);
    flashCredits();

    // Remove from all arrays
    const idx = gameStateRef.pieces.indexOf(piece);
    if (idx !== -1) gameStateRef.pieces.splice(idx, 1);
    const binIdx = gameStateRef.binPieces.indexOf(piece);
    if (binIdx !== -1) gameStateRef.binPieces.splice(binIdx, 1);
    const gridIdx = gameStateRef.gridPieces.indexOf(piece);
    if (gridIdx !== -1) gameStateRef.gridPieces.splice(gridIdx, 1);

    // Clean up Three.js mesh and physics body
    removePiece(piece);

    // Persist inventory after removal
    saveInventory(getShipLayout(), gameStateRef.binPieces.map(p => p.type));

    return true;
}

/**
 * Handles reroll button click.
 */
function handleReroll() {
    if (getRunMoney() < REROLL_COST) {
        flashCreditsRed();
        return;
    }
    spendMoney(REROLL_COST);
    flashCredits();
    rollShop();
}

// ============================================================================
// Sell zone helpers
// ============================================================================

/**
 * Returns true if screen coordinates are inside the sell zone.
 * @param {number} screenX
 * @param {number} screenY
 * @returns {boolean}
 */
function isInsideSellZone(screenX, screenY) {
    if (!sellZoneEl) return false;
    const rect = sellZoneEl.getBoundingClientRect();
    return screenX >= rect.left && screenX <= rect.right &&
           screenY >= rect.top  && screenY <= rect.bottom;
}

/**
 * Activates/deactivates the sell zone hover highlight.
 * @param {boolean} active
 */
function setSellZoneHover(active) {
    if (!sellZoneEl) return;
    if (active) {
        sellZoneEl.classList.add('sell-hover');
    } else {
        sellZoneEl.classList.remove('sell-hover');
    }
}

// ============================================================================
// Credits flash
// ============================================================================

function flashCredits() {
    if (onMoneyChanged) onMoneyChanged();
    const el = document.getElementById('money-display');
    if (!el) return;
    el.classList.remove('flash', 'flash-red');
    // Force reflow to restart animation
    void el.offsetWidth;
    el.classList.add('flash');
    el.addEventListener('animationend', () => el.classList.remove('flash'), { once: true });
}

function flashCreditsRed() {
    const el = document.getElementById('money-display');
    if (!el) return;
    el.classList.remove('flash', 'flash-red');
    void el.offsetWidth;
    el.classList.add('flash-red');
    el.addEventListener('animationend', () => el.classList.remove('flash-red'), { once: true });
}

// ============================================================================
// Show / Hide
// ============================================================================

function showShop() {
    if (shopPanelEl) {
        shopPanelEl.style.display = '';
        renderSlots(); // refresh affordability colours
    }
}

function hideShop() {
    if (shopPanelEl) shopPanelEl.style.display = 'none';
}

// ============================================================================
// Exports
// ============================================================================

export {
    initShop,
    rollShop,
    showShop,
    hideShop,
    handleShopBuy,
    handleSellPiece,
    isInsideSellZone,
    setSellZoneHover,
    flashCredits
};
