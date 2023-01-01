// Adapted from: https://github.com/solidjs/solid/blob/main/packages/solid/src/reactive/array.ts#L153

import { computed, signal, onDispose, untrack, RootScope, compute } from './signals';
import type { Dispose, Maybe, ReadSignal, Scope } from './types';

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
  let items: Item[] = [],
    mapped: MappedItem[] = [],
    disposal: Dispose[] = [],
    signals: ((v: any) => void)[] = [],
    i: number,
    len = 0;

  onDispose(() => emptyDisposal(disposal));

  return computed(
    () => {
      const newItems = list() || [];
      return untrack(() => {
        if (newItems.length === 0) {
          if (len !== 0) {
            emptyDisposal(disposal);
            disposal = [];
            items = [];
            mapped = [];
            len = 0;
            signals = [];
          }

          return mapped;
        }

        for (i = 0; i < newItems.length; i++) {
          if (i < items.length && items[i] !== newItems[i]) {
            signals[i](newItems[i]);
          } else if (i >= items.length) {
            mapped[i] = compute<MappedItem>(new RootScope(), mapper, null);
          }
        }

        for (; i < items.length; i++) disposal[i].call(disposal[i]);

        len = signals.length = disposal.length = newItems.length;
        items = newItems.slice(0);
        return (mapped = mapped.slice(0, len));
      });

      function mapper(this: Scope) {
        disposal[i] = this;
        const $o = signal(newItems[i]);
        signals[i] = $o.set;
        return map($o, i);
      }
    },
    { id: __DEV__ ? options?.id : undefined, initial: [] },
  );
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
  let items: Item[] = [],
    mapping: MappedItem[] = [],
    disposal: Dispose[] = [],
    len = 0,
    indicies: ((v: number) => number)[] | null = map.length > 1 ? [] : null;

  onDispose(() => emptyDisposal(disposal));

  return computed(
    () => {
      let newItems = list() || [],
        i: number,
        j: number;

      return untrack(() => {
        let newLen = newItems.length;

        // fast path for empty arrays
        if (newLen === 0) {
          if (len !== 0) {
            emptyDisposal(disposal);
            disposal = [];
            items = [];
            mapping = [];
            len = 0;
            indicies && (indicies = []);
          }
        }
        // fast path for new create
        else if (len === 0) {
          mapping = new Array(newLen);

          for (j = 0; j < newLen; j++) {
            items[j] = newItems[j];
            mapping[j] = compute<MappedItem>(new RootScope(), mapper, null);
          }

          len = newLen;
        } else {
          let start: number,
            end: number,
            newEnd: number,
            item: Item,
            newIndices: Map<Item, number>,
            newIndicesNext: number[],
            temp: MappedItem[] = new Array(newLen),
            tempDisposal: Dispose[] = new Array(newLen),
            tempIndicies: ((v: number) => number)[] = new Array(newLen);

          // skip common prefix
          for (
            start = 0, end = Math.min(len, newLen);
            start < end && items[start] === newItems[start];
            start++
          );

          // common suffix
          for (
            end = len - 1, newEnd = newLen - 1;
            end >= start && newEnd >= start && items[end] === newItems[newEnd];
            end--, newEnd--
          ) {
            temp[newEnd] = mapping[end];
            tempDisposal[newEnd] = disposal[end];
            indicies && (tempIndicies![newEnd] = indicies[end]);
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
            item = items[i];
            j = newIndices.get(item)!;
            if (j !== undefined && j !== -1) {
              temp[j] = mapping[i];
              tempDisposal[j] = disposal[i];
              indicies && (tempIndicies![j] = indicies[i]);
              j = newIndicesNext[j];
              newIndices.set(item, j);
            } else disposal[i].call(disposal[i]);
          }

          // 2) set all the new values, pulling from the temp array if copied, otherwise entering the new value
          for (j = start; j < newLen; j++) {
            if (j in temp) {
              mapping[j] = temp[j];
              disposal[j] = tempDisposal[j];
              if (indicies) {
                indicies[j] = tempIndicies![j];
                indicies[j](j);
              }
            } else {
              mapping[j] = compute<MappedItem>(new RootScope(), mapper, null);
            }
          }

          // 3) in case the new set is shorter than the old, set the length of the mapped array
          mapping = mapping.slice(0, (len = newLen));

          // 4) save a copy of the mapped items for the next update
          items = newItems.slice(0);
        }

        return mapping;
      });

      function mapper(this: Scope) {
        disposal[j] = this;

        if (indicies) {
          const $signal = signal(j);
          indicies[j] = $signal.set;
          return map(newItems[j], $signal);
        }

        return map(newItems[j], () => -1);
      }
    },
    { id: __DEV__ ? options?.id : undefined, initial: [] },
  );
}

let i = 0;
function emptyDisposal(disposal: Dispose[]) {
  for (i = 0; i < disposal.length; i++) disposal[i].call(disposal[i]);
}
