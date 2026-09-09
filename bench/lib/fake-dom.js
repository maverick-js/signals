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
 * operations - roughly what a fine-grained renderer does for a mapped list: drop the nodes that are
 * gone, skip the common prefix and suffix, move a node that jumped from one end of the changed
 * range to the other directly, and insert / move whatever is still out of place at its position.
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

  // 1) remove nodes that are no longer wanted (`prev` is the live children array, so from here on
  //    every remaining node is somewhere in `next`)
  const keep = new Set(next);
  for (let i = prev.length - 1; i >= 0; i--) {
    if (!keep.has(prev[i])) parent.removeChild(prev[i]);
  }

  // 2) skip the common prefix and suffix
  let start = 0;
  let prevEnd = prev.length;
  let nextEnd = next.length;
  while (start < prevEnd && start < nextEnd && prev[start] === next[start]) start++;
  while (prevEnd > start && nextEnd > start && prev[prevEnd - 1] === next[nextEnd - 1]) {
    prevEnd--;
    nextEnd--;
  }
  if (start === nextEnd && start === prevEnd) return;

  // 3) a node moved from one end of the remaining range to the other (a swap is both at once):
  //    move it directly instead of shifting every node in between (`first` sits at `start + 1`
  //    once `last` has been moved in front of it)
  if (prevEnd - start >= 2) {
    const first = prev[start];
    const last = prev[prevEnd - 1];
    if (last === next[start]) parent.insertBefore(last, first);
    if (first === next[nextEnd - 1]) parent.insertBefore(first, prev[prevEnd] ?? null);
  }

  // 4) insert / move whatever is still out of place at its position
  for (let i = start; i < next.length; i++) {
    const node = next[i];
    if (prev[i] !== node) parent.insertBefore(node, prev[i] ?? null);
  }
}
