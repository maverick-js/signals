import { isObject } from '../utils';

export interface Node {
  /** @internal current state */
  _state: number;
  destroy(): void;
}

export function isNode(value: unknown): value is Node {
  if (__DEV__) {
    return isObject(value) && '_state' in (value as object);
  } else {
    return isObject(value) && 'ø' in (value as object);
  }
}
