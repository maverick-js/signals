import { Scope } from './node/scope';
import { handleError } from './error';
import type { ReadSignal } from './node/signal';
import { link, type Link } from './node/link';
import { STATE_CHECK, STATE_CLEAN, STATE_DEAD, STATE_DIRTY, STATE_INERT } from './constants';
import { isEffectNode, type Effect } from './node/effect';
import { isReactionNode, type Reaction } from './node/reaction';
import { isComputedNode } from './node/computed';

let hasScheduledEffects = false,
  isRunningEffects = false,
  effects: Effect[] = [];

export let currentScope: Scope | null = null;
export let currentReaction: Reaction | null = null;

/**
 * Creates a new scope and runs the given function inside it returning the result.
 *
 * @see {@link https://github.com/maverick-js/signals#root}
 */
export function root<T>(run: (scope: Scope) => T): T {
  const scope = new Scope();
  return compute(scope, null, run.bind(null, scope)) as T;
}

/**
 * Returns the current value stored inside the given compute function without triggering any
 * dependencies. Use `untrack` if you want to also disable scope tracking.
 *
 * @see {@link https://github.com/maverick-js/signals#peek}
 */
export function peek<T>(fn: () => T): T {
  return compute<T>(currentScope, null, fn);
}

/**
 * Returns the current value inside a signal whilst disabling both scope _and_ observer
 * tracking. Use `peek` if only observer tracking should be disabled.
 *
 * @see {@link https://github.com/maverick-js/signals#untrack}
 */
export function untrack<T>(fn: () => T): T {
  return compute<T>(null, null, fn);
}

/**
 * Runs the given function in the given scope so context and error handling continue to work.
 *
 * @see {@link https://github.com/maverick-js/signals#scoped}
 */
export function scoped<T>(run: () => T, scope: Scope | null): T | undefined {
  try {
    return compute<T>(scope, null, run);
  } catch (error) {
    handleError(scope, error);
    return; // TS -_-
  }
}

export function read<T>(signal: ReadSignal<T>): T {
  if (signal._state === STATE_DEAD) return signal._value;

  if (isReactionNode(signal)) {
    signal.update();
  }

  if (currentReaction) {
    link(currentReaction, signal)._version = signal._version;
  }

  return signal._value;
}

export function write<T>(signal: ReadSignal<T>, value: T): T {
  if (isNotEqual(signal._value, value)) {
    signal._value = value;
    signal._version++;
    notifyReactions(signal);
  }

  return signal._value;
}

export function queueEffect(effect: Effect) {
  effects.push(effect);
  if (!hasScheduledEffects) flushEffects();
}

export function shouldUpdate(reaction: Reaction): boolean {
  if (reaction._state === STATE_CHECK) {
    if (!reaction._signals) return false;

    let current: Link | null = reaction._signals,
      head: Link | null = null,
      prevHead: Link | null = null,
      signal: ReadSignal = current._signal,
      isDirty = false;

    main: while (current) {
      signal = current._signal;

      if (isComputedNode(signal)) {
        if (current._version !== signal._version) {
          isDirty = true;
        } else if (signal._state === STATE_DIRTY) {
          isDirty = signal.update();
        } else if (signal._state === STATE_CHECK && signal._signals) {
          signal._signals._prevReaction = head;
          signal._signals._prevSignal = current;
          current = head = signal._signals;
          continue;
        }
      }

      if (isDirty || !current._nextSignal) {
        while (head && head._prevSignal) {
          current = head._prevSignal;
          head._prevSignal = null;
          signal = current._signal;

          // Recompute parent reaction if any child was found to be dirty.
          if (isDirty) {
            isDirty = (signal as Reaction).update();
          } else {
            signal._state = STATE_CLEAN;
          }

          current = current._nextSignal;

          if (isDirty || !current) {
            prevHead = head._prevReaction;
            head._prevReaction = null;
            head = prevHead;
            continue;
          }

          continue main;
        }

        // Exit the loop to avoid triggering updates on other reactions unnecessarily.
        return isDirty;
      }

      current = current?._nextSignal as Link;
    }
  }

  return reaction._state === STATE_DIRTY;
}

export function notifyReactions(signal: ReadSignal): void {
  if (!signal._reactions) return;

  let current: Link | null = signal._reactions,
    prevHead: Link | null = null,
    head: Link | null = null,
    state = STATE_DIRTY,
    reaction = current._reaction;

  while (true) {
    if (!current) {
      if (!head) break;

      current = head._prevReaction;
      head._prevReaction = null;

      prevHead = head._prevSignal;
      head._prevSignal = null;
      head = prevHead;

      state = !head ? STATE_DIRTY : STATE_CHECK;

      continue;
    }

    reaction = current._reaction;

    // Skip if already dirty, inert, or dead.
    if (reaction._state >= state) {
      current = current._nextReaction;
      continue;
    }

    if (isEffectNode(reaction) && reaction._state === STATE_CLEAN) {
      queueEffect(reaction);
    }

    reaction._state = state;

    if (reaction._reactions) {
      reaction._reactions._prevSignal = head;
      reaction._reactions._prevReaction = current._nextReaction;
      current = head = reaction._reactions;
      state = STATE_CHECK;
    } else {
      current = current._nextReaction;
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
  if (effect._state >= STATE_INERT) return;

  let effects: Effect[] = [effect],
    scope = effect._scope;

  while ((scope = scope!._parent!)) {
    if (scope._effect && scope._effect._state !== STATE_CLEAN) {
      effects.push(scope._effect);
    }
  }

  for (let i = effects.length - 1; i >= 0; i--) {
    effects[i].update();
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

export function compute<T>(scope: Scope | null, reaction: Reaction | null, run: () => T): T {
  const prevScope = currentScope,
    prevReaction = currentReaction;

  currentScope = scope;
  currentReaction = reaction;

  try {
    return run();
  } finally {
    currentScope = prevScope;
    currentReaction = prevReaction;
  }
}
