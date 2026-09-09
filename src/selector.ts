import { onDispose, read, setValue } from './core.js';
import { SIGNAL } from './symbols.js';
import { effect } from './signals.js';
import { Computation, ReadSignal } from './types.js';

export interface SelectorSignal<T> {
  (key: T): ReadSignal<boolean>;
}

/**
 * Creates a signal that observes the given `source` and returns a new signal who only notifies
 * observers when entering or exiting a specified key.
 */
export function selector<T>(source: ReadSignal<T>): SelectorSignal<T> {
  let currentKey: T | undefined,
    nodes = new Map<T, Selector<T>>();

  effect(() => {
    const newKey = source.get(),
      prev = nodes.get(currentKey!),
      next = nodes.get(newKey);
    if (prev) setValue(prev, false);
    if (next) setValue(next, true);
    currentKey = newKey;
  });

  return function observeSelector(key: T) {
    let node = nodes.get(key);

    if (!node) nodes.set(key, (node = new Selector(key, key === currentKey, nodes)));

    node!._refs += 1;
    onDispose(node);

    return node!;
  };
}

interface Selector<T = any> extends Computation {
  _key: T;
  _value: boolean;
  _nodes: Map<T, Selector> | null;
  _refs: number;
  call(): void;
}

function Selector<T>(this: Selector<T>, key: T, initialValue: boolean, nodes: Map<T, Selector>) {
  this._state = /** CLEAN */ 0;
  this._key = key;
  this._value = initialValue;
  this._refs = 0;
  this._nodes = nodes;
  this._observers = null;
  this._mark = 0;
}

const SelectorProto = Selector.prototype;
SelectorProto[SIGNAL] = true;
SelectorProto._equals = null;
SelectorProto.get = read;
SelectorProto.peek = function (this: Selector) {
  return this._value;
};
SelectorProto.call = function (this: Selector) {
  this._refs -= 1;
  if (!this._refs) {
    this._nodes!.delete(this._key);
    this._nodes = null;
  }
};
