import { STATE_CLEAN, STATE_DIRTY } from '../constants';
import { isEffectNode } from './effect';
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

let nextLink: Link | null = null;
export function link(reaction: Reaction, signal: ReadSignal): Link {
  nextLink = reaction._signalsTail?._nextSignal || reaction._signals;
  if (nextLink?._signal === signal) {
    return (reaction._signalsTail = nextLink);
  } else {
    return createLink(reaction, signal, nextLink);
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
      _nextSignal: nextSignal,
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
  let signal = link._signal,
    nextSignal: Link | null = null,
    nextReaction: Link | null = null,
    prevReaction: Link | null = null;

  do {
    signal = link._signal;
    nextSignal = link._nextSignal;
    nextReaction = link._nextReaction;
    prevReaction = link._prevReaction;

    if (nextReaction) {
      nextReaction._prevReaction = prevReaction;
      link._nextReaction = null;
    } else {
      signal._reactionsTail = prevReaction;
      signal._lastComputedId = 0;
    }

    if (prevReaction) {
      prevReaction._nextReaction = nextReaction;
      link._prevReaction = null;
    } else {
      signal._reactions = nextReaction;
    }

    // Nullify fields and put link back into pool.
    // @ts-expect-error
    link._signal = null;
    // @ts-expect-error
    link._reaction = null;
    link._nextSignal = pool;
    pool = link;

    // Check whether reaction node is now isolated.
    if (!signal._reactions && isReactionNode(signal) && signal._signals) {
      if (isEffectNode(signal)) {
        signal._state = STATE_CLEAN;
      } else {
        signal._state = STATE_DIRTY;
      }

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

export function removeDeadLinks(reaction: Reaction) {
  let tail = reaction._signalsTail as Link | null;
  if (tail) {
    if (tail._nextSignal) {
      removeLink(tail._nextSignal);
      tail._nextSignal = null;
    }
  } else if (reaction._signals) {
    removeLink(reaction._signals);
    reaction._signals = null;
  }
}
