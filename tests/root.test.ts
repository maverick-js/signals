import {
  root,
  signal,
  computed,
  effect,
  flushSync,
  getScope,
  onDispose,
  type Signal,
  type Reaction,
} from '../src';

afterEach(() => flushSync());

it('should dispose of inner computations', () => {
  let $a: Signal<number>,
    $b: Reaction<number>,
    computeB = vi.fn(() => $a.get() + 10);

  root((scope) => {
    $a = signal(10);

    $b = computed(computeB);

    $b.get();
    scope.destroy();
  });

  expect($b!.get()).toBe(20);
  expect(computeB).toHaveBeenCalledTimes(1);

  flushSync();

  $a!.set(50);
  flushSync();

  expect($b!.get()).toBe(20);
  expect(computeB).toHaveBeenCalledTimes(1);
});

it('should return result', () => {
  const result = root((scope) => {
    scope.destroy();
    return 10;
  });

  expect(result).toBe(10);
});

it('should create new tracking scope', () => {
  const $a = signal(0),
    $effect = vi.fn();

  const stop = effect(() => {
    $a.get();
    root(() => {
      effect(() => {
        $effect($a.get());
      });
    });
  });

  expect($effect).not.toHaveBeenCalledWith(0);
  expect($effect).toHaveBeenCalledTimes(0);

  flushSync();

  expect($effect).toHaveBeenCalledWith(0);
  expect($effect).toHaveBeenCalledTimes(1);

  stop();

  $a.set(10);
  flushSync();

  expect($effect).not.toHaveBeenCalledWith(10);
  expect($effect).toHaveBeenCalledTimes(1);
});

it('should not be reactive', () => {
  let $a: Signal<number>,
    rootCall = vi.fn();

  root(() => {
    $a = signal(0);
    $a.get();
    rootCall();
  });

  expect(rootCall).toHaveBeenCalledTimes(1);

  $a!.set(1);
  flushSync();
  expect(rootCall).toHaveBeenCalledTimes(1);
});

it('should hold parent tracking', () => {
  root(() => {
    const parent = getScope();
    root(() => {
      expect(getScope()!._parent).toBe(parent);
    });
  });
});

it('should not throw if destroy called during active disposal process', () => {
  root((scope) => {
    onDispose(() => {
      scope.destroy();
    });

    scope.destroy();
  });
});
