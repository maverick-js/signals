export interface Node {
  /** @internal current state */
  _state: number;
  destroy(): void;
}

export function isNode(value: unknown): value is Node {
  if (__DEV__) {
    return value != null && '_state' in (value as object);
  } else {
    return value != null && 'ø' in (value as object);
  }
}
