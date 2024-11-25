import {
  SCOPE,
  root,
  signal,
  computed,
  effect,
  flushSync,
  getScope,
  type Computation,
  type ReadSignal,
  type WriteSignal,
  onDispose,
} from '../src';

afterEach(() => flushSync());

it('should dispose of inner computations', () => {
  const computeB = vi.fn();

  let $a: WriteSignal<number>;
  let $b: ReadSignal<number>;

  root((dispose) => {
    $a = signal(10);

    $b = computed(() => {
      computeB();
      return $a() + 10;
    });

    $b();
    dispose();
  });

  expect($b!()).toBe(20);
  expect(computeB).toHaveBeenCalledTimes(1);

  flushSync();

  $a!.set(50);
  flushSync();

  expect($b!()).toBe(20);
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
  const innerEffect = vi.fn();

  const $a = signal(0);

  const stop = effect(() => {
    $a();
    root(() => {
      effect(() => {
        innerEffect($a());
      });
    });
  });

  expect(innerEffect).toHaveBeenCalledWith(0);
  expect(innerEffect).toHaveBeenCalledTimes(1);

  stop();

  $a.set(10);
  flushSync();
  expect(innerEffect).not.toHaveBeenCalledWith(10);
  expect(innerEffect).toHaveBeenCalledTimes(1);
});

it('should not be reactive', () => {
  let $a: WriteSignal<number>;

  const rootCall = vi.fn();

  root(() => {
    $a = signal(0);
    $a();
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
      expect(getScope()![SCOPE]).toBe(parent);
    });
  });
});

it('should not observe', () => {
  const $a = signal(0);
  root(() => {
    $a();
    const scope = getScope() as Computation;
    expect(scope._sources).toBeUndefined();
    expect(scope._observers).toBeUndefined();
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
