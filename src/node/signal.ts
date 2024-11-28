import { read, write } from '../compute';
import { STATE_CLEAN, STATE_DEAD, TYPE_READ_SIGNAL, TYPE_SIGNAL } from '../constants';
import { removeLink, type Link } from './link';
import { isNode, type Node } from './node';
import { Reaction } from './reaction';
import { appendScopeChild, currentScope } from './scope';

export interface ReadSignal<T = unknown> extends Node {
  /** @internal */
  _version: number;
  /** @internal */
  _value: T;
  /** @internal */
  _reactions: Link | null;
  /** @internal */
  _reactionsTail: Link | null;
  readonly value: T;
  get(): T;
  destroy(): void;
}

export class Signal<T = unknown> implements ReadSignal<T> {
  /** @internal */
  readonly _type = TYPE_SIGNAL;
  /** @internal */
  _state = STATE_CLEAN;
  /** @internal */
  _value: T;
  /** @internal */
  _version = 0;
  /** @internal */
  _parent = currentScope;
  /** @internal */
  _next: Node | null = null;
  /** @internal */
  _prev: Node | null = currentScope;
  /** @internal */
  _reactions: Link | null = null;
  /** @internal */
  _reactionsTail: Link | null = null;

  get value() {
    return this._value;
  }

  constructor(value: T) {
    this._value = value;
    if (currentScope) appendScopeChild(currentScope, this);
  }

  get(): T {
    return read(this);
  }

  set(value: T) {
    if ((this._type as number) >= TYPE_READ_SIGNAL) {
      throw Error(__DEV__ ? 'Cannot set the value of a readonly signal' : 'readonly');
    }

    write(this, value);
  }

  next(next: NextValue<T>) {
    this.set(next(this._value));
  }

  destroy() {
    if (this._state === STATE_DEAD) return;
    this._state = STATE_DEAD;
    this._parent = null;
    this._next = null;
    this._prev = null;
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
  return new Reaction(signal._value, signal.get.bind(signal));
}

/**
 * Whether the given value is a readonly signal.
 *
 * @see {@link https://github.com/maverick-js/signals#isreadsignal}
 */
export function isReadSignal(value: unknown): value is ReadSignal {
  return isNode(value) && value._type >= TYPE_READ_SIGNAL;
}

/**
 * Whether the given value is a write signal.
 *
 * @see {@link https://github.com/maverick-js/signals#iswritesignal}
 */
export function isWriteSignal<T>(value: unknown): value is Signal<T> {
  return isNode(value) && value._type === TYPE_SIGNAL;
}
