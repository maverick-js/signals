import {
  FLAG_EFFECT,
  createComputation,
  createSignal,
  dispose,
  isFunction,
  update,
} from './core.js';
import { SIGNAL } from './symbols.js';
import type {
  ComputedSignalOptions,
  Effect,
  ReadSignal,
  SignalOptions,
  StopEffect,
  WriteSignal,
} from './types.js';

/**
 * Wraps the given value into a signal. Read the current value with `get()`, write with `set()`,
 * and read without tracking with `peek()`. The value can be observed when read inside other
 * computations created with `computed` and `effect`.
 *
 * @see {@link https://github.com/maverick-js/signals#signal}
 */
export function signal<T>(initialValue: T, options?: SignalOptions<T>): WriteSignal<T> {
  return createSignal(initialValue, options) as unknown as WriteSignal<T>;
}

/**
 * Whether the given value is a readable signal (a signal, computed, or readonly view).
 *
 * @see {@link https://github.com/maverick-js/signals#isreadsignal}
 */
export function isReadSignal<T>(value: unknown): value is ReadSignal<T> {
  return !!value && (value as ReadSignal<T>)[SIGNAL] === true;
}

/**
 * Creates a new signal whose value is computed and returned by the given function. The given
 * compute function is _only_ re-run when one of it's dependencies are updated. Dependencies are
 * are all signals that are read during execution.
 *
 * @see {@link https://github.com/maverick-js/signals#computed}
 */
export function computed<T, R = never>(
  compute: () => T,
  options?: ComputedSignalOptions<T, R>,
): ReadSignal<T | R> {
  return createComputation<T | R>(
    options?.initial as R,
    compute,
    options as ComputedSignalOptions<T | R>,
  ) as unknown as ReadSignal<T | R>;
}

/**
 * Invokes the given function each time any of the signals that are read inside are updated
 * (i.e., their value changes). The effect is immediately invoked on initialization.
 *
 * @see {@link https://github.com/maverick-js/signals#effect}
 */
export function effect(effect: Effect, options?: { id?: string }): StopEffect {
  const signal = createComputation<null>(
    null,
    // The returned disposer (if any) is registered by `update` - no wrapper closure needed.
    effect as unknown as () => null,
    __DEV__ ? { id: options?.id ?? 'effect' } : void 0,
  );

  signal._state |= FLAG_EFFECT;
  update(signal);

  if (__DEV__) {
    return function stopEffect() {
      dispose.call(signal, true);
    };
  }

  return dispose.bind(signal, true);
}

interface ReadonlySignal<T> extends ReadSignal<T> {
  _source: ReadSignal<T>;
}

const ReadonlyNode = function Readonly<T>(this: ReadonlySignal<T>, source: ReadSignal<T>) {
  this._source = source;
};

const ReadonlyProto = ReadonlyNode.prototype;
ReadonlyProto[SIGNAL] = true;
ReadonlyProto.get = function (this: ReadonlySignal<unknown>) {
  return this._source.get();
};
ReadonlyProto.peek = function (this: ReadonlySignal<unknown>) {
  return this._source.peek();
};

/**
 * Takes in the given signal and makes it read only by removing access to write operations
 * (i.e., `set()`).
 *
 * @see {@link https://github.com/maverick-js/signals#readonly}
 */
export function readonly<T>(signal: ReadSignal<T>): ReadSignal<T> {
  return new ReadonlyNode(signal);
}

/**
 * Whether the given value is a write signal (i.e., can produce new values via `set()`).
 *
 * @see {@link https://github.com/maverick-js/signals#iswritesignal}
 */
export function isWriteSignal<T>(value: unknown): value is WriteSignal<T> {
  return isReadSignal(value) && isFunction((value as WriteSignal<T>).set);
}
