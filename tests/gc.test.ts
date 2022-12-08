import { computed, effect, getScope, root, signal, tick } from '../src';

function gc() {
  return new Promise((resolve) =>
    setTimeout(async () => {
      tick(); // flush call stack (holds a reference)
      global.gc!();
      resolve(void 0);
    }, 0),
  );
}

it('should gc computed if there are no observers', async () => {
  const $a = signal(0),
    ref = new WeakRef(computed(() => $a()));

  await gc();
  expect(ref.deref()).toBeUndefined();
});

it('should _not_ gc computed if there are observers', async () => {
  let $a = signal(0);

  const ref = new WeakRef(
    computed(() => {
      $a();
    }),
  );

  ref.deref()!();

  await gc();
  expect(ref.deref()).toBeDefined();
});

it('should gc root if disposed', async () => {
  let $a = signal(0),
    ref!: WeakRef<any>;

  const dispose = root((dispose) => {
    ref = new WeakRef(
      computed(() => {
        $a();
      }),
    );

    return dispose;
  });

  await gc();
  expect(ref.deref()).toBeDefined();

  dispose();
  await gc();
  expect(ref.deref()).toBeUndefined();
});

it('should gc effect lazily', async () => {
  let $a = signal(0),
    ref!: WeakRef<any>;

  const dispose = root((dispose) => {
    effect(() => {
      $a();
      ref = new WeakRef(getScope()!);
    });

    return dispose;
  });

  await gc();
  expect(ref.deref()).toBeDefined();

  dispose();
  $a.set(1);

  await gc();
  expect(ref.deref()).toBeUndefined();
});
