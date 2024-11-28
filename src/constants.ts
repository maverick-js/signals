export const STATE_CLEAN = 0;
export const STATE_CHECK = 1;
export const STATE_DIRTY = 3;
export const STATE_INERT = 4;
export const STATE_DEAD = 5;

export type State =
  | typeof STATE_CLEAN
  | typeof STATE_CHECK
  | typeof STATE_DIRTY
  | typeof STATE_INERT
  | typeof STATE_DEAD;

export const TYPE_SCOPE = 0;
export const TYPE_EFFECT = 1;
export const TYPE_SIGNAL = 2;
export const TYPE_READ_SIGNAL = 3;
export const TYPE_REACTION = 4;

export type Type =
  | typeof TYPE_SCOPE
  | typeof TYPE_READ_SIGNAL
  | typeof TYPE_SIGNAL
  | typeof TYPE_REACTION
  | typeof TYPE_EFFECT;
