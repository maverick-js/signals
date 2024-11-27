// Adapted from: https://github.com/solidjs/solid/blob/main/packages/solid/src/reactive/array.ts#L153

import { createReadSignal, scoped } from './api';
import { compute, createComputation } from './compute';
import { dispose } from './dispose';
import { createScope } from './scope';
import type { Computation, Maybe, ReadSignal, Scope } from './types';

export * from './selector';

/**
 * Reactive map helper that caches each item by index to reduce unnecessary mapping on updates.
 * It only runs the mapping function once per item and adds/removes as needed. In a non-keyed map
 * like this the index is fixed but value can change (opposite of a keyed map).
 *
 * Prefer `computedKeyedMap` when referential checks are required.
 *
 * @see {@link https://github.com/maverick-js/signals#computedmap}
 */
export function computedMap<Item, MappedItem>(
  list: ReadSignal<Maybe<readonly Item[]>>,
  map: (value: ReadSignal<Item>, index: number) => MappedItem,
  options?: { id?: string },
): ReadSignal<MappedItem[]> {
  return createReadSignal(
    createComputation<MappedItem[]>(
      [],
      updateMap.bind({
        _scope: createScope(),
        _len: 0,
        _list: list,
        _items: [],
        _map: map,
        _mappings: [],
        _nodes: [],
      }),
      options,
    ),
  );
}

function updateMap<Item, MappedItem>(this: MapData<Item, MappedItem>): any[] {
  let i = 0,
    newItems = this._list() || [],
    mapper = () => this._map(createReadSignal(this._nodes[i]), i);

  scoped(() => {
    if (newItems.length === 0) {
      if (this._len !== 0) {
        dispose.call(this._scope, false);
        this._items = [];
        this._mappings = [];
        this._len = 0;
        this._nodes = [];
      }

      return;
    }

    for (i = 0; i < newItems.length; i++) {
      if (i < this._items.length && this._items[i] !== newItems[i]) {
        this._nodes[i].write(newItems[i]);
      } else if (i >= this._items.length) {
        this._mappings[i] = compute<MappedItem>(
          (this._nodes[i] = createComputation(newItems[i], null)),
          mapper,
          null,
        );
      }
    }

    for (; i < this._items.length; i++) dispose.call(this._nodes[i]);

    this._len = this._nodes.length = newItems.length;
    this._items = newItems.slice(0);
    this._mappings = this._mappings.slice(0, this._len);
  }, this._scope);

  return this._mappings;
}

// Adapted from: https://github.com/solidjs/solid/blob/main/packages/solid/src/reactive/array.ts#L16
/**
 * Reactive map helper that caches each list item by reference to reduce unnecessary mapping on
 * updates. It only runs the mapping function once per item and then moves or removes it as needed. In
 * a keyed map like this the value is fixed but the index changes (opposite of non-keyed map).
 *
 * Prefer `computedMap` when working with primitives to avoid unncessary re-renders.
 *
 * @see {@link https://github.com/maverick-js/signals#computedkeyedmap}
 */
export function computedKeyedMap<Item, MappedItem>(
  list: ReadSignal<Maybe<readonly Item[]>>,
  map: (value: Item, index: ReadSignal<number>) => MappedItem,
  options?: { id?: string },
): ReadSignal<MappedItem[]> {
  return createReadSignal(
    createComputation<MappedItem[]>(
      [],
      updateKeyedMap.bind({
        _scope: createScope(),
        _len: 0,
        _list: list,
        _items: [],
        _map: map,
        _mappings: [],
        _nodes: [],
      }),
      options,
    ),
  );
}

function updateKeyedMap<Item, MappedItem>(this: KeyedMapData<Item, MappedItem>): any[] {
  const newItems = this._list() || [],
    indexed = this._map.length > 1;

  scoped(() => {
    let newLen = newItems.length,
      i: number,
      j: number,
      mapper = indexed
        ? () => this._map(newItems[j], createReadSignal(this._nodes[j]))
        : () => (this._map as (value: Item) => MappedItem)(newItems[j]);

    // fast path for empty arrays
    if (newLen === 0) {
      if (this._len !== 0) {
        dispose.call(this._scope, false);
        this._nodes = [];
        this._items = [];
        this._mappings = [];
        this._len = 0;
      }
    }
    // fast path for new create
    else if (this._len === 0) {
      this._mappings = new Array(newLen);

      for (j = 0; j < newLen; j++) {
        this._items[j] = newItems[j];
        this._mappings[j] = compute<MappedItem>(
          (this._nodes[j] = createComputation(j, null)),
          mapper,
          null,
        );
      }

      this._len = newLen;
    } else {
      let start: number,
        end: number,
        newEnd: number,
        item: Item,
        newIndices: Map<Item, number>,
        newIndicesNext: number[],
        temp: MappedItem[] = new Array(newLen),
        tempNodes: Computation[] = new Array(newLen);

      // skip common prefix
      for (
        start = 0, end = Math.min(this._len, newLen);
        start < end && this._items[start] === newItems[start];
        start++
      );

      // common suffix
      for (
        end = this._len - 1, newEnd = newLen - 1;
        end >= start && newEnd >= start && this._items[end] === newItems[newEnd];
        end--, newEnd--
      ) {
        temp[newEnd] = this._mappings[end];
        tempNodes[newEnd] = this._nodes[end];
      }

      // 0) prepare a map of all indices in newItems, scanning backwards so we encounter them in natural order
      newIndices = new Map<Item, number>();
      newIndicesNext = new Array(newEnd + 1);
      for (j = newEnd; j >= start; j--) {
        item = newItems[j];
        i = newIndices.get(item)!;
        newIndicesNext[j] = i === undefined ? -1 : i;
        newIndices.set(item, j);
      }

      // 1) step through all old items and see if they can be found in the new set; if so, save them in a temp array and mark them moved; if not, exit them
      for (i = start; i <= end; i++) {
        item = this._items[i];
        j = newIndices.get(item)!;
        if (j !== undefined && j !== -1) {
          temp[j] = this._mappings[i];
          tempNodes[j] = this._nodes[i];
          j = newIndicesNext[j];
          newIndices.set(item, j);
        } else dispose.call(this._nodes[i]);
      }

      // 2) set all the new values, pulling from the temp array if copied, otherwise entering the new value
      for (j = start; j < newLen; j++) {
        if (j in temp) {
          this._mappings[j] = temp[j];
          this._nodes[j] = tempNodes[j];
          this._nodes[j].write(j);
        } else {
          this._mappings[j] = compute<MappedItem>(
            (this._nodes[j] = createComputation(j, null)),
            mapper,
            null,
          );
        }
      }

      // 3) in case the new set is shorter than the old, set the length of the mapped array
      this._mappings = this._mappings.slice(0, (this._len = newLen));

      // 4) save a copy of the mapped items for the next update
      this._items = newItems.slice(0);
    }
  }, this._scope);

  return this._mappings;
}

interface MapData<Item = any, MappedItem = any> {
  _scope: Scope;
  _len: number;
  _list: ReadSignal<Maybe<readonly Item[]>>;
  _items: Item[];
  _mappings: MappedItem[];
  _nodes: Computation<any>[];
  _map: (value: ReadSignal<any>, index: number) => any;
}

interface KeyedMapData<Item = any, MappedItem = any> {
  _scope: Scope;
  _len: number;
  _list: ReadSignal<Maybe<readonly Item[]>>;
  _items: Item[];
  _mappings: MappedItem[];
  _nodes: Computation<number>[];
  _map: (value: any, index: ReadSignal<number>) => any;
}
