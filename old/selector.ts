import { isNotEqual, read, write } from './compute';
import { dispose, onDispose } from './dispose';
import { createReadSignal, effect } from './api';
import type { Computation, ReadSignal } from './types';

export interface SelectorSignal<Key> {
  (key: Key): ReadSignal<Boolean>;
}

/**
 * Creates a signal that observes the given `source` and returns a new signal who only notifies
 * observers when entering or exiting a specified key.
 */
export function selector<Key>(source: ReadSignal<Key>): SelectorSignal<Key> {
  let currentKey: Key | undefined,
    nodes = new Map<Key, Selector<Key>>();

  effect(() => {
    const newKey = source(),
      prev = nodes.get(currentKey!),
      next = nodes.get(newKey);
    prev && prev.write(false);
    next && next.write(true);
    currentKey = newKey;
  }, true);

  return function observeSelector(key: Key) {
    let node = nodes.get(key);

    if (!node) nodes.set(key, (node = new Selector(key, key === currentKey, nodes)));

    node!._refs += 1;
    onDispose(node);

    return createReadSignal(node!);
  };
}

interface Selector<Key = any> extends Computation<boolean> {
  _key: Key;
  _value: boolean;
  _signals: Map<Key, Selector> | null;
  _refs: number;
}

function Selector<Key>(
  this: Selector<Key>,
  key: Key,
  initialValue: boolean,
  nodes: Map<Key, Selector>,
) {
  this._state = /** CLEAN */ 0;
  this._key = key;
  this._value = initialValue;
  this._refs = 0;
  this._signals = nodes;
  this._observers = null;
}

const SelectorProto = Selector.prototype;

SelectorProto.call = function (this: Selector) {
  this._refs -= 1;

  if (!this._refs) {
    this._signals!.delete(this._key);
    this._signals = null;
  }

  return this._value;
};

SelectorProto._changed = isNotEqual;
SelectorProto.read = read;
SelectorProto.write = write;
SelectorProto.dispose = dispose;
