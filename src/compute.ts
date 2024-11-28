import { FLAG_CHECK, FLAG_CLEAN } from './flags';
import { currentScope, Scope, setScope } from './node/scope';
import { handleError } from './error';
import { destroyNode, isNodeDead } from './node/node';
import type { Dispose } from './dispose';
import {
  detachReaction,
  isReactionNode,
  type Reaction,
  isEffectNode,
  type Effect,
} from './node/reaction';
import type { ReadSignal } from './node/signal';
import { isUndefined } from './utils';

let hasScheduledEffects = false,
  isRunningEffects = false,
  effects: Effect[] = [],
  currentReaction: Reaction | null = null,
  currentSignals: ReadSignal[] | null = null,
  currentSignalsIndex = 0;

/**
 * Creates a computation root which is given a `dispose()` function to dispose of all inner
 * computations.
 *
 * @see {@link https://github.com/maverick-js/signals#root}
 */
export function root<T>(init: (dispose: Dispose) => T): T {
  const scope = new Scope();
  return compute(
    scope,
    !init.length ? (init as () => T) : init.bind(null, destroyNode.bind(null, scope)),
    null,
  ) as T;
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

export function read<T>(signal: ReadSignal<T>): T {
  if (isNodeDead(signal)) return signal._value;

  if (currentReaction) {
    if (
      !currentSignals &&
      currentReaction._signals &&
      currentReaction._signals[currentSignalsIndex] == signal
    ) {
      currentSignalsIndex++;
    } else if (!currentSignals) currentSignals = [signal];
    else currentSignals.push(signal);
  }

  updateIfNeeded(signal);

  return signal._value;
}

export function write<T>(signal: ReadSignal<T>, value: T): T {
  console.log(value);
  if (isNotEqual(signal._value, value)) {
    signal._value = value;
    if (signal._reactions) {
      for (let i = 0; i < signal._reactions.length; i++) {
        notifyReactions(signal._reactions[i], true);
      }
    }
  }

  return signal._value;
}

export function updateIfNeeded(node: ReadSignal) {
  if (!isReactionNode(node) || !isDirty(node)) return;
  updateReaction(node);
}

export function isDirty(node: Reaction) {
  if (!(node.f & FLAG_CLEAN)) {
    return true;
  } else if (node.f & FLAG_CHECK) {
    for (let i = 0; i < node._signals!.length; i++) {
      updateIfNeeded(node._signals![i]);
      if (!(node.f & FLAG_CLEAN)) {
        // Stop the loop here so we won't trigger updates on other parents unnecessarily
        // If our computation changes to no longer use some sources, we don't
        // want to update() a source we used last time, but now don't use.
        break;
      }
    }

    node.f &= ~FLAG_CHECK;
    return !(node.f & FLAG_CLEAN);
  } else {
    return false;
  }
}

export function updateReaction(reaction: Reaction) {
  let prevSignals = currentSignals,
    prevSignalsIndex = currentSignalsIndex;

  currentSignals = null as ReadSignal[] | null;
  currentSignalsIndex = 0;

  try {
    reaction.reset();

    const result = compute(reaction._scope, reaction._compute, reaction);

    updateSignals(reaction);

    if (!isEffectNode(reaction) && !isUndefined(reaction._value)) {
      write(reaction, result);
    } else {
      reaction._value = result;
    }
  } catch (error) {
    updateSignals(reaction);
    handleError(reaction._scope, error);
  } finally {
    currentSignals = prevSignals;
    currentSignalsIndex = prevSignalsIndex;
    reaction.f |= FLAG_CLEAN;
  }
}

function updateSignals(reaction: Reaction) {
  if (currentSignals) {
    if (reaction._signals) detachReaction(reaction, currentSignalsIndex);

    if (reaction._signals && currentSignalsIndex > 0) {
      reaction._signals.length = currentSignalsIndex + currentSignals.length;
      for (let i = 0; i < currentSignals.length; i++) {
        reaction._signals[currentSignalsIndex + i] = currentSignals[i];
      }
    } else {
      reaction._signals = currentSignals;
    }

    let source: ReadSignal;
    for (let i = currentSignalsIndex; i < reaction._signals.length; i++) {
      source = reaction._signals[i];
      if (!source._reactions) source._reactions = [reaction];
      else source._reactions.push(reaction);
    }
  } else if (reaction._signals && currentSignalsIndex < reaction._signals.length) {
    detachReaction(reaction, currentSignalsIndex);
    reaction._signals.length = currentSignalsIndex;
  }
}

export function queueEffect(effect: Effect) {
  effects.push(effect);
  if (!hasScheduledEffects) flushEffects();
}

function notifyReactions(node: ReadSignal, isDirty: boolean) {
  if ((!isDirty && node.f & FLAG_CHECK) || (isDirty && !(node.f & FLAG_CLEAN))) return;

  if (isEffectNode(node) && node.f & FLAG_CLEAN) {
    queueEffect(node);
  }

  if (isDirty) {
    node.f &= ~FLAG_CLEAN;
  } else {
    node.f |= FLAG_CHECK;
  }

  if (node._reactions) {
    for (let i = 0; i < node._reactions.length; i++) {
      notifyReactions(node._reactions[i], false);
    }
  }
}

export function isNotEqual(a: unknown, b: unknown) {
  return a !== b;
}

export function flushEffects() {
  hasScheduledEffects = true;
  queueMicrotask(runEffects);
}

function runEffects() {
  if (!effects.length) {
    hasScheduledEffects = false;
    return;
  }

  isRunningEffects = true;

  for (let i = 0; i < effects.length; i++) {
    if (!(effects[i].f & FLAG_CLEAN)) runTop(effects[i]);
  }

  effects = [];
  hasScheduledEffects = false;
  isRunningEffects = false;
}

function runTop(effect: Effect) {
  let ancestors: Effect[] = [effect],
    scope = effect._scope;

  while ((scope = scope._parent!)) {
    if (scope._reaction && isEffectNode(scope._reaction) && !(scope._reaction.f & FLAG_CLEAN)) {
      ancestors.push(scope._reaction);
    }
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
  if (!isRunningEffects) runEffects();
}

/** @deprecated use flushSync */
export const tick = flushSync;

export function compute<T>(scope: Scope | null, compute: () => T, reaction: Reaction | null): T {
  const prevScope = currentScope,
    prevReaction = currentReaction;

  setScope(scope);
  currentReaction = reaction;

  try {
    return compute.call(scope);
  } finally {
    setScope(prevScope);
    currentReaction = prevReaction;
  }
}
