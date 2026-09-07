import { signal, tick, onDispose, getScope, root, effect, SCOPE, type Scope } from '../src';
import { computedMap } from '../src/map';

it('should compute map', () => {
  const source = signal([1, 2, 3]);
  const compute = vi.fn();

  const map = computedMap(source, (value, index) => {
    compute();
    return {
      i: index,
      get id() {
        return value() * 2;
      },
    };
  });

  const [a, b, c] = map();
  expect(a.i).toBe(0);
  expect(a.id).toBe(2);
  expect(b.i).toBe(1);
  expect(b.id).toBe(4);
  expect(c.i).toBe(2);
  expect(c.id).toBe(6);
  expect(compute).toHaveBeenCalledTimes(3);

  // Move values around
  source.set([3, 2, 1]);
  tick();

  const [a2, b2, c2] = map();
  expect(a2.i).toBe(0);
  expect(a2.id).toBe(6);
  expect(a === a2).toBeTruthy();
  expect(b2.i).toBe(1);
  expect(b2.id).toBe(4);
  expect(b === b2).toBeTruthy();
  expect(c2.i).toBe(2);
  expect(c2.id).toBe(2);
  expect(c === c2).toBeTruthy();
  expect(compute).toHaveBeenCalledTimes(3);

  // Add new value
  source.set([3, 2, 1, 4]);
  tick();

  expect(map().length).toBe(4);
  expect(map()[map().length - 1].i).toBe(3);
  expect(map()[map().length - 1].id).toBe(8);
  expect(compute).toHaveBeenCalledTimes(4);

  // Remove value
  source.set([2, 1, 4]);
  tick();

  expect(map().length).toBe(3);
  expect(map()[0].id).toBe(4);

  // Empty
  source.set([]);
  tick();

  expect(map().length).toBe(0);
  expect(compute).toHaveBeenCalledTimes(4);
});

it('should store function items without invoking them', () => {
  const fnA = () => 'a',
    fnB = () => 'b',
    source = signal<Array<() => string>>([fnA]);

  const map = computedMap(source, (value) => value);

  const [first] = map();
  expect(first()).toBe(fnA);

  source.set([fnB]);
  tick();
  map();
  expect(first()).toBe(fnB);
});

it('should dispose removed items in reverse order and detach them from the scope', () => {
  const source = signal([1, 2, 3, 4, 5]),
    disposed = vi.fn();

  let scope!: Scope;

  const map = computedMap(source, (value, index) => {
    scope = getScope()![SCOPE]!;
    onDispose(() => disposed(index));
    return value;
  });

  map();
  expect(scope._children).toHaveLength(5);

  source.set([1, 2]);
  tick();
  map();
  expect(disposed.mock.calls.map((call) => call[0])).toEqual([4, 3, 2]);
  expect(scope._children).toHaveLength(2);

  source.set([1, 2, 3]);
  tick();
  expect(map().map((value) => value())).toEqual([1, 2, 3]);
  expect(scope._children).toHaveLength(3);

  source.set([]);
  tick();
  map();
  expect(disposed).toHaveBeenCalledTimes(6);
  expect(scope._children).toBeNull();
});

it('should dispose effects created inside the mapper when items are removed', () => {
  const source = signal([1, 2, 3]),
    $shared = signal(0),
    runs = vi.fn();

  const map = computedMap(source, (value) => {
    effect(() => {
      runs(value(), $shared());
    });
    return value;
  });

  map();
  expect(runs).toHaveBeenCalledTimes(3);
  expect($shared.node!._observers).toHaveLength(3);

  source.set([1]);
  tick();
  map();
  expect($shared.node!._observers).toHaveLength(1);

  $shared.set(1);
  tick();
  expect(runs).toHaveBeenCalledTimes(4);
});

it('should dispose all items when the outer scope is disposed', () => {
  const source = signal([1, 2, 3]),
    disposed = vi.fn();

  const dispose = root((dispose) => {
    const map = computedMap(source, (value) => {
      onDispose(disposed);
      return value;
    });
    map();
    return dispose;
  });

  dispose();
  expect(disposed).toHaveBeenCalledTimes(3);
});
