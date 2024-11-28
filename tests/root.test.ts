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
  let computeB = vi.fn(),
    $a: Signal<number>,
    $b: Reaction<number>;

  root((dispose) => {
    $a = signal(10);

    $b = computed(() => {
      computeB();
      return $a.get() + 10;
    });

    $b.get();
    dispose();
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
  const result = root((dispose) => {
    dispose();
    return 10;
  });

  expect(result).toBe(10);
});

it('should create new tracking scope', () => {
  const innerEffect = vi.fn(),
    $a = signal(0);

  const stop = effect(() => {
    $a.get();
    root(() => {
      effect(() => {
        innerEffect($a.get());
      });
    });
  });

  expect(innerEffect).not.toHaveBeenCalledWith(0);
  expect(innerEffect).toHaveBeenCalledTimes(0);

  flushSync();

  expect(innerEffect).toHaveBeenCalledWith(0);
  expect(innerEffect).toHaveBeenCalledTimes(1);

  stop();

  $a.set(10);
  flushSync();

  expect(innerEffect).not.toHaveBeenCalledWith(10);
  expect(innerEffect).toHaveBeenCalledTimes(1);
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

it('should not throw if dispose called during active disposal process', () => {
  root((dispose) => {
    onDispose(() => {
      dispose();
    });

    dispose();
  });
});
