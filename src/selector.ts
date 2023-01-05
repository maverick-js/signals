import { createComputation, isNotEqual, onDispose, read, write } from './core';
import { effect } from './signals';
import { STATE } from './symbols';
import { Computation, ReadSignal, SelectorSignal } from './types';

/**
 * Creates a signal that observes the given `source` and returns a new signal who only notifies
 * observers when entering or exiting a specified key.
 */
export function selector<T>(source: ReadSignal<T>): SelectorSignal<T> {
  let currentKey: T | undefined,
    nodes = new Map<T, Selector<T>>();

  effect(() => {
    const newKey = source(),
      prev = nodes.get(currentKey!),
      next = nodes.get(newKey);
    prev && write.call(prev, false);
    next && write.call(next, true);
    currentKey = newKey;
  });

  return function observeSelector(key: T) {
    let node = nodes.get(key);

    if (!node) nodes.set(key, (node = new Selector(key, key === currentKey, nodes)));

    node!._refs += 1;
    onDispose(node);

    return read.bind(node!);
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
  this[STATE] = /** CLEAN */ 0;
  this._key = key;
  this._value = initialValue;
  this._refs = 0;
  this._nodes = nodes;
  this._observers = null;
}

const SelectorProto = Selector.prototype;
SelectorProto._changed = isNotEqual;
SelectorProto.call = function (this: Selector) {
  this._refs -= 1;
  if (!this._refs) {
    this._nodes!.delete(this._key);
    this._nodes = null;
  }
};
