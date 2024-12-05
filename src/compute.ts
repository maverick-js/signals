import { currentScope, Scope, setScope } from './node/scope';
import { handleError } from './error';
import {
  type Reaction,
  type Effect,
  isReaction,
  isEffectNode,
  EFFECT_SYMBOL,
} from './node/reaction';
import type { ReadSignal } from './node/signal';
import { isUndefined } from './utils';
import { link, removeLink, type Link } from './node/link';
import { STATE_CHECK, STATE_CLEAN, STATE_DEAD, STATE_DIRTY } from './constants';

let hasScheduledEffects = false,
  isRunningEffects = false,
  effects: Effect[] = [];

export let currentReaction: Reaction | null = null;

/**
 * Creates a computation root which is given a `dispose()` function to dispose of all inner
 * computations.
 *
 * @see {@link https://github.com/maverick-js/signals#root}
 */
export function root<T>(init: (scope: Scope) => T): T {
  const scope = new Scope();
  return compute(scope, init.bind(null, scope), null) as T;
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
  if (signal._state === STATE_DEAD) return signal._value;

  if (currentReaction) {
    const node = link(currentReaction, signal);
    node._version = signal._version;
  }

  if (isReaction(signal)) update(signal);

  return signal._value;
}

export function write<T>(signal: ReadSignal<T>, value: T): T {
  if (isNotEqual(signal._value, value)) {
    signal._value = value;
    signal._version++;
    notify(signal._reactions);
  }

  return signal._value;
}

export function computeReaction(reaction: Reaction) {
  try {
    reaction.reset();
    reaction._signalsTail = null;

    const result = compute(reaction._scope, reaction._compute, reaction),
      tail = reaction._signalsTail as Link | null;

    // Remove any signals that are no longer being used.
    if (tail) {
      if (tail._nextSignal) {
        removeLink(tail._nextSignal);
        tail._nextSignal = null;
      }
    } else if (reaction._signals) {
      removeLink(reaction._signals);
      reaction._signals = null;
    }

    if (result !== EFFECT_SYMBOL && !isUndefined(reaction._value)) {
      write(reaction, result);
    } else {
      reaction._value = result;
    }
  } catch (error) {
    handleError(reaction._scope, error);
  } finally {
    reaction._state = STATE_CLEAN;
  }
}

export function queueEffect(effect: Effect) {
  effects.push(effect);
  if (!hasScheduledEffects) flushEffects();
}

export function update(reaction: Reaction) {
  if (reaction._signals && reaction._state === STATE_CHECK) {
    let currentLink: Link | null = reaction._signals,
      signal: ReadSignal,
      links: Array<Link | null> = [];

    while (currentLink) {
      signal = currentLink._signal;

      if (isReaction(signal)) {
        if (reaction._signals && reaction._state === STATE_CHECK) {
          links.push(currentLink);
          currentLink = reaction._signals;
          continue;
        }

        if (currentLink._version !== signal._version) {
          computeReaction(signal);
        } else {
          signal._state = STATE_CLEAN;
        }
      }

      currentLink = currentLink._nextSignal;
      if (!currentLink) currentLink = links.pop()!;
    }
  }

  if (reaction._state === STATE_DIRTY) {
    computeReaction(reaction);
  }
}

export function notify(link: Link | null): void {
  if (!link) return;

  let currentLink: Link | null = link,
    reaction: Reaction,
    state = STATE_DIRTY,
    links: Array<Link | null> = [];

  while (currentLink) {
    reaction = currentLink._reaction;

    if (reaction._state < state) {
      if (isEffectNode(reaction) && reaction._state === STATE_CLEAN) {
        queueEffect(reaction);
      }

      reaction._state = state;

      if (reaction._reactions) {
        links.push(currentLink._nextReaction);
        state = STATE_CHECK;
        currentLink = reaction._reactions;
        continue;
      }
    }

    currentLink = currentLink._nextReaction;

    if (!currentLink) {
      currentLink = links.pop()!;
      if (links.length === 0) state = STATE_DIRTY;
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
    if (effects[i]._state !== STATE_CLEAN) {
      runEffect(effects[i]);
    }
  }

  effects = [];
  hasScheduledEffects = false;
  isRunningEffects = false;
}

function runEffect(effect: Effect) {
  let ancestors: Effect[] = [effect],
    scope = effect._scope,
    reaction: Reaction | null = null;

  while ((scope = scope._parent!)) {
    reaction = scope._reaction;
    if (reaction && isEffectNode(reaction) && reaction._state !== STATE_CLEAN) {
      ancestors.push(reaction);
    }
  }

  for (let i = ancestors.length - 1; i >= 0; i--) {
    update(ancestors[i]);
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
    return compute();
  } finally {
    setScope(prevScope);
    currentReaction = prevReaction;
  }
}
