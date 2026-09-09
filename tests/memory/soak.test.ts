import { computed, effect, root, signal, tick, type WriteSignal } from '../../src';
import { computedKeyedMap } from '../../src/map';
import { heapUsed } from './helpers';

interface Todo {
  id: number;
  title: WriteSignal<string>;
  completed: WriteSignal<boolean>;
}

/** Deterministic pseudo-random sequence so every run does identical work. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

/** One mount -> interact -> unmount cycle of a small TodoMVC-shaped app. */
function cycle(seed: number) {
  const random = rng(seed);
  let sink = 0;

  root((dispose) => {
    const todos: Todo[] = Array.from({ length: 200 }, (_, id) => ({
      id,
      title: signal(`todo ${id}`),
      completed: signal(id % 3 === 0),
    }));
    const $todos = signal(todos),
      $filter = signal<'all' | 'active' | 'completed'>('all'),
      $visible = computed(() => {
        const filter = $filter.get();
        return $todos
          .get()
          .filter((t) =>
            filter === 'all' ? true : filter === 'active' ? !t.completed.get() : t.completed.get(),
          );
      }),
      $remaining = computed(() => $todos.get().filter((t) => !t.completed.get()).length);

    const list = computedKeyedMap($visible, (todo) => {
      const li = { text: '', completed: false };
      effect(() => void (li.text = todo.title.get()));
      effect(() => void (li.completed = todo.completed.get()));
      return li;
    });

    effect(() => void (sink += list.get().length + $remaining.get()));

    for (let i = 0; i < 20; i++) {
      const todo = todos[Math.floor(random() * todos.length)];
      todo.completed.set((c) => !c);
      todo.title.set(`todo ${todo.id} (${i})`);
      tick();
    }

    $filter.set('active');
    tick();
    $todos.set((prev) => prev.filter(() => random() > 0.25));
    tick();
    $filter.set('all');
    tick();

    dispose();
  });

  return sink;
}

it('should not grow the heap across repeated mount/update/unmount cycles', async () => {
  // Warm up JIT and allocator state before taking the first measurement.
  for (let i = 0; i < 20; i++) cycle(i);
  const before = await heapUsed();

  for (let i = 0; i < 200; i++) cycle(1000 + i);
  const after = await heapUsed();

  const growth = after - before;
  // A leak of a single node per cycle would already exceed this; noise is well below it.
  expect(growth, `heap grew by ${(growth / 1024).toFixed(0)} kB over 200 cycles`).toBeLessThan(
    1024 * 1024,
  );
});
