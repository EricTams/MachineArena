// ML schema - action vector format, schema version, and feature names
//
// Schema version tracks the format of sensing + action data so that
// saved datasets and models can detect incompatibility when the layout changes.

const SCHEMA_VERSION = 7;

// Sensing input size (from sensing.js flattenSensingState)
// v7: single engaged enemy slot (1 * 9 = 9) instead of 4 slots (4 * 9 = 36)
const SENSING_SIZE = 59;

// Action output: 9 discrete + 4 continuous = 13 dimensions
// v7: removed target selection one-hot (single enemy slot, no selection needed)
//
// [0]  forward         (0/1)
// [1]  back            (0/1)
// [2]  left            (0/1)
// [3]  right           (0/1)
// [4]  turnLeft        (0/1)
// [5]  turnRight       (0/1)
// [6]  turnToward      (0/1)  - right mouse held, turning toward mouse
// [7]  fastTurn        (0/1)  - shift held, thruster-assisted rotation
// [8]  weaponActive    (0/1)  - any cannon on cooldown
// [9]  aimLeadVelocity (float) - lead along enemy velocity direction [-1,1]
// [10] aimLeadFacing   (float) - lead along enemy facing direction [-1,1]
// [11] aimResidualX    (float) - ship-relative X correction [-1,1]
// [12] aimResidualY    (float) - ship-relative Y correction [-1,1]
const ACTION_SIZE = 13;

// Which action indices are discrete (boolean 0/1) vs continuous (float)
const DISCRETE_ACTION_INDICES = [0, 1, 2, 3, 4, 5, 6, 7, 8];
const CONTINUOUS_ACTION_INDICES = [9, 10, 11, 12];

// Human-readable names for each action dimension
const ACTION_NAMES = [
    'forward', 'back', 'left', 'right',
    'turnLeft', 'turnRight', 'turnToward', 'fastTurn',
    'weaponActive',
    'aimLeadVelocity', 'aimLeadFacing',
    'aimResidualX', 'aimResidualY'
];

// Shared aim constants used by recording and inference
const MAX_LEAD_DISTANCE = 10;   // Normalization scale for lead projections (world units)
const MIN_ENEMY_SPEED = 0.1;    // Below this speed, velocity-based lead is zero

// Human-readable names for all 59 sensing features (matches flattenSensingState order)
const SENSING_FEATURE_NAMES = buildSensingFeatureNames();

function buildSensingFeatureNames() {
    const names = [];
    // Self (6)
    names.push('self.velForward', 'self.velRight', 'self.angVel',
        'self.health', 'self.posX', 'self.posY');
    // Walls (4 -- world-relative perpendicular proximity)
    names.push('walls.top', 'walls.bottom', 'walls.left', 'walls.right');
    // Threats (8)
    names.push('threat.front', 'threat.fRight', 'threat.right', 'threat.bRight',
        'threat.back', 'threat.bLeft', 'threat.left', 'threat.fLeft');
    // Enemy (1 * 9 = 9) - single engaged enemy
    const p = 'enemy';
    names.push(`${p}.present`, `${p}.dist`, `${p}.angle`,
        `${p}.velToward`, `${p}.velCross`, `${p}.facing`,
        `${p}.facingOffset`, `${p}.facingLeadVel`, `${p}.facingLeadFace`);
    // Hazards (4 * 4 = 16)
    for (let i = 0; i < 4; i++) {
        const h = `hazard${i}`;
        names.push(`${h}.present`, `${h}.proximity`, `${h}.angle`,
            `${h}.velToward`);
    }
    // Blockers (4 * 4 = 16)
    for (let i = 0; i < 4; i++) {
        const b = `blocker${i}`;
        names.push(`${b}.present`, `${b}.dist`, `${b}.angle`, `${b}.radius`);
    }
    return names;
}

export {
    SCHEMA_VERSION,
    SENSING_SIZE,
    ACTION_SIZE,
    DISCRETE_ACTION_INDICES,
    CONTINUOUS_ACTION_INDICES,
    ACTION_NAMES,
    SENSING_FEATURE_NAMES,
    MAX_LEAD_DISTANCE,
    MIN_ENEMY_SPEED
};
