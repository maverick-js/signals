import { compute, queueEffect, shouldUpdate } from '../compute';
import { STATE_CLEAN, STATE_DEAD, STATE_DIRTY, STATE_INERT } from '../constants';
import { addDisposable } from '../dispose';
import { handleError } from '../error';
import type { Maybe } from '../types';
import { isFunction } from '../utils';
import { removeDeadLinks, removeLink, type Link } from './link';
import { isNode, type Node } from './node';
import { Scope } from './scope';

export class Effect implements Node {
  /** @internal */
  _scope = new Scope(this);
  /** @internal */
  _state = STATE_DIRTY;
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
  _compute: EffectFunction;

  constructor(fn: EffectFunction, options?: EffectOptions) {
    this._compute = fn;
    if (!options?.immediate) {
      queueEffect(this);
    } else {
      run(this);
    }
  }

  update() {
    if (this._state >= STATE_INERT) return false;

    if (shouldUpdate(this)) {
      run(this);
      return true;
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

    if (this._scope) {
      this._scope._effect = null;
      this._scope.destroy();
      // @ts-expect-error
      this._scope = null;
    }

    this._state = STATE_DEAD;
  }
}

export interface EffectOptions {
  immediate?: boolean;
}

export interface EffectFunction {
  (): MaybeStopEffect;
}

export interface StopEffect {
  (): void;
}

export type MaybeStopEffect = Maybe<StopEffect>;

const destroyEffect = /*@__PURE__*/ Effect.prototype.destroy;

/**
 * Invokes the given function each time any of the signals that are read inside are updated
 * (i.e., value changes). Updates are queued and run asynchronously on the microtask queue.
 *
 * @see {@link https://github.com/maverick-js/signals#effect}
 */
export function effect(fn: EffectFunction, options?: EffectOptions): StopEffect {
  return destroyEffect.bind(new Effect(fn, options));
}

const immediateOptions = /*@__PURE__*/ { immediate: true };

/**
 * Invokes the given function immediately and each time any of the signals that are read inside
 * are updated (i.e., value changes). Subsequent updates are queued and run asynchronously on the
 * microtask queue.
 */
export function immediateEffect(fn: EffectFunction): StopEffect {
  return effect(fn, immediateOptions);
}

export function isEffect(value: unknown): value is Effect {
  return isNode(value) && isEffectNode(value);
}

export function isEffectNode(node: Node): node is Effect {
  if (__DEV__) {
    return '_scope' in node;
  } else {
    return 'ß' in node;
  }
}

function run(effect: Effect) {
  try {
    effect._scope?.reset();
    effect._signalsTail = null;
    let stop = compute(effect._scope, effect, effect._compute);
    isFunction(stop) && addDisposable(effect._scope, stop);
    removeDeadLinks(effect);
  } catch (error) {
    handleError(effect._scope, error);
  } finally {
    effect._state = STATE_CLEAN;
  }
}
