import { queueEffect, read, updateReaction } from '../compute';
import { onDispose } from '../dispose';
import { FLAG_EFFECT, FLAG_EFFECT_INIT, FLAG_REACTION, FLAG_REACTION_INIT } from '../flags';
import type { Maybe } from '../types';
import { isFunction } from '../utils';
import { destroyNode, isNode, isNodeDead, killNode, type Node } from './node';
import { appendChild, currentScope, Scope } from './scope';
import type { ReadSignal } from './signal';

export class Reaction<T = unknown> implements ReadSignal<T> {
  /** @internal */
  f = FLAG_REACTION_INIT;
  /** @internal */
  _value: T;
  /** @internal */
  _parent: Scope | null = null;
  /** @internal */
  _next: Node | null = null;
  /** @internal */
  _prev: Node | null = null;
  /** @internal */
  _reactions: Reaction[] | null = null;
  /** @internal */
  _scope = new Scope(this);
  /** @internal */
  _signals: ReadSignal[] | null = null;
  /** @internal */
  _compute: () => T;

  constructor(initialValue: T, compute: () => T) {
    this._value = initialValue;
    this._compute = compute;
    if (currentScope) {
      appendChild(currentScope, this);
    }
  }

  get(): T {
    return read(this);
  }

  reset() {
    destroyNode(this, false);
    this._scope.reset();
  }

  destroy() {
    if (isNodeDead(this)) return;
    killNode(this);
    detachReaction(this, 0);
    this._reactions = null;
    this._scope.destroy();
    this._signals = null;
  }
}

export type InferReactionValue<T> = T extends Reaction<infer R> ? R : never;

export function reaction<T>(initialValue: T, compute: () => T): Reaction<T> {
  return new Reaction(initialValue, compute);
}

export function isReactionNode(node: Node): node is Reaction {
  return (node.f & FLAG_REACTION) > 0;
}

export function detachReaction(reaction: Reaction, index: number) {
  let signals = reaction._signals;
  if (!signals) return;

  let signal: ReadSignal, swap: number;

  for (let i = index; i < signals.length; i++) {
    signal = signals[i];
    if (signal._reactions) {
      swap = signal._reactions.indexOf(reaction);
      signal._reactions[swap] = signal._reactions[signal._reactions.length - 1];
      signal._reactions.pop();
    }
  }
}

/**
 * Creates a new signal whose value is computed and returned by the given function. The given
 * compute function is _only_ re-run when one of it's dependencies are updated. Dependencies are
 * are all signals that are read during execution.
 *
 * @see {@link https://github.com/maverick-js/signals#computed}
 */
export function computed<T>(compute: () => T): Reaction<T> {
  return new Reaction(void 0, compute) as Reaction<T>;
}

export class Effect extends Reaction<void> {
  /** @internal */
  override f = FLAG_EFFECT_INIT;

  constructor(fn: EffectFunction, options?: EffectOptions) {
    super(void 0, () => {
      let stop = fn();
      isFunction(stop) && onDispose(stop);
    });

    if (!options?.immediate) {
      queueEffect(this);
    } else {
      updateReaction(this);
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

const destroyEffect = /*@__PURE__*/ Effect.prototype.destroy;

/**
 * Invokes the given function each time any of the signals that are read inside are updated
 * (i.e., value changes). Updates are queued and run asynchronously on the microtask queue.
 *
 * @see {@link https://github.com/maverick-js/signals#effect}
 */
export function effect(fn: EffectFunction, options?: EffectOptions): StopEffect {
  const effect = new Effect(fn, options);
  return destroyEffect.bind(effect);
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
  return (node.f & FLAG_EFFECT) > 0;
}
