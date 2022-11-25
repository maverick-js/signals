// Adapted from: https://github.com/solidjs/solid/blob/main/packages/solid/src/reactive/array.ts#L153

import {
  computed,
  Dispose,
  Maybe,
  observable,
  Observable,
  onDispose,
  peek,
  readonly,
  root,
} from './observables';

function runAll(fns: (() => void)[]) {
  for (let i = 0; i < fns.length; i++) fns[i]();
}

/**
 * Reactive map helper that caches each item by index to reduce unnecessary mapping on updates.
 * It only runs the mapping function once per item and adds/removes as needed. In a non-keyed map
 * like this the index is fixed but value can change (opposite of a keyed map).
 *
 * Prefer `computedKeyedMap` when referential checks are required.
 *
 * @see {@link https://github.com/maverick-js/observables#computedmap}
 */
export function computedMap<Item, MappedItem>(
  list: Observable<Maybe<readonly Item[]>>,
  map: (value: Observable<Item>, index: number) => MappedItem,
  options?: { id?: string },
): Observable<MappedItem[]> {
  let items: Item[] = [],
    mapped: MappedItem[] = [],
    disposal: Dispose[] = [],
    observables: ((v: any) => void)[] = [],
    i: number,
    len = 0;

  onDispose(() => runAll(disposal));

  return computed(
    () => {
      const newItems = list() || [];
      return peek(() => {
        if (newItems.length === 0) {
          if (len !== 0) {
            runAll(disposal);
            disposal = [];
            items = [];
            mapped = [];
            len = 0;
            observables = [];
          }

          return mapped;
        }

        for (i = 0; i < newItems.length; i++) {
          if (i < items.length && items[i] !== newItems[i]) {
            observables[i](newItems[i]);
          } else if (i >= items.length) {
            mapped[i] = root(mapper);
          }
        }

        for (; i < items.length; i++) disposal[i]();

        len = observables.length = disposal.length = newItems.length;
        items = newItems.slice(0);
        return (mapped = mapped.slice(0, len));
      });

      function mapper(dispose: () => void) {
        disposal[i] = dispose;
        const $o = observable(newItems[i]);
        observables[i] = $o.set;
        return map($o, i);
      }
    },
    __DEV__ ? { id: options?.id, errors: true } : undefined,
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
 * @see {@link https://github.com/maverick-js/observables#computedkeyedmap}
 */
export function computedKeyedMap<Item, MappedItem>(
  list: Observable<Maybe<readonly Item[]>>,
  map: (value: Item, index: Observable<number>) => MappedItem,
  options?: { id?: string },
): Observable<MappedItem[]> {
  let items: Item[] = [],
    mapping: MappedItem[] = [],
    disposal: Dispose[] = [],
    len = 0,
    indicies: ((v: number) => number)[] | null = map.length > 1 ? [] : null;

  onDispose(() => runAll(disposal));

  return computed(
    () => {
      let newItems = list() || [],
        i: number,
        j: number;

      return peek(() => {
        let newLen = newItems.length;

        // fast path for empty arrays
        if (newLen === 0) {
          if (len !== 0) {
            runAll(disposal);
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
            mapping[j] = root(mapper);
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
            tempDisposal: (() => void)[] = new Array(newLen),
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
            } else disposal[i]();
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
            } else mapping[j] = root(mapper);
          }

          // 3) in case the new set is shorter than the old, set the length of the mapped array
          mapping = mapping.slice(0, (len = newLen));

          // 4) save a copy of the mapped items for the next update
          items = newItems.slice(0);
        }

        return mapping;
      });

      function mapper(dispose: () => void) {
        disposal[j] = dispose;

        if (indicies) {
          const $i = observable(j);
          indicies[j] = (v) => {
            $i.set(v);
            return v;
          };
          return map(newItems[j], readonly($i));
        }

        return map(newItems[j], () => -1);
      }
    },
    __DEV__ ? { id: options?.id, errors: true } : undefined,
  );
}
