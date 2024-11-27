export const NOOP = () => {};

export const STATE_CLEAN = 0;
export const STATE_CHECK = 1;
export const STATE_DIRTY = 2;
export const STATE_DISPOSED = 3;

export const TYPE_ROOT = 1 << 0;
export const TYPE_REACTION = 1 << 2;
export const TYPE_REACTION_PAUSED = 1 << 3;
export const TYPE_EFFECT = 1 << 4;
