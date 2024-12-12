import { currentScope, read, write } from '../compute';
import { STATE_CLEAN, STATE_DEAD } from '../constants';
import { removeLink, type Link } from './link';
import { isNode, type Node } from './node';
import { Computed } from './computed';

export interface ReadSignal<T = unknown> extends Node {
  /** @internal */
  _version: number;
  /** @internal */
  _value: T;
  /** @internal */
  _reactions: Link | null;
  /** @internal */
  _reactionsTail: Link | null;
  /** @internal */
  _lastComputedId: number;
  readonly value: T;
  get(): T;
}

export class Signal<T = unknown> implements ReadSignal<T> {
  /** @internal */
  _state = STATE_CLEAN;
  /** @internal */
  _value: T;
  /** @internal */
  _version = 0;
  /** @internal */
  _lastComputedId = 0;
  /** @internal */
  _reactions: Link | null = null;
  /** @internal */
  _reactionsTail: Link | null = null;

  get value() {
    return this._value;
  }

  constructor(value: T) {
    this._value = value;
    currentScope?.append(this);
  }

  get(): T {
    return read(this);
  }

  set(value: T) {
    write(this, value);
  }

  next(next: NextValue<T>) {
    this.set(next(this._value));
  }

  destroy() {
    if (this._state === STATE_DEAD) return;
    this._state = STATE_DEAD;
    if (this._reactions) removeLink(this._reactions);
  }
}

export interface NextValue<T> {
  (prevValue: T): T;
}

export type InferSignalValue<T> = T extends Signal<infer R> ? R : never;

/**
 * Creates a new signal with the given initial value. The value can now be observed when used
 * inside other computations created with `computed` and `effect` by calling `signal.value`.
 *
 * @see {@link https://github.com/maverick-js/signals#signal}
 */
export function signal<T>(initialValue: T): Signal<T> {
  return new Signal(initialValue);
}

/**
 * Takes in the given signal and makes it read only.
 *
 * @see {@link https://github.com/maverick-js/signals#readonly}
 */
export function readonly<T>(signal: Signal<T>): ReadSignal<T> {
  return new Computed(signal._value, signal.get.bind(signal));
}

/**
 * Whether the given value is a readonly signal.
 *
 * @see {@link https://github.com/maverick-js/signals#isreadsignal}
 */
export function isReadSignal(value: unknown): value is ReadSignal {
  return isNode(value);
}

/**
 * Whether the given value is a write signal.
 *
 * @see {@link https://github.com/maverick-js/signals#iswritesignal}
 */
export function isWriteSignal<T>(value: unknown): value is Signal<T> {
  return isNode(value) && 'set' in value;
}
