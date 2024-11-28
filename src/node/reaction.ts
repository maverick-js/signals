import { queueEffect, updateReaction } from '../compute';
import { onDispose } from '../dispose';
import { FLAG_EFFECT, FLAG_EFFECT_INIT, FLAG_REACTION, FLAG_REACTION_INIT } from '../flags';
import type { Maybe } from '../types';
import { isFunction } from '../utils';
import { destroyNode, isNode, type Node } from './node';
import { Scope } from './scope';
import { ReadSignal, type SignalOptions } from './signal';

export class Reaction<T = unknown> extends ReadSignal<T> {
  /** @internal */
  override f = FLAG_REACTION_INIT;

  /** @internal */
  _scope = new Scope(this);
  /** @internal */
  _signals: ReadSignal[] | null = null;
  /** @internal */
  _compute: () => T;

  constructor(initialValue: T, compute: () => T, options?: SignalOptions<T>) {
    super(initialValue, options);
    this._compute = compute;
  }

  reset() {
    destroyNode(this, false);
    this._scope.reset();
  }

  override destroy() {
    super.destroy();
    detachReaction(this, 0);
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
  let observables = reaction._signals;
  if (!observables) return;

  let source: ReadSignal, swap: number;

  for (let i = index; i < observables.length; i++) {
    source = observables[i];
    if (source._reactions) {
      swap = source._reactions.indexOf(reaction);
      source._reactions[swap] = source._reactions[source._reactions.length - 1];
      source._reactions.pop();
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
