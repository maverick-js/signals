import { queueEffect, read, computeReaction } from '../compute';
import { STATE_DEAD, STATE_DIRTY } from '../constants';
import { onDispose } from '../dispose';
import type { Maybe } from '../types';
import { isFunction } from '../utils';
import { removeLink, type Link } from './link';
import { isNode, type Node } from './node';
import { Scope } from './scope';
import type { ReadSignal } from './signal';

export class Reaction<T = unknown> implements ReadSignal<T> {
  /** @internal */
  _state = STATE_DIRTY;
  /** @internal */
  _value: T;
  /** @internal */
  _version = 0;
  /** @internal */
  _scope: Scope | null = new Scope(this);
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
  }

  get(): T {
    return read(this);
  }

  reset() {
    this._scope!.reset();
  }

  destroy() {
    if (this._state === STATE_DEAD) return;

    this._state = STATE_DEAD;

    if (this._signals) removeLink(this._signals);
    if (this._reactions) removeLink(this._reactions);

    if (this._scope) {
      this._scope._reaction = null;
      this._scope.destroy();
    }
  }
}

export type InferReactionValue<T> = T extends Reaction<infer R> ? R : never;

export function reaction<T>(initialValue: T, compute: () => T): Reaction<T> {
  return new Reaction(initialValue, compute);
}

export function isReactionNode(node: Node): node is Reaction {
  return !!(node as Reaction)._scope;
}

export function isReaction(value: unknown): value is Reaction {
  return isNode(value) && isReactionNode(value);
}

/**
 * Creates a new signal whose value is computed and returned by the given function. The given
 * compute function is _only_ re-run when one of it's dependencies are updated. Dependencies are
 * are all signals that are read during execution.
 *
 * @see {@link https://github.com/maverick-js/signals#computed}
 */
export function computed<T>(compute: () => T): Reaction<T> {
  return reaction(void 0, compute) as Reaction<T>;
}

export const EFFECT_SYMBOL = Symbol.for('mk.effect');

export class Effect extends Reaction<typeof EFFECT_SYMBOL> {
  constructor(fn: EffectFunction, options?: EffectOptions) {
    super(EFFECT_SYMBOL, () => {
      let stop = fn();
      isFunction(stop) && onDispose(stop);
      return EFFECT_SYMBOL;
    });

    if (!options?.immediate) {
      queueEffect(this);
    } else {
      computeReaction(this);
    }
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

const destroy = /*@__PURE__*/ Reaction.prototype.destroy;

/**
 * Invokes the given function each time any of the signals that are read inside are updated
 * (i.e., value changes). Updates are queued and run asynchronously on the microtask queue.
 *
 * @see {@link https://github.com/maverick-js/signals#effect}
 */
export function effect(fn: EffectFunction, options?: EffectOptions): StopEffect {
  return destroy.bind(new Effect(fn, options));
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
  return (node as Reaction)._value === EFFECT_SYMBOL;
}
