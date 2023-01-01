import { createScheduler, type Scheduler } from './scheduler';
import { FLAGS, HANDLERS, SCOPE, TASKS } from './symbols';
import type {
  Callable,
  Computation,
  ComputedSignalOptions,
  Dispose,
  Effect,
  MaybeDispose,
  MaybeSignal,
  ReadSignal,
  Scope,
  ScopeConstructor,
  DisposeScope,
  SelectorSignal,
  SignalOptions,
  StopEffect,
  WriteSignal,
} from './types';

let i = 0,
  effects: Computation[] = [],
  currentScope: Computation | null = null,
  currentObserver: Computation | null = null,
  currentObservers: Computation[] | null = null,
  currentObserversIndex = 0;

const SCHEDULER = createScheduler(),
  NOOP = () => {},
  FLAG_DIRTY = 1 << 0,
  FLAG_SCOPED = 1 << 1,
  FLAG_INIT = 1 << 2,
  FLAG_DISPOSED = 1 << 3;

SCHEDULER.onFlush(function flushEffects() {
  if (!effects.length) return;

  let effect: Computation;

  for (let i = 0; i < effects.length; i++) {
    effect = effects[i];
    // If parent scope is dirty it means that this effect will be disposed of so we skip.
    if (!isZombie(effect)) read.call(effect);
  }

  effects = [];
});

// These are used only for debugging to determine how a cycle occurred.
let callStack: Computation[];
let computeStack: Computation[];

if (__DEV__) {
  callStack = [];
  computeStack = [];
  SCHEDULER.onFlush(() => {
    callStack = [];
  });
}

/**
 * Creates a computation root which is given a `dispose()` function to dispose of all inner
 * computations.
 *
 * @see {@link https://github.com/maverick-js/signals#root}
 */
export function root<T>(init: (dispose: DisposeScope) => T): T {
  const scope = new RootScope();
  return compute<T>(
    scope,
    !init.length ? (init as () => T) : init.bind(null, dispose.bind(scope)),
    null,
  );
}

/**
 * Returns the current value stored inside the given compute function without triggering any
 * dependencies. Use `untrack` if you want to also disable scope tracking.
 *
 * @see {@link https://github.com/maverick-js/signals#peek}
 */
export function peek<T>(compute: () => T): T {
  const prevObserver = currentObserver;

  currentObserver = null;
  const result = compute();
  currentObserver = prevObserver;

  return result;
}

/**
 * Returns the current value inside a signal whilst disabling both scope _and_ observer
 * tracking. Use `peek` if only observer tracking should be disabled.
 *
 * @see {@link https://github.com/maverick-js/signals#untrack}
 */
export function untrack<T>(compute: () => T): T {
  const prevScope = currentScope,
    prevObserver = currentObserver;

  currentScope = null;
  currentObserver = null;
  const result = compute();
  currentScope = prevScope;
  currentObserver = prevObserver;

  return result;
}

/**
 * Wraps the given value into a signal. The signal will return the current value when invoked
 * `fn()`, and provide a simple write API via `set()`. The value can now be observed
 * when used inside other computations created with `computed` and `effect`.
 *
 * @see {@link https://github.com/maverick-js/signals#signal}
 */
export function signal<T>(initialValue: T, options?: SignalOptions<T>): WriteSignal<T> {
  const node = createComputation<T>(initialValue, null, options),
    signal = read.bind(node) as WriteSignal<T>;

  if (__DEV__) signal.node = node;
  signal.set = write.bind(node);

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
  ) as ReadSignal<T | R>;
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
 * By default, signal updates are batched on the microtask queue which is an async process. You can
 * flush the queue synchronously to get the latest updates by calling `tick()`.
 *
 * @see {@link https://github.com/maverick-js/signals#tick}
 */
export function tick(): void {
  SCHEDULER.flushSync();
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
 * Returns the currently executing parent scope.
 *
 * @see {@link https://github.com/maverick-js/signals#getscope}
 */
export function getScope(): Scope | null {
  return currentScope;
}

/**
 * Returns the global scheduler.
 *
 * @see {@link https://github.com/maverick-js/signals#getscheduler}
 */
export function getScheduler(): Scheduler {
  return SCHEDULER;
}

/**
 * Runs the given function in the given scope so context and error handling continue to work.
 *
 * @see {@link https://github.com/maverick-js/signals#scoped}
 */
export function scoped(run: Callable, scope: Scope | null): void {
  try {
    compute(scope, run, null);
  } catch (error) {
    handleError(scope, error);
  }
}

/**
 * Attempts to get a context value for the given key. It will start from the parent scope and
 * walk up the computation tree trying to find a context record and matching key. If no value can
 * be found `undefined` will be returned.
 *
 * @see {@link https://github.com/maverick-js/signals#getcontext}
 */
export function getContext<T>(key: string | symbol): T | undefined {
  return lookup(currentScope, key);
}

/**
 * Attempts to set a context value on the parent scope with the given key. This will be a no-op if
 * no parent is defined.
 *
 * @see {@link https://github.com/maverick-js/signals#setcontext}
 */
export function setContext<T>(key: string | symbol, value: T) {
  if (currentScope) (currentScope._context ??= {})[key] = value;
}

/**
 * Runs the given function when an error is thrown in a child scope. If the error is thrown again
 * inside the error handler, it will trigger the next available parent scope handler.
 *
 * @see {@link https://github.com/maverick-js/signals#onerror}
 */
export function onError<T = Error>(handler: (error: T) => void): void {
  if (!currentScope) return;
  const context = (currentScope._context ??= {});
  if (!context[HANDLERS]) context[HANDLERS] = [];
  (context[HANDLERS] as any[]).push(handler);
}

/**
 * Runs the given function when the parent scope computation is being disposed.
 *
 * @see {@link https://github.com/maverick-js/signals#ondispose}
 */
export function onDispose(dispose: MaybeDispose): Dispose {
  if (!dispose || !currentScope) return dispose || NOOP;

  const node = currentScope;

  if (!node._disposal) {
    node._disposal = dispose;
  } else if (Array.isArray(node._disposal)) {
    node._disposal.push(dispose);
  } else {
    node._disposal = [node._disposal, dispose];
  }

  return function removeDispose() {
    if (isDisposed(node)) return;
    dispose.call(null);
    if (isFunction(node._disposal)) {
      node._disposal = null;
    } else if (Array.isArray(node._disposal)) {
      node._disposal.splice(node._disposal.indexOf(dispose), 1);
    }
  };
}

const scopes = new Set();

function dispose(this: Computation, self = true) {
  if (isDisposed(this)) return;

  let current: Computation | null = self ? this : this._nextSibling,
    head = self ? this._prevSibling : this;

  if (current) {
    scopes.add(this);
    do {
      if (current._disposal) emptyDisposal(current);
      if (current._sources) removeSourceObservers(current, 0);
      current[SCOPE] = null;
      current._sources = null;
      current._observers = null;
      current._prevSibling = null;
      current._context = null;
      current[FLAGS] |= FLAG_DISPOSED;
      scopes.add(current);
      current = current._nextSibling;
      if (current) current._prevSibling!._nextSibling = null;
    } while (current && scopes.has(current[SCOPE]));
  }

  if (head) head._nextSibling = current;
  if (current) current._prevSibling = head;
  scopes.clear();
}

function emptyDisposal(scope: Computation) {
  try {
    if (Array.isArray(scope._disposal)) {
      for (i = 0; i < (scope._disposal as Dispose[]).length; i++) {
        const callable = scope._disposal![i];
        callable.call(callable);
      }
    } else {
      scope._disposal!.call(scope._disposal);
    }

    scope._disposal = null;
  } catch (error) {
    handleError(scope, error);
  }
}

export function compute<Result>(
  scope: Scope | null,
  compute: Callable<Scope | null, Result>,
  observer: Computation | null,
): Result {
  const prevScope = currentScope,
    prevObserver = currentObserver;

  if (__DEV__ && currentObserver) computeStack.push(currentObserver);
  currentScope = scope;
  currentObserver = observer;

  try {
    return compute.call(scope);
  } finally {
    if (__DEV__ && currentObserver) computeStack.pop();
    currentScope = prevScope;
    currentObserver = prevObserver;
  }
}

function lookup(scope: Computation | null, key: string | symbol): any {
  if (!scope) return;

  let current: Computation | null = scope,
    value;

  while (current) {
    value = current._context?.[key];
    if (value !== undefined) return value;
    current = current[SCOPE];
  }
}

function handleError(scope: Computation | null, error: unknown, depth?: number) {
  const handlers = lookup(scope, HANDLERS);

  if (!handlers) throw error;

  try {
    const coercedError = error instanceof Error ? error : Error(JSON.stringify(error));
    for (const handler of handlers) handler(coercedError);
  } catch (error) {
    handleError(scope![SCOPE], error);
  }
}

/**
 * Creates a signal that observes the given `source` and returns a new signal who only notifies
 * observers when entering or exiting a specified key.
 */
export function selector<T>(source: ReadSignal<T>): SelectorSignal<T> {
  let currentKey: T | undefined,
    nodes = new Map<T, Selector<T>>();

  read.call(
    createComputation<T | undefined>(currentKey, function selectorChange() {
      const newKey = source(),
        prev = nodes.get(currentKey!),
        next = nodes.get(newKey);
      prev && write.call(prev as unknown as Computation, false);
      next && write.call(next as unknown as Computation, true);
      return (currentKey = newKey);
    }),
  );

  interface Selector<T = any> {
    [FLAGS]: number;
    _key: T;
    _value: boolean;
    _count: number;
    call(): void;
  }

  function Selector<T>(this: Selector<T>, key: T, initialValue: boolean) {
    this._key = key;
    this._value = initialValue;
  }

  const SelectorProto = Selector.prototype;
  SelectorProto[FLAGS] = FLAG_DIRTY;
  SelectorProto._observers = null;
  SelectorProto._changed = isNotEqual;
  SelectorProto.call = function (this: Selector<T>) {
    this._count -= 1;
    if (!this._count) nodes.delete(this._key);
  };

  return function observeSelector(key: T) {
    let node = nodes.get(key);

    if (!node) nodes.set(key, (node = new Selector(key, key === currentKey)));

    node!._count += 1;
    onDispose(node);

    return read.bind(node as unknown as Computation);
  };
}

function createComputation<T>(
  initialValue: T,
  compute: (() => T) | null,
  options?: ComputedSignalOptions<T>,
): Computation<T> {
  const node = {
    [FLAGS]: FLAG_DIRTY,
    [SCOPE]: currentScope,
    _nextSibling: null,
    _prevSibling: null,
    _context: null,
    _sources: null,
    _observers: null,
    _disposal: null,
    _value: initialValue,
    _compute: compute,
    _changed: isNotEqual,
    call: read,
  } as Computation;

  if (__DEV__) node.id = options?.id ?? (node._compute ? 'computed' : 'signal');

  if (currentScope) appendScope(node);

  if (options) {
    if (options.scoped) node[FLAGS] |= FLAG_SCOPED;
    if (options.dirty) node._changed = options.dirty;
  }

  return node;
}

function read(this: Computation<any>): any {
  if (isDisposed(this)) return this._value;

  if (__DEV__ && this._compute && computeStack.includes(this)) {
    const calls = callStack.map((c) => c.id ?? '?').join(' --> ');
    throw Error(`cyclic dependency detected\n\n${calls}\n`);
  }

  if (__DEV__) callStack.push(this);

  if (currentObserver) {
    if (
      !currentObservers &&
      currentObserver._sources &&
      currentObserver._sources[currentObserversIndex] == this
    ) {
      currentObserversIndex++;
    } else if (!currentObservers) currentObservers = [this];
    else currentObservers.push(this);
  }

  if (this._compute && isDirty(this)) {
    let prevObservers = currentObservers,
      prevObserversIndex = currentObserversIndex;

    currentObservers = null as Computation[] | null;
    currentObserversIndex = 0;

    try {
      const scoped = isScoped(this);

      if (scoped) {
        if (this._nextSibling && this._nextSibling[SCOPE] === this) dispose.call(this, false);
        if (this._disposal) emptyDisposal(this);
        if (this._context && this._context[HANDLERS]) (this._context[HANDLERS] as any[]) = [];
      }

      const result = compute(scoped ? this : currentScope!, this._compute, this);

      if (currentObservers) {
        if (this._sources) removeSourceObservers(this, currentObserversIndex);

        if (this._sources && currentObserversIndex > 0) {
          this._sources.length = currentObserversIndex + currentObservers.length;
          for (i = 0; i < currentObservers.length; i++) {
            this._sources[currentObserversIndex + i] = currentObservers[i];
          }
        } else {
          this._sources = currentObservers;
        }

        let source: Computation;
        for (i = currentObserversIndex; i < this._sources.length; i++) {
          source = this._sources[i];
          if (!source._observers) source._observers = [this];
          else source._observers.push(this);
        }
      } else if (this._sources && currentObserversIndex < this._sources.length) {
        removeSourceObservers(this, currentObserversIndex);
        this._sources.length = currentObserversIndex;
      }

      if (scoped || !isInit(this)) {
        this._value = result;
      } else {
        write.call(this, result);
      }
    } catch (error) {
      if (__DEV__ && !__TEST__ && !isInit(this) && typeof this._value === 'undefined') {
        console.error(
          `computed \`${this.id}\` threw error during first run, this can be fatal.` +
            '\n\nSolutions:\n\n' +
            '1. Set the `initial` option to silence this error',
          '\n2. Or, use an `effect` if the return value is not being used',
          '\n\n',
          error,
        );
      }

      handleError(this, error);
      return this._value;
    }

    currentObservers = prevObservers;
    currentObserversIndex = prevObserversIndex;

    this[FLAGS] |= FLAG_INIT;
    this[FLAGS] &= ~FLAG_DIRTY;
  }

  return this._value;
}

function write(this: Computation<any>, newValue: any): any {
  const value = !isFunction(this._value) && isFunction(newValue) ? newValue(this._value) : newValue;

  if (isDisposed(this) || !this._changed(this._value, value)) return this._value;

  this._value = value;

  if (!this._observers || !this._observers.length) return this._value;

  const tasks = SCHEDULER[TASKS]();

  for (i = 0; i < this._observers!.length; i++) {
    const observer = this._observers![i];
    if (observer._compute) {
      observer[FLAGS] |= FLAG_DIRTY;
      if (isScoped(observer)) {
        effects.push(observer);
      } else {
        tasks.push(observer);
      }
    }
  }

  SCHEDULER.flush();

  return this._value;
}

function removeSourceObservers(node: Computation, index: number) {
  let source: Computation, swap: number;
  for (let i = index; i < node._sources!.length; i++) {
    source = node._sources![i];
    if (source._observers) {
      swap = source._observers.indexOf(node);
      source._observers[swap] = source._observers[source._observers.length - 1];
      source._observers.pop();
    }
  }
}

function appendScope(node: Computation) {
  node._prevSibling = currentScope!;
  if (currentScope!._nextSibling) {
    const next = currentScope!._nextSibling;
    currentScope!._nextSibling = node;
    node._nextSibling = next;
    next._prevSibling = node;
  } else {
    currentScope!._nextSibling = node;
  }
}

export function isNotEqual(a: unknown, b: unknown) {
  return a !== b;
}

export function isFunction(value: unknown): value is Function {
  return typeof value === 'function';
}

function isDisposed(node: Computation) {
  return node[FLAGS] & FLAG_DISPOSED;
}

function isDirty(node: Computation) {
  return node[FLAGS] & FLAG_DIRTY;
}

function isInit(node: Computation) {
  return node[FLAGS] & FLAG_INIT;
}

function isScoped(node: Computation) {
  return node[FLAGS] & FLAG_SCOPED;
}

function isZombie(node: Computation) {
  let scope = node[SCOPE];
  while (scope && !isDirty(scope)) scope = scope[SCOPE];
  return scope !== null;
}

export const RootScope = function RootScope(this: Computation) {
  if (currentScope) {
    this[SCOPE] = currentScope;
    appendScope(this);
  }
} as ScopeConstructor;

const RootScopeProto = RootScope.prototype as Computation;
RootScopeProto[SCOPE] = null;
RootScopeProto._prevSibling = null;
RootScopeProto._nextSibling = null;
RootScopeProto.call = dispose;
