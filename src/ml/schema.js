// ML schema - action vector format, schema version, and feature names
//
// Schema version tracks the format of sensing + action data so that
// saved datasets and models can detect incompatibility when the layout changes.

const SCHEMA_VERSION = 9;

// Sensing input size (from sensing.js flattenSensingState)
// v8: added 3 mouse sensing features (dotForward, dotRight, distance)
const SENSING_SIZE = 62;

// Action output: 9 discrete + 3 continuous = 12 dimensions
// v9: absolute aim position as dot products relative to ship (no delta/accumulator)
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
// [9]  aimDotForward   (float) - dot(normalized aim dir, ship forward) [-1,1]
// [10] aimDotRight     (float) - dot(normalized aim dir, ship right)   [-1,1]
// [11] aimDist         (float) - aim distance from ship, normalized [0,1]
const ACTION_SIZE = 12;

// Which action indices are discrete (boolean 0/1) vs continuous (float)
const DISCRETE_ACTION_INDICES = [0, 1, 2, 3, 4, 5, 6, 7, 8];
const CONTINUOUS_ACTION_INDICES = [9, 10, 11];

// Human-readable names for each action dimension
const ACTION_NAMES = [
    'forward', 'back', 'left', 'right',
    'turnLeft', 'turnRight', 'turnToward', 'fastTurn',
    'weaponActive',
    'aimDotForward', 'aimDotRight', 'aimDist'
];

// Human-readable names for all 62 sensing features (matches flattenSensingState order)
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
    // Mouse (3) - dot-product encoding of aim position relative to ship
    names.push('mouse.dotForward', 'mouse.dotRight', 'mouse.distance');
    return names;
}

export {
    SCHEMA_VERSION,
    SENSING_SIZE,
    ACTION_SIZE,
    DISCRETE_ACTION_INDICES,
    CONTINUOUS_ACTION_INDICES,
    ACTION_NAMES,
    SENSING_FEATURE_NAMES
};
