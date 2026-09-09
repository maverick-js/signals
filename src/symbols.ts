/** Key of the parent scope on every scope node. */
export const SCOPE = Symbol(__DEV__ ? 'SCOPE' : 0);

/** Brand present on the prototype of every readable signal (signals, computeds, readonly views). */
export const SIGNAL = Symbol(__DEV__ ? 'SIGNAL' : 0);
