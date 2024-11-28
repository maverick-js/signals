import { FLAG_DEAD } from '../flags';
import { isObject } from '../utils';
import { isReactionNode } from './reaction';
import { isScopeNode, type Scope } from './scope';

export interface Node {
  /** @internal bitwise flags */
  f: number;
  /** @internal parent scope */
  _parent: Scope | null;
  /** @internal next sibling node */
  _next: Node | null;
  /** @internal previous sibling node */
  _prev: Node | null;

  destroy(): void;
}

export function killNode(node: Node) {
  node.f = FLAG_DEAD;
  node._parent = null;
  node._prev = null;
  node._next = null;
}

export function isNodeDead(node: Node) {
  return (node.f & FLAG_DEAD) > 0;
}

export function isNode(value: unknown): value is Node {
  return isObject(value) && 'f' in value;
}

/**
 * Walks through the children of a node and calls the callback for each child.
 */
export function walkChildren(root: Node, callback: (child: Node) => void) {
  let parents: Node[] = [root],
    parent: Node | null = root,
    current: Node | null = root._next,
    next: Node | null = null;

  main: do {
    parent = parents.pop()!;

    while (current && current._parent === parent) {
      if (current._next?._parent === current) {
        parents.push(parent, current);
        current = current._next;
        continue main;
      } else {
        next = current._next;
        callback(current);
        current = next;
      }
    }

    // Skip root.
    if (parents.length) callback(parent);
  } while (parents.length);

  return current;
}

/**
 * Disposes a node and its children. Set `self` to `false` to skip disposing the node itself.
 */
export function destroyNode(node: Node, self = true) {
  if (isNodeDead(node)) return;

  let head = self ? node._prev : node,
    tail = walkChildren(node, (child) => child.destroy());

  if (self) node.destroy();
  if (head) head._next = tail;
  if (tail) tail._prev = head;
}

export function getNodeScope(node: Node) {
  return isScopeNode(node) ? node : isReactionNode(node) ? node._scope : null;
}
