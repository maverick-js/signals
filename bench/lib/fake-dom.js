/**
 * A tiny dependency-free DOM emulation used by `bench/dom.js`.
 *
 * Every mutating operation increments `dom.mutations`, which
 * - prevents the "rendering" work from being optimised away, and
 * - lets the benchmark verify that two library builds perform IDENTICAL DOM work.
 *
 * The node operations are deliberately cheap so that the benchmark measures the reactive library
 * rather than the DOM emulation.
 */

export const dom = { mutations: 0 };

export class FakeNode {
  /** @param {string} tag */
  constructor(tag) {
    this.tag = tag;
    /** @type {Map<string, string>} */
    this.attrs = new Map();
    /** @type {FakeNode[]} */
    this.children = [];
    /** @type {FakeNode | null} */
    this.parent = null;
    this._text = '';
  }

  get textContent() {
    return this._text;
  }

  set textContent(value) {
    this._text = String(value);
    dom.mutations++;
  }

  /** @param {string} name @param {unknown} value */
  setAttribute(name, value) {
    this.attrs.set(name, String(value));
    dom.mutations++;
  }

  /** @param {string} name */
  removeAttribute(name) {
    this.attrs.delete(name);
    dom.mutations++;
  }

  /** @param {FakeNode} child */
  appendChild(child) {
    if (child.parent) child.parent._detach(child);
    child.parent = this;
    this.children.push(child);
    dom.mutations++;
    return child;
  }

  /** @param {FakeNode} child @param {FakeNode | null} ref */
  insertBefore(child, ref) {
    if (!ref) return this.appendChild(child);
    if (child.parent) child.parent._detach(child);
    const index = this.children.indexOf(ref);
    if (index === -1) throw new Error('insertBefore: reference node is not a child');
    child.parent = this;
    this.children.splice(index, 0, child);
    dom.mutations++;
    return child;
  }

  /** @param {FakeNode} child */
  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index === -1) throw new Error('removeChild: node is not a child');
    this.children.splice(index, 1);
    child.parent = null;
    dom.mutations++;
    return child;
  }

  /** @param {FakeNode[]} nodes */
  replaceChildren(...nodes) {
    for (const child of this.children) child.parent = null;
    for (const node of nodes) {
      if (node.parent && node.parent !== this) node.parent._detach(node);
      node.parent = this;
    }
    this.children = nodes;
    dom.mutations++;
  }

  /** Removes `child` without counting a mutation (internal re-parenting helper). */
  _detach(child) {
    const index = this.children.indexOf(child);
    if (index !== -1) this.children.splice(index, 1);
    child.parent = null;
  }
}

/**
 * Minimal keyed reconciliation of `parent.children` towards `next` using only remove / insert
 * operations - roughly what a fine-grained renderer does for a mapped list.
 *
 * @param {FakeNode} parent
 * @param {FakeNode[]} next
 */
export function syncChildren(parent, next) {
  const prev = parent.children;

  if (prev.length === next.length) {
    let same = true;
    for (let i = 0; i < prev.length; i++) {
      if (prev[i] !== next[i]) {
        same = false;
        break;
      }
    }
    if (same) return;
  }

  if (next.length === 0) {
    parent.replaceChildren();
    return;
  }

  const keep = new Set(next);
  for (let i = prev.length - 1; i >= 0; i--) {
    if (!keep.has(prev[i])) parent.removeChild(prev[i]);
  }

  for (let i = 0; i < next.length; i++) {
    const node = next[i];
    if (parent.children[i] !== node) parent.insertBefore(node, parent.children[i] ?? null);
  }
}
