import { STATE_CHECK, STATE_CLEAN, STATE_DIRTY, STATE_DISPOSED } from './constants';
import { currentScope, ScopeNode, ScopeProto, setCurrentScope } from './scope';
import type { Callable, Computation, ComputedSignalOptions, Scope } from './types';
import { dispose, emptyDisposal, removeSourceObservers } from './dispose';
import { handleError } from './error';

let scheduledEffects = false,
  runningEffects = false,
  effects: Computation[] = [],
  currentObserver: Computation | null = null,
  currentObservers: Computation[] | null = null,
  currentObserversIndex = 0;

export function createComputation<T>(
  initialValue: T,
  compute: (() => T) | null,
  options?: ComputedSignalOptions<T>,
): Computation<T> {
  return new ComputeNode(initialValue, compute, options);
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
  this._effect = 0;
  this._sources = null;
  this._observers = null;
  this._value = initialValue;

  if (__DEV__) this.id = options?.id ?? (this._compute ? 'computed' : 'signal');
  if (compute) this._compute = compute;
  if (options && options.dirty) this._changed = options.dirty;
};

const ComputeProto: Computation = ComputeNode.prototype;
Object.setPrototypeOf(ComputeProto, ScopeProto);

Object.defineProperty(ComputeProto, 'value', {
  get(this: Computation) {
    return this.read();
  },
  set(this: Computation, newValue: any) {
    this.write(newValue);
  },
});

ComputeProto._changed = isNotEqual;
ComputeProto.call = read;
ComputeProto.read = read;
ComputeProto.write = write;
ComputeProto.dispose = dispose;

export function read<T>(this: Computation<T>): T {
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

  if (this._compute) updateIfNeeded(this);

  return this._value;
}

export function write<T>(this: Computation<T>, newValue: T): T {
  const value = isFunction(newValue) ? newValue(this._value) : newValue;

  if (this._changed(this._value, value)) {
    this._value = value;
    if (this._observers) {
      for (let i = 0; i < this._observers.length; i++) {
        notifyObservers(this._observers[i], STATE_DIRTY);
      }
    }
  }

  return this._value;
}

export function isFunction(value: unknown): value is Function {
  return typeof value === 'function';
}

export function updateIfNeeded(node: Computation) {
  if (isDirty(node)) {
    update(node);
  } else {
    node._state = STATE_CLEAN;
  }
}

export function isDirty(node: Computation) {
  if (node._state === STATE_CHECK) {
    for (let i = 0; i < node._sources!.length; i++) {
      updateIfNeeded(node._sources![i]);
      if ((node._state as number) === STATE_DIRTY) {
        // Stop the loop here so we won't trigger updates on other parents unnecessarily
        // If our computation changes to no longer use some sources, we don't
        // want to update() a source we used last time, but now don't use.
        break;
      }
    }
  }

  return node._state === STATE_DIRTY;
}

export function reset(node: Computation) {
  if (node._next?._parent === node) dispose.call(node, false);
  if (node._disposal) emptyDisposal(node);
  node._handlers = node._parent ? node._parent._handlers : null;
}

export function update(node: Computation) {
  let prevObservers = currentObservers,
    prevObserversIndex = currentObserversIndex;

  currentObservers = null as Computation[] | null;
  currentObserversIndex = 0;

  try {
    reset(node);

    const result = compute(node, node._compute!, node);

    updateObservers(node);

    if (!node._effect && node._init) {
      node.write(result);
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

function notifyObservers(node: Computation, state: number) {
  if (node._state >= state) return;

  if (node._effect && node._state === STATE_CLEAN) {
    effects.push(node);
    if (!scheduledEffects) flushEffects();
  }

  node._state = state;
  if (node._observers) {
    for (let i = 0; i < node._observers.length; i++) {
      notifyObservers(node._observers[i], STATE_CHECK);
    }
  }
}

export function isNotEqual(a: unknown, b: unknown) {
  return a !== b;
}

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

  while ((node = node._parent as Computation<any>)) {
    if (node._effect && node._state !== STATE_CLEAN) ancestors.push(node);
  }

  for (let i = ancestors.length - 1; i >= 0; i--) {
    updateIfNeeded(ancestors[i]);
  }
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

export function compute<Result>(
  scope: Scope | null,
  compute: Callable<Scope | null, Result>,
  observer: Computation | null,
): Result {
  const prevScope = currentScope,
    prevObserver = currentObserver;

  setCurrentScope(scope);
  currentObserver = observer;

  try {
    return compute.call(scope);
  } finally {
    setCurrentScope(prevScope);
    currentObserver = prevObserver;
  }
}
