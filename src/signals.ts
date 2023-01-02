import {
  createComputation,
  dispose,
  FLAG_DIRTY,
  FLAG_SCOPED,
  isFunction,
  isNotEqual,
  onDispose,
  read,
  write,
} from './core';
import { FLAGS } from './symbols';
import type {
  Computation,
  ComputedSignalOptions,
  Effect,
  MaybeSignal,
  ReadSignal,
  SelectorSignal,
  SignalOptions,
  StopEffect,
  WriteSignal,
} from './types';

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
  signal.set = write.bind(node) as WriteSignal<T>['set'];

  return signal;
}

/**
 * Whether the given value is a readonly signal.
 *
 * @see {@link https://github.com/maverick-js/signals#isreadsignal}
 */
export function isReadSignal<T>(fn: MaybeSignal<T>): fn is ReadSignal<T> {
  return isFunction(fn);
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
  if (__DEV__) {
    const node = createComputation<T | R>(
      options?.initial as R,
      compute,
      options as ComputedSignalOptions<T | R>,
    );
    const signal = read.bind(node) as ReadSignal<T | R>;
    signal.node = node;
    return signal;
  }

  return read.bind(
    createComputation<T | R>(
      options?.initial as R,
      compute,
      options as ComputedSignalOptions<T | R>,
    ),
  );
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

  signal[FLAGS] |= FLAG_SCOPED;

  read.call(signal);

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
  if (__DEV__) {
    const readonly = (() => signal()) as ReadSignal<T>;
    readonly.node = signal.node;
    return readonly;
  }

  return (() => signal()) as ReadSignal<T>;
}

/**
 * Whether the given value is a write signal (i.e., can produce new values via write API).
 *
 * @see {@link https://github.com/maverick-js/signals#iswritesignal}
 */
export function isWriteSignal<T>(fn: MaybeSignal<T>): fn is WriteSignal<T> {
  return isReadSignal(fn) && 'set' in fn;
}

/**
 * Creates a signal that observes the given `source` and returns a new signal who only notifies
 * observers when entering or exiting a specified key.
 */
export function selector<T>(source: ReadSignal<T>): SelectorSignal<T> {
  let currentKey: T | undefined,
    nodes = new Map<T, Selector<T>>();

  read.call(
    createComputation(currentKey, function selectorChange() {
      const newKey = source(),
        prev = nodes.get(currentKey!),
        next = nodes.get(newKey);
      prev && write.call(prev, false);
      next && write.call(next, true);
      return (currentKey = newKey);
    }),
  );

  return function observeSelector(key: T) {
    let node = nodes.get(key);

    if (!node) nodes.set(key, (node = new Selector(key, key === currentKey, nodes)));

    node!._refs += 1;
    onDispose(node);

    return read.bind(node!);
  };
}

interface Selector<T = any> extends Computation {
  [FLAGS]: number;
  _key: T;
  _value: boolean;
  _nodes: Map<T, Selector> | null;
  _refs: number;
  call(): void;
}

function Selector<T>(this: Selector<T>, key: T, initialValue: boolean, nodes: Map<T, Selector>) {
  this[FLAGS] = FLAG_DIRTY;
  this._key = key;
  this._value = initialValue;
  this._refs = 0;
  this._nodes = nodes;
  this._observers = null;
}

const SelectorProto = Selector.prototype;
SelectorProto._changed = isNotEqual;
SelectorProto.call = function (this: Selector) {
  this._refs -= 1;
  if (!this._refs) {
    this._nodes!.delete(this._key);
    this._nodes = null;
  }
};
