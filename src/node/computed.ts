import { read, currentScope, compute, write, shouldUpdate } from '../compute';
import { STATE_CLEAN, STATE_DEAD, STATE_DIRTY } from '../constants';
import { handleError } from '../error';
import { isUndefined } from '../utils';
import { removeDeadLinks, removeLink, type Link } from './link';
import { isNode, type Node } from './node';
import type { ReadSignal } from './signal';

export class Computed<T = unknown> implements ReadSignal<T> {
  /** @internal */
  _state = STATE_DIRTY;
  /** @internal */
  _value: T;
  /** @internal */
  _version = 0;
  /** @internal */
  _lastComputedId = 0;
  /** @internal */
  _signals: Link | null = null;
  /** @internal */
  _signalsTail: Link | null = null;
  /** @internal */
  _reactions: Link | null = null;
  /** @internal */
  _reactionsTail: Link | null = null;
  /** @internal */
  _compute: () => T;

  get value() {
    return this._value;
  }

  constructor(initialValue: T, compute: () => T) {
    this._value = initialValue;
    this._compute = compute;
    currentScope?.append(this);
  }

  get(): T {
    return read(this);
  }

  update() {
    if (this._state === STATE_DEAD) return false;

    if (shouldUpdate(this)) {
      let scope = currentScope,
        version = this._version;

      try {
        this._signalsTail = null;

        let result = compute(scope, this, this._compute);

        removeDeadLinks(this);

        if (!isUndefined(this._value)) {
          write(this, result);
        } else {
          this._value = result;
        }
      } catch (error) {
        handleError(scope, error);
      } finally {
        this._state = STATE_CLEAN;
      }

      return this._version !== version;
    }

    this._state = STATE_CLEAN;
    return false;
  }

  destroy() {
    if (this._state === STATE_DEAD) return;

    if (this._signals) removeLink(this._signals);
    if (this._reactions) removeLink(this._reactions);

    this._signals = null;
    this._reactions = null;

    this._state = STATE_DEAD;
  }
}

export type InferComputedValue<T> = T extends Computed<infer R> ? R : never;

export function isComputed(value: unknown): value is Computed {
  return isNode(value) && isComputedNode(value);
}

export function isComputedNode(node: Node): node is Computed {
  if (__DEV__) {
    return '_compute' in node && '_value' in node;
  } else {
    return 'ƒ' in node && 'v' in node;
  }
}

/**
 * Creates a new signal whose value is computed and returned by the given function. The given
 * compute function is _only_ re-run when one of it's dependencies are updated. Dependencies are
 * are all signals that are read during execution.
 *
 * @see {@link https://github.com/maverick-js/signals#computed}
 */
export function computed<T>(compute: () => T, initialValue?: T): Computed<T> {
  return new Computed<T>(initialValue as T, compute);
}
