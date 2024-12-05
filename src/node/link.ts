/** Adapted from: https://github.com/preactjs/signals :) */

import { isReactionNode, type Reaction } from './reaction';
import type { ReadSignal } from './signal';

// Reduce pressure on GC and recycle links.
let pool: Link | null = null;

export interface Link {
  /** @internal */
  _version: number;
  /** @internal */
  _signal: ReadSignal;
  /** @internal */
  _reaction: Reaction;
  /** @internal */
  _nextSignal: Link | null;
  /** @internal */
  _prevSignal: Link | null;
  /** @internal */
  _nextReaction: Link | null;
  /** @internal */
  _prevReaction: Link | null;
}

export function link(reaction: Reaction, signal: ReadSignal): Link {
  let currentSignal = reaction._signalsTail,
    nextSignal = currentSignal ? currentSignal._nextSignal : reaction._signals;
  if (nextSignal && nextSignal._signal === signal) {
    return (reaction._signalsTail = nextSignal);
  } else {
    return createLink(reaction, signal, nextSignal);
  }
}

function createLink(reaction: Reaction, signal: ReadSignal, nextSignal: Link | null): Link {
  let link: Link;

  if (pool) {
    link = pool;
    pool = link._nextSignal;
    link._version = 0;
    link._signal = signal;
    link._reaction = reaction;
    link._nextSignal = nextSignal;
  } else {
    link = {
      _version: 0,
      _signal: signal,
      _reaction: reaction,
      _nextSignal: null,
      _prevSignal: null,
      _prevReaction: null,
      _nextReaction: null,
    };
  }

  if (!reaction._signalsTail) {
    reaction._signals = link;
  } else {
    reaction._signalsTail._nextSignal = link;
  }

  if (!signal._reactions) {
    signal._reactions = link;
  } else {
    let prev = signal._reactionsTail!;
    link._prevReaction = prev;
    prev._nextReaction = link;
  }

  reaction._signalsTail = link;
  signal._reactionsTail = link;

  return link;
}

export function removeLink(link: Link): void {
  do {
    let signal = link._signal,
      nextSignal = link._nextSignal,
      nextReaction = link._nextReaction,
      prevReaction = link._prevReaction;

    if (nextReaction) {
      nextReaction._prevReaction = prevReaction;
      link._nextReaction = null;
    } else {
      signal._reactionsTail = prevReaction;
    }

    if (prevReaction) {
      prevReaction._nextReaction = nextReaction;
      link._prevReaction = null;
    } else {
      signal._reactions = nextReaction;
    }

    // @ts-expect-error
    link._signal = null;
    // @ts-expect-error
    link._reaction = null;
    link._nextSignal = pool;

    pool = link;

    if (signal._reactions && isReactionNode(signal)) {
      if (signal._signals) {
        link = signal._signals;
        signal._signalsTail!._nextSignal = nextSignal;
        signal._signals = null;
        signal._signalsTail = null;
        continue;
      }
    }

    link = nextSignal!;
  } while (link);
}
