import type { Computation } from '../src';

/** Exposes the internal graph node fields of a signal or computed for assertions. */
export const internals = (value: unknown) => value as Computation;
