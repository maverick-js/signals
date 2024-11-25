import { SCOPE } from './symbols';
import type {
  Callable,
  Computation,
  ComputedSignalOptions,
  Dispose,
  MaybeDisposable,
  Scope,
} from './types';

let scheduledEffects = false,
  runningEffects = false,
  currentScope: Scope | null = null,
  currentObserver: Computation | null = null,
  currentObservers: Computation[] | null = null,
  currentObserversIndex = 0,
  effects: Computation[] = [],
  defaultContext = {};

const NOOP = () => {},
  // For more information about this graph tracking scheme see Reactively:
  // https://github.com/modderme123/reactively/blob/main/packages/core/src/core.ts#L21
  STATE_CLEAN = 0,
  STATE_CHECK = 1,
  STATE_DIRTY = 2,
  STATE_DISPOSED = 3;

function flushEffects() {
  scheduledEffects = true;
  queueMicrotask(runEffects);
}

function runEffects() {
  if (!effects.length) {
    scheduledEffects = false;
    return;
  }

  runningEffects = true;

  for (let i = 0; i < effects.length; i++) {
    if (effects[i]._state !== STATE_CLEAN) runTop(effects[i]);
  }

  effects = [];
  scheduledEffects = false;
  runningEffects = false;
}

function runTop(node: Computation<any>) {
  let ancestors = [node];

  while ((node = node[SCOPE] as Computation<any>)) {
    if (node._effect && node._state !== STATE_CLEAN) ancestors.push(node);
  }

  for (let i = ancestors.length - 1; i >= 0; i--) {
    updateCheck(ancestors[i]);
  }
}

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
 * By default, updates are batched on the microtask queue which is an async process. You can
 * flush the queue synchronously to get the latest updates by calling this function.
 *
 * @see {@link https://github.com/maverick-js/signals#flushSync}
 */
export function flushSync(): void {
  if (!runningEffects) runEffects();
}

/** @deprecated use flushSync */
export const tick = flushSync;

/**
 * Returns the currently executing parent scope.
 *
 * @see {@link https://github.com/maverick-js/signals#getscope}
 */
export function getScope(): Scope | null {
  return currentScope;
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
 * Attempts to get a context value for the given key. It will start from the parent scope and
 * walk up the computation tree trying to find a context record and matching key. If no value can
 * be found `undefined` will be returned.
 *
 * @see {@link https://github.com/maverick-js/signals#getcontext}
 */
export function getContext<T>(
  key: string | symbol,
  scope: Scope | null = currentScope,
): T | undefined {
  return scope?._context![key] as T | undefined;
}

/**
 * Attempts to set a context value on the parent scope with the given key. This will be a no-op if
 * no parent is defined.
 *
 * @see {@link https://github.com/maverick-js/signals#setcontext}
 */
export function setContext<T>(key: string | symbol, value: T, scope: Scope | null = currentScope) {
  if (scope) scope._context = { ...scope._context, [key]: value };
}

/**
 * Runs the given function when an error is thrown in a child scope. If the error is thrown again
 * inside the error handler, it will trigger the next available parent scope handler.
 *
 * @see {@link https://github.com/maverick-js/signals#onerror}
 */
export function onError<T = Error>(handler: (error: T) => void): void {
  if (!currentScope) return;
  currentScope._handlers = currentScope._handlers
    ? [handler, ...currentScope._handlers]
    : [handler];
}

/**
 * Runs the given function when the parent scope computation is being disposed.
 *
 * @see {@link https://github.com/maverick-js/signals#ondispose}
 */
export function onDispose(disposable: MaybeDisposable): Dispose {
  if (!disposable || !currentScope) return (disposable as Dispose) || NOOP;

  const node = currentScope;

  if (!node._disposal) {
    node._disposal = disposable;
  } else if (Array.isArray(node._disposal)) {
    node._disposal.push(disposable);
  } else {
    node._disposal = [node._disposal, disposable];
  }

  return function removeDispose() {
    if (node._state === STATE_DISPOSED) return;
    disposable.call(null);
    if (isFunction(node._disposal)) {
      node._disposal = null;
    } else if (Array.isArray(node._disposal)) {
      node._disposal.splice(node._disposal.indexOf(disposable), 1);
    }
  };
}

export function dispose(this: Scope, self = true) {
  if (this._state === STATE_DISPOSED) return;

  if (this._children) {
    if (Array.isArray(this._children)) {
      for (let i = this._children.length - 1; i >= 0; i--) {
        dispose.call(this._children[i]);
      }
    } else {
      dispose.call(this._children);
    }
  }

  if (self) {
    const parent = this[SCOPE];

    if (parent) {
      if (Array.isArray(parent._children)) {
        parent._children.splice(parent._children.indexOf(this), 1);
      } else {
        parent._children = null;
      }
    }

    disposeNode(this as Computation);
  }
}

function disposeNode(node: Computation) {
  node._state = STATE_DISPOSED;
  if (node._disposal) emptyDisposal(node);
  if (node._sources) removeSourceObservers(node, 0);
  node[SCOPE] = null;
  node._sources = null;
  node._observers = null;
  node._children = null;
  node._context = defaultContext;
  node._handlers = null;
}

function emptyDisposal(scope: Computation) {
  try {
    if (Array.isArray(scope._disposal)) {
      for (let i = scope._disposal.length - 1; i >= 0; i--) {
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

  currentScope = scope;
  currentObserver = observer;

  try {
    return compute.call(scope);
  } finally {
    currentScope = prevScope;
    currentObserver = prevObserver;
  }
}

function handleError(scope: Scope | null, error: unknown) {
  if (!scope || !scope._handlers) throw error;

  let i = 0,
    len = scope._handlers.length,
    currentError = error;

  for (i = 0; i < len; i++) {
    try {
      scope._handlers[i](currentError);
      break; // error was handled.
    } catch (error) {
      currentError = error;
    }
  }

  // Error was not handled.
  if (i === len) {
    // Filter out internals from the stack trace.
    if (__DEV__ && currentError instanceof Error) {
      const stack = currentError.stack;
      if (stack) {
        let line = '',
          lines = stack.split('\n'),
          filteredLines: string[] = [];

        for (let i = 0; i < lines.length; i++) {
          line = lines[i];
          if (line.includes('@maverick-js')) continue;
          filteredLines.push(line);
        }

        Object.defineProperty(error, 'stack', {
          value: stack + filteredLines.join('\n'),
        });
      }
    }

    throw currentError;
  }
}

export function read(this: Computation): any {
  if (this._state === STATE_DISPOSED) return this._value;

  if (currentObserver && !this._effect) {
    if (
      !currentObservers &&
      currentObserver._sources &&
      currentObserver._sources[currentObserversIndex] == this
    ) {
      currentObserversIndex++;
    } else if (!currentObservers) currentObservers = [this];
    else currentObservers.push(this);
  }

  if (this._compute) updateCheck(this);

  return this._value;
}

export function write(this: Computation, newValue: any): any {
  const value = isFunction(newValue) ? newValue(this._value) : newValue;

  if (this._changed(this._value, value)) {
    this._value = value;
    if (this._observers) {
      for (let i = 0; i < this._observers.length; i++) {
        notify(this._observers[i], STATE_DIRTY);
      }
    }
  }

  return this._value;
}

const ScopeNode = function Scope(this: Scope) {
  this[SCOPE] = null;
  this._children = null;
  if (currentScope) currentScope.append(this);
};

const ScopeProto = ScopeNode.prototype;
ScopeProto._context = defaultContext;
ScopeProto._handlers = null;
ScopeProto._compute = null;
ScopeProto._disposal = null;

ScopeProto.append = function (this: Scope, child: Scope) {
  child[SCOPE] = this;

  if (!this._children) {
    this._children = child;
  } else if (Array.isArray(this._children)) {
    this._children.push(child);
  } else {
    this._children = [this._children, child];
  }

  child._context =
    child._context === defaultContext ? this._context : { ...this._context, ...child._context };

  if (this._handlers) {
    child._handlers = !child._handlers ? this._handlers : [...child._handlers, ...this._handlers];
  }
};

ScopeProto.dispose = function (this: Scope) {
  dispose.call(this);
};

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

  this._state = compute ? STATE_DIRTY : STATE_CLEAN;
  this._init = false;
  this._effect = false;
  this._sources = null;
  this._observers = null;
  this._value = initialValue;

  if (__DEV__) this.id = options?.id ?? (this._compute ? 'computed' : 'signal');
  if (compute) this._compute = compute;
  if (options && options.dirty) this._changed = options.dirty;
};

const ComputeProto: Computation = ComputeNode.prototype;
Object.setPrototypeOf(ComputeProto, ScopeProto);
ComputeProto._changed = isNotEqual;
ComputeProto.call = read;

export function createComputation<T>(
  initialValue: T,
  compute: (() => T) | null,
  options?: ComputedSignalOptions<T>,
): Computation<T> {
  return new ComputeNode(initialValue, compute, options);
}

export function isNotEqual(a: unknown, b: unknown) {
  return a !== b;
}

export function isFunction(value: unknown): value is Function {
  return typeof value === 'function';
}

function updateCheck(node: Computation) {
  if (node._state === STATE_CHECK) {
    for (let i = 0; i < node._sources!.length; i++) {
      updateCheck(node._sources![i]);
      if ((node._state as number) === STATE_DIRTY) {
        // Stop the loop here so we won't trigger updates on other parents unnecessarily
        // If our computation changes to no longer use some sources, we don't
        // want to update() a source we used last time, but now don't use.
        break;
      }
    }
  }

  if (node._state === STATE_DIRTY) update(node);
  else node._state = STATE_CLEAN;
}

function cleanup(node: Computation) {
  if (node._children) dispose.call(node, false);
  if (node._disposal) emptyDisposal(node);
  node._handlers = node[SCOPE] ? node[SCOPE]._handlers : null;
}

export function update(node: Computation) {
  let prevObservers = currentObservers,
    prevObserversIndex = currentObserversIndex;

  currentObservers = null as Computation[] | null;
  currentObserversIndex = 0;

  try {
    cleanup(node);

    const result = compute(node, node._compute!, node);

    updateObservers(node);

    if (!node._effect && node._init) {
      write.call(node, result);
    } else {
      node._value = result;
      node._init = true;
    }
  } catch (error) {
    if (__DEV__ && !__TEST__ && !node._init && typeof node._value === 'undefined') {
      console.error(
        `computed \`${node.id}\` threw error during first run, this can be fatal.` +
          '\n\nSolutions:\n\n' +
          '1. Set the `initial` option to silence this error',
        '\n2. Or, use an `effect` if the return value is not being used',
        '\n\n',
        error,
      );
    }

    updateObservers(node);
    handleError(node, error);
  } finally {
    currentObservers = prevObservers;
    currentObserversIndex = prevObserversIndex;
    node._state = STATE_CLEAN;
  }
}

function updateObservers(node: Computation) {
  if (currentObservers) {
    if (node._sources) removeSourceObservers(node, currentObserversIndex);

    if (node._sources && currentObserversIndex > 0) {
      node._sources.length = currentObserversIndex + currentObservers.length;
      for (let i = 0; i < currentObservers.length; i++) {
        node._sources[currentObserversIndex + i] = currentObservers[i];
      }
    } else {
      node._sources = currentObservers;
    }

    let source: Computation;
    for (let i = currentObserversIndex; i < node._sources.length; i++) {
      source = node._sources[i];
      if (!source._observers) source._observers = [node];
      else source._observers.push(node);
    }
  } else if (node._sources && currentObserversIndex < node._sources.length) {
    removeSourceObservers(node, currentObserversIndex);
    node._sources.length = currentObserversIndex;
  }
}

function notify(node: Computation, state: number) {
  if (node._state >= state) return;

  if (node._effect && node._state === STATE_CLEAN) {
    effects.push(node);
    if (!scheduledEffects) flushEffects();
  }

  node._state = state;
  if (node._observers) {
    for (let i = 0; i < node._observers.length; i++) {
      notify(node._observers[i], STATE_CHECK);
    }
  }
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
