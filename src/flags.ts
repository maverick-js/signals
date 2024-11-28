export const FLAG_CLEAN = 1 << 1;
export const FLAG_CHECK = 1 << 2;
export const FLAG_DEAD = 1 << 4;
export const FLAG_INERT = 1 << 5;

export const FLAG_SIGNAL = 1 << 6;
export const FLAG_SIGNAL_INIT = FLAG_SIGNAL | FLAG_CLEAN;
export const FLAG_SIGNAL_WRITE = 1 << 7;
export const FLAG_SIGNAL_WRITE_INIT = FLAG_SIGNAL_INIT | FLAG_SIGNAL_WRITE;

export const FLAG_REACTION = 1 << 8;
export const FLAG_REACTION_INIT = FLAG_SIGNAL | FLAG_REACTION;

export const FLAG_EFFECT = 1 << 9;
export const FLAG_EFFECT_INIT = FLAG_REACTION | FLAG_EFFECT;
