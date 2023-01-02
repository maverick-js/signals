import { createScheduler, type Scheduler } from './scheduler';
import { FLAGS, HANDLERS, SCOPE, TASKS } from './symbols';
import type {
  Callable,
  Computation,
  ComputedSignalOptions,
  Dispose,
  MaybeDispose,
  Scope,
  DisposeScope,
} from './types';

let i = 0,
  currentScope: Scope | null = null,
  currentObserver: Computation | null = null,
  currentObservers: Computation[] | null = null,
  currentObserversIndex = 0,
  effects: Computation[] = [];

const SCHEDULER = createScheduler(),
  NOOP = () => {};

export const FLAG_DIRTY = 1 << 0;
export const FLAG_SCOPED = 1 << 1;
export const FLAG_INIT = 1 << 2;
export const FLAG_DISPOSED = 1 << 3;

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
  const scope = createScope();
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
 * By default, signal updates are batched on the microtask queue which is an async process. You can
 * flush the queue synchronously to get the latest updates by calling `tick()`.
 *
 * @see {@link https://github.com/maverick-js/signals#tick}
 */
export function tick(): void {
  SCHEDULER.flushSync();
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

export function dispose(this: Scope, self = true) {
  if (isDisposed(this)) return;

  let current = (self ? this : this._nextSibling) as Computation | null,
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
      current = current._nextSibling as Computation | null;
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

function lookup(scope: Scope | null, key: string | symbol): any {
  if (!scope) return;

  let current: Scope | null = scope,
    value;

  while (current) {
    value = current._context?.[key];
    if (value !== undefined) return value;
    current = current[SCOPE];
  }
}

function handleError(scope: Scope | null, error: unknown, depth?: number) {
  const handlers = lookup(scope, HANDLERS);

  if (!handlers) throw error;

  try {
    const coercedError = error instanceof Error ? error : Error(JSON.stringify(error));
    for (const handler of handlers) handler(coercedError);
  } catch (error) {
    handleError(scope![SCOPE], error);
  }
}

export function read(this: Computation): any {
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

      const result = compute(scoped ? this : currentScope, this._compute, this);

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

      if (!scoped && isInit(this)) {
        write.call(this, result);
      } else {
        this._value = result;
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

export function write(this: Computation, newValue: any): any {
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

const ScopeNode = function Scope(this: Scope) {
  this[SCOPE] = currentScope;
  this[FLAGS] = FLAG_SCOPED;
  this._nextSibling = null;
  this._prevSibling = currentScope;
  if (currentScope) appendScope(this);
};

const ScopeProto = ScopeNode.prototype;
ScopeProto._context = null;
ScopeProto._compute = null;
ScopeProto._disposal = null;

export function createScope(): Scope {
  return new ScopeNode();
}

const ComputeNode = function Computation(
  this: Computation,
  initialValue,
  compute,
  options?: ComputedSignalOptions<any, any>,
) {
  ScopeNode.call(this);

  this[FLAGS] = FLAG_DIRTY;
  this._sources = null;
  this._observers = null;
  this._value = initialValue;

  if (__DEV__) this.id = options?.id ?? (this._compute ? 'computed' : 'signal');

  if (compute) this._compute = compute;

  if (options) {
    if (options.scoped) this[FLAGS] |= FLAG_SCOPED;
    if (options.dirty) this._changed = options.dirty;
  }
};

const ComputeProto: Computation = ComputeNode.prototype;
Object.setPrototypeOf(ComputeProto, ScopeProto);
ComputeProto._changed = isNotEqual;
ComputeProto.call = read;

export function createComputation<T>(
  initialValue: T,
  compute: (() => T) | null,
  options?: ComputedSignalOptions<T>,
) {
  return new ComputeNode(initialValue, compute, options);
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

export function isNotEqual(a: unknown, b: unknown) {
  return a !== b;
}

export function isFunction(value: unknown): value is Function {
  return typeof value === 'function';
}

export function isDisposed(node: Scope) {
  return node[FLAGS] & FLAG_DISPOSED;
}

export function isDirty(node: Scope) {
  return node[FLAGS] & FLAG_DIRTY;
}

export function isInit(node: Scope) {
  return node[FLAGS] & FLAG_INIT;
}

export function isScoped(node: Scope) {
  return node[FLAGS] & FLAG_SCOPED;
}

export function isZombie(node: Scope) {
  let scope = node[SCOPE];

  while (scope) {
    // We're looking for a dirty parent effect scope.
    if (scope._compute && isDirty(scope)) return true;
    scope = scope[SCOPE];
  }

  return false;
}

function appendScope(scope: Scope) {
  if (currentScope!._nextSibling) currentScope!._nextSibling._prevSibling = scope;
  scope._nextSibling = currentScope!._nextSibling;
  currentScope!._nextSibling = scope;
}
