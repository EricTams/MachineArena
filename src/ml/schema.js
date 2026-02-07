// ML schema - action vector format, schema version, and feature names
//
// Schema version tracks the format of sensing + action data so that
// saved datasets and models can detect incompatibility when the layout changes.

const SCHEMA_VERSION = 6;

// Sensing input size (from sensing.js flattenSensingState)
// v6: walls now world-relative perpendicular proximity (top/bottom/left/right)
const SENSING_SIZE = 86;

// Action output: 13 discrete + 4 continuous = 17 dimensions
// v4: replaces raw aimDirX/Y with structured aim (target + leads + residual)
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
// [9]  targetEnemy0    (0/1)  - one-hot: aiming at enemy slot 0 (nearest)
// [10] targetEnemy1    (0/1)  - one-hot: aiming at enemy slot 1
// [11] targetEnemy2    (0/1)  - one-hot: aiming at enemy slot 2
// [12] targetEnemy3    (0/1)  - one-hot: aiming at enemy slot 3
// [13] aimLeadVelocity (float) - lead along enemy velocity direction [-1,1]
// [14] aimLeadFacing   (float) - lead along enemy facing direction [-1,1]
// [15] aimResidualX    (float) - ship-relative X correction [-1,1]
// [16] aimResidualY    (float) - ship-relative Y correction [-1,1]
const ACTION_SIZE = 17;

// Which action indices are discrete (boolean 0/1) vs continuous (float)
const DISCRETE_ACTION_INDICES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const CONTINUOUS_ACTION_INDICES = [13, 14, 15, 16];

// Human-readable names for each action dimension
const ACTION_NAMES = [
    'forward', 'back', 'left', 'right',
    'turnLeft', 'turnRight', 'turnToward', 'fastTurn',
    'weaponActive',
    'targetEnemy0', 'targetEnemy1', 'targetEnemy2', 'targetEnemy3',
    'aimLeadVelocity', 'aimLeadFacing',
    'aimResidualX', 'aimResidualY'
];

// Shared aim constants used by recording and inference
const MAX_LEAD_DISTANCE = 10;   // Normalization scale for lead projections (world units)
const MIN_ENEMY_SPEED = 0.1;    // Below this speed, velocity-based lead is zero

// Human-readable names for all 86 sensing features (matches flattenSensingState order)
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
    // Enemies (4 * 9 = 36)
    for (let i = 0; i < 4; i++) {
        const p = `enemy${i}`;
        names.push(`${p}.present`, `${p}.dist`, `${p}.angle`,
            `${p}.velToward`, `${p}.velCross`, `${p}.facing`,
            `${p}.facingOffset`, `${p}.facingLeadVel`, `${p}.facingLeadFace`);
    }
    // Hazards (4 * 4 = 16)
    for (let i = 0; i < 4; i++) {
        const p = `hazard${i}`;
        names.push(`${p}.present`, `${p}.proximity`, `${p}.angle`,
            `${p}.velToward`);
    }
    // Blockers (4 * 4 = 16)
    for (let i = 0; i < 4; i++) {
        const p = `blocker${i}`;
        names.push(`${p}.present`, `${p}.dist`, `${p}.angle`, `${p}.radius`);
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
