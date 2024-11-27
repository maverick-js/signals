import {
  compute,
  createComputation,
  isFunction,
  queueEffect,
  read,
  update,
  write,
} from './compute';
import { TYPE_EFFECT } from './constants';
import { dispose, onDispose } from './dispose';
import { handleError } from './error';
import { createScope, currentScope } from './scope';
import type {
  Computation,
  ComputedSignalOptions,
  Dispose,
  Effect,
  EffectOptions,
  MaybeSignal,
  ReadSignal,
  Scope,
  SignalOptions,
  StopEffect,
  WriteSignal,
} from './types';

export const SIGNAL_SYMBOL = Symbol.for('mk.signal');

/**
 * Creates a computation root which is given a `dispose()` function to dispose of all inner
 * computations.
 *
 * @see {@link https://github.com/maverick-js/signals#root}
 */
export function root<T>(init: (dispose: Dispose) => T): T {
  const scope = createScope();
  return compute(scope, !init.length ? init : init.bind(null, dispose.bind(scope)), null) as T;
}

/**
 * Returns the current value stored inside the given compute function without triggering any
 * dependencies. Use `untrack` if you want to also disable scope tracking.
 *
 * @see {@link https://github.com/maverick-js/signals#peek}
 */
export function peek<T>(fn: () => T): T {
  return compute<T>(currentScope, fn, null);
}

/**
 * Returns the current value inside a signal whilst disabling both scope _and_ observer
 * tracking. Use `peek` if only observer tracking should be disabled.
 *
 * @see {@link https://github.com/maverick-js/signals#untrack}
 */
export function untrack<T>(fn: () => T): T {
  return compute<T>(null, fn, null);
}

/**
 * Runs the given function in the given scope so context and error handling continue to work.
 *
 * @see {@link https://github.com/maverick-js/signals#scoped}
 */
export function scoped<T>(run: () => T, scope: Scope | null): T | undefined {
  try {
    return compute<T>(scope, run, null);
  } catch (error) {
    handleError(scope, error);
    return; // TS -_-
  }
}

/**
 * Wraps the given value into a signal. The signal will return the current value when invoked
 * `fn()`, and provide a simple write API via `set()`. The value can now be observed
 * when used inside other computations created with `computed` and `effect`.
 *
 * @see {@link https://github.com/maverick-js/signals#signal}
 */
export function signal<T>(initialValue: T, options?: SignalOptions<T>): WriteSignal<T> {
  return createWriteSignal(createComputation(initialValue, null, options));
}

/**
 * Whether the given value is a readonly signal.
 *
 * @see {@link https://github.com/maverick-js/signals#isreadsignal}
 */
export function isReadSignal<T>(fn: unknown): fn is ReadSignal<T> {
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
  return createReadSignal(
    createComputation<T | R>(
      options?.initial as R,
      compute,
      options as ComputedSignalOptions<T | R>,
    ),
  );
}

/**
 * Invokes the given function each time any of the signals that are read inside are updated
 * (i.e., their value changes). Updates are queued and run asynchronously on the microtask queue.
 *
 * The first run is also queued, if you'd like to run immediately, pass `true` as the
 * second argument.
 *
 * @see {@link https://github.com/maverick-js/signals#effect}
 */
export function effect(compute: Effect, immediate?: boolean, options?: EffectOptions): StopEffect {
  const node = createComputation<null>(
    null,
    function runEffect() {
      let effectResult = compute();
      isFunction(effectResult) && onDispose(effectResult);
      return null;
    },
    __DEV__ ? { id: options?.id ?? 'effect' } : options,
  );

  node._type |= TYPE_EFFECT;

  if (!immediate) {
    queueEffect(node);
  } else {
    update(node);
  }

  if (__DEV__) {
    return function stopEffect() {
      node.dispose();
    };
  }

  return dispose.bind(node);
}

/**
 * Invokes the given function immediately and each time any of the signals that are read inside
 * are updated (i.e., their value changes). This function is shorthand for `effect(compute, true)`.
 */
export function immediateEffect(compute: Effect, options?: EffectOptions) {
  return effect(compute, true, options);
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
export function isWriteSignal<T>(fn: unknown): fn is WriteSignal<T> {
  return isReadSignal(fn) && 'set' in fn;
}

export function createReadSignal<T>(node: Computation<T>): ReadSignal<T> {
  const signal = read.bind<any>(node) as ReadSignal<T>;
  signal[SIGNAL_SYMBOL] = true;
  if (__DEV__) signal.node = node;
  return signal;
}

export function createWriteSignal<T>(node: Computation<T>): WriteSignal<T> {
  const signal = createReadSignal(node) as WriteSignal<T>;
  signal.set = write.bind<any>(node) as WriteSignal<T>['set'];
  return signal;
}
