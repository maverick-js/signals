import { signal, tick, effect, onDispose, getScope, SCOPE, type Scope } from '../src';
import { computedKeyedMap } from '../src/map';

it('should compute keyed map', () => {
  const source = signal([{ id: 'a' }, { id: 'b' }, { id: 'c' }]),
    compute = vi.fn(),
    map = computedKeyedMap(source, (value, index) => {
      compute();
      return {
        id: value.id,
        get index() {
          return index.get();
        },
      };
    });

  const [a, b, c] = map.get();
  expect(a.id).toBe('a');
  expect(a.index).toBe(0);
  expect(b.id).toBe('b');
  expect(b.index).toBe(1);
  expect(c.id).toBe('c');
  expect(c.index).toBe(2);
  expect(compute).toHaveBeenCalledTimes(3);

  // Move values around
  source.set((p) => {
    const tmp = p[1];
    p[1] = p[0];
    p[0] = tmp;
    return [...p];
  });
  tick();

  const [a2, b2, c2] = map.get();
  expect(a2.id).toBe('b');
  expect(a === b2).toBeTruthy();
  expect(a2.index).toBe(0);
  expect(b2.id).toBe('a');
  expect(b2.index).toBe(1);
  expect(b === a2).toBeTruthy();
  expect(c2.id).toBe('c');
  expect(c2.index).toBe(2);
  expect(c === c2).toBeTruthy();
  expect(compute).toHaveBeenCalledTimes(3);

  // Add new value
  source.set((p) => [...p, { id: 'd' }]);
  tick();

  expect(map.get().length).toBe(4);
  expect(map.get()[map.get().length - 1].id).toBe('d');
  expect(map.get()[map.get().length - 1].index).toBe(3);
  expect(compute).toHaveBeenCalledTimes(4);

  // Remove value
  source.set((p) => p.slice(1));
  tick();

  expect(map.get().length).toBe(3);
  expect(map.get()[0].id).toBe('a');
  expect(map.get()[0] === b2 && map.get()[0] === a).toBeTruthy();
  expect(compute).toHaveBeenCalledTimes(4);

  // Empty
  source.set([]);
  tick();

  expect(map.get().length).toBe(0);
  expect(compute).toHaveBeenCalledTimes(4);
});

it('should notify observer', () => {
  const source = signal([{ id: 'a' }, { id: 'b' }, { id: 'c' }]),
    map = computedKeyedMap(
      source,
      (value) => {
        return { id: value.id };
      },
      { id: '$computedKeyedMap' },
    ),
    $effect = vi.fn(() => {
      map.get();
    });

  effect($effect);

  source.set((prev) => prev.slice(1));
  tick();
  expect($effect).toHaveBeenCalledTimes(2);
});

it('should dispose removed items and detach them from the scope', () => {
  const a = { id: 'a' },
    b = { id: 'b' },
    c = { id: 'c' },
    d = { id: 'd' },
    e = { id: 'e' },
    source = signal([a, b, c, d, e]),
    disposed = vi.fn();

  let scope!: Scope;

  const map = computedKeyedMap(source, (item) => {
    scope = getScope()![SCOPE]!;
    onDispose(() => disposed(item.id));
    return item.id;
  });

  expect(map.get()).toEqual(['a', 'b', 'c', 'd', 'e']);
  expect(scope._children).toHaveLength(5);

  source.set([a, c, e]);
  tick();
  expect(map.get()).toEqual(['a', 'c', 'e']);
  expect(disposed.mock.calls.map((call) => call[0])).toEqual(['b', 'd']);
  expect(scope._children).toHaveLength(3);

  source.set([e, a]);
  tick();
  expect(map.get()).toEqual(['e', 'a']);
  expect(disposed).toHaveBeenCalledTimes(3);
  expect(scope._children).toHaveLength(2);

  source.set([e, a, b]);
  tick();
  expect(map.get()).toEqual(['e', 'a', 'b']);
  expect(scope._children).toHaveLength(3);

  source.set([]);
  tick();
  map.get();
  expect(disposed).toHaveBeenCalledTimes(6);
  expect(scope._children).toBeNull();
});

it('should update index signals when items move', () => {
  const a = { id: 'a' },
    b = { id: 'b' },
    c = { id: 'c' },
    source = signal([a, b, c]),
    indexes: number[][] = [];

  const map = computedKeyedMap(source, (item, index) => {
    effect(() => {
      indexes.push([item.id.charCodeAt(0) - 97, index.get()]);
    });
    return item;
  });

  map.get();
  indexes.length = 0;

  source.set([c, a, b]);
  tick();
  map.get();
  tick();
  expect(indexes.sort()).toEqual([
    [0, 1],
    [1, 2],
    [2, 0],
  ]);
});

it('should handle a mapped value of undefined', () => {
  const a = { id: 'a' },
    b = { id: 'b' },
    source = signal([a, b]),
    compute = vi.fn();

  const map = computedKeyedMap(source, () => {
    compute();
    return undefined;
  });

  expect(map.get()).toEqual([undefined, undefined]);

  source.set([b, a]);
  tick();
  expect(map.get()).toEqual([undefined, undefined]);
  expect(compute).toHaveBeenCalledTimes(2);
});
