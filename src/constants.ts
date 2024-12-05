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
