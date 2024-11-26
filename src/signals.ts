import { createComputation, dispose, isFunction, onDispose, read, update, write } from './core';
import type {
  ComputedSignalOptions,
  Effect,
  MaybeSignal,
  ReadSignal,
  SignalOptions,
  StopEffect,
  WriteSignal,
} from './types';

export const SIGNAL_SYMBOL = Symbol.for('mk.signal');

/**
 * Wraps the given value into a signal. The signal will return the current value when invoked
 * `fn()`, and provide a simple write API via `set()`. The value can now be observed
 * when used inside other computations created with `computed` and `effect`.
 *
 * @see {@link https://github.com/maverick-js/signals#signal}
 */
export function signal<T>(initialValue: T, options?: SignalOptions<T>): WriteSignal<T> {
  const node = createComputation(initialValue, null, options),
    signal = read.bind(node) as WriteSignal<T>;

  if (__DEV__) signal.node = node;
  signal[SIGNAL_SYMBOL] = true;
  signal.set = write.bind(node) as WriteSignal<T>['set'];

  return signal;
}

/**
 * Whether the given value is a readonly signal.
 *
 * @see {@link https://github.com/maverick-js/signals#isreadsignal}
 */
export function isReadSignal<T>(fn: MaybeSignal<T>): fn is ReadSignal<T> {
  return isFunction(fn) && SIGNAL_SYMBOL in fn;
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
  const node = createComputation<T | R>(
      options?.initial as R,
      compute,
      options as ComputedSignalOptions<T | R>,
    ),
    signal = read.bind(node) as ReadSignal<T | R>;

  signal[SIGNAL_SYMBOL] = true;
  if (__DEV__) signal.node = node;
  return signal;
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
    function runEffect() {
      let effectResult = effect();
      isFunction(effectResult) && onDispose(effectResult);
      return null;
    },
    __DEV__ ? { id: options?.id ?? 'effect' } : void 0,
  );

  signal._effect = true;
  update(signal);

  if (__DEV__) {
    return function stopEffect() {
      dispose.call(signal, true);
    };
  }

  return dispose.bind(signal, true);
}

/**
 * Takes in the given signal and makes it read only by removing access to write operations
 * (i.e., `set()`).
 *
 * @see {@link https://github.com/maverick-js/signals#readonly}
 */
export function readonly<T>(signal: ReadSignal<T>): ReadSignal<T> {
  const readonly = (() => signal()) as ReadSignal<T>;
  readonly[SIGNAL_SYMBOL] = true;
  if (__DEV__) readonly.node = signal.node;
  return readonly;
}

/**
 * Whether the given value is a write signal (i.e., can produce new values via write API).
 *
 * @see {@link https://github.com/maverick-js/signals#iswritesignal}
 */
export function isWriteSignal<T>(fn: MaybeSignal<T>): fn is WriteSignal<T> {
  return isReadSignal(fn) && 'set' in fn;
}
