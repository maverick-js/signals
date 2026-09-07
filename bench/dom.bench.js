/**
 * "Real work" benchmarks against a fake DOM: `current` (dist/prod) vs `baseline` (bench/.baseline).
 *
 *   pnpm bench:dom            # or: vitest bench --run bench/dom
 *   BENCH_QUICK=1 pnpm bench:dom
 *
 * Each scenario builds a UI (signals + computeds + effects writing to `FakeNode`s), drives it through
 * a scripted sequence of interactions with `tick()` after every write, and disposes everything.
 * The whole scenario is timed. Before benchmarking, every scenario is run once per library and the
 * number of fake-DOM mutations is asserted to be identical - a difference means the builds are not
 * doing the same work.
 */

import * as fakeDom from './lib/fake-dom.js';
import { loadLibs } from './lib/load.js';
import * as random from './lib/rng.js';
import * as helpers from './lib/scenario.js';

// Local bindings: inside a vitest worker every access to an imported name goes through a module
// getter, which adds overhead to hot loops (see "Module runner overhead" in bench/README.md).
const { FakeNode, dom, syncChildren } = fakeDom;
const { rng } = random;
const { quick, range, scenario, sink } = helpers;

const libs = loadLibs();

/** @typedef {import('./lib/load.js').Lib} Lib */

// ---------------------------------------------------------------------------------------
// TodoMVC
// ---------------------------------------------------------------------------------------

/**
 * @param {Lib} lib
 * @param {{ todos: number }} size
 */
function todoMVC(lib, { todos: n }) {
  const { signal, computed, effect, root, tick, computedKeyedMap } = lib;
  const rand = rng(11);

  const app = new FakeNode('section');
  const ul = new FakeNode('ul');
  const footer = new FakeNode('footer');
  const count = new FakeNode('span');
  app.appendChild(ul);
  app.appendChild(footer);
  footer.appendChild(count);

  let nextId = 0;
  /** @param {string} title */
  const createTodo = (title) => ({ id: nextId++, title: signal(title), completed: signal(false) });

  const dispose = root((dispose) => {
    /** @type {ReturnType<typeof createTodo>[]} */
    const initial = [];
    const todos = signal(initial);
    const filter = signal('all');

    const visible = computed(() => {
      const list = todos();
      const f = filter();
      if (f === 'all') return list;
      return list.filter((t) => (f === 'active' ? !t.completed() : t.completed()));
    });

    const items = computedKeyedMap(visible, (todo) => {
      const li = new FakeNode('li');
      const toggle = new FakeNode('input');
      const label = new FakeNode('label');
      li.appendChild(toggle);
      li.appendChild(label);
      effect(() => {
        label.textContent = todo.title();
      });
      effect(() => {
        if (todo.completed()) {
          li.setAttribute('class', 'completed');
          toggle.setAttribute('checked', '');
        } else {
          li.removeAttribute('class');
          toggle.removeAttribute('checked');
        }
      });
      return li;
    });

    effect(() => {
      syncChildren(ul, items());
    });

    effect(() => {
      const list = todos();
      let active = 0;
      for (let i = 0; i < list.length; i++) if (!list[i].completed()) active++;
      count.textContent = `${active} item${active === 1 ? '' : 's'} left`;
      if (list.length) footer.removeAttribute('hidden');
      else footer.setAttribute('hidden', '');
    });

    // add N todos in batches of 100
    for (let b = 0; b < n; b += 100) {
      const batch = [];
      for (let i = b; i < Math.min(n, b + 100); i++) batch.push(createTodo(`Todo #${i}`));
      todos.set((list) => list.concat(batch));
      tick();
    }

    // toggle N/2 random todos
    const all = todos();
    for (let i = 0; i < n / 2; i++) {
      all[rand.int(all.length)].completed.set((v) => !v);
      tick();
    }

    // edit N/5 titles
    for (let i = 0; i < n / 5; i++) {
      const todo = all[rand.int(all.length)];
      todo.title.set(todo.title() + ' (edited)');
      tick();
    }

    // cycle the filter 10 times (all -> active -> completed -> all)
    for (let i = 0; i < 10; i++) {
      for (const f of ['active', 'completed', 'all']) {
        filter.set(f);
        tick();
      }
    }

    // remove N/2 random todos one by one
    for (let i = 0; i < n / 2; i++) {
      const list = todos();
      const victim = list[rand.int(list.length)];
      todos.set(list.filter((t) => t !== victim));
      tick();
    }

    // clear completed
    todos.set((list) => list.filter((t) => !t.completed()));
    tick();

    // clear all
    todos.set([]);
    tick();

    return dispose;
  });

  dispose();
  sink.value = app.children.length;
}

// ---------------------------------------------------------------------------------------
// Data grid
// ---------------------------------------------------------------------------------------

/**
 * @param {Lib} lib
 * @param {{ rows: number, cols: number }} size
 */
function dataGrid(lib, { rows: n, cols }) {
  const { signal, effect, root, tick, computedMap, computedKeyedMap, selector } = lib;
  const rand = rng(23);

  const table = new FakeNode('table');
  const tbody = new FakeNode('tbody');
  const keyedBody = new FakeNode('tbody');
  table.appendChild(tbody);
  table.appendChild(keyedBody);

  const dispose = root((dispose) => {
    // 3 pages worth of data so we can page / scroll.
    const data = range(3 * n).map((id) => ({
      id,
      cells: range(cols).map((c) => signal(id * cols + c)),
    }));

    const rows = signal(data.slice(0, n));
    const selected = signal(-1);
    const isSelected = selector(selected);

    // Non-keyed: index is fixed, the row value is a signal.
    const trs = computedMap(rows, ($row) => {
      const tr = new FakeNode('tr');
      const tds = range(cols).map(() => tr.appendChild(new FakeNode('td')));
      for (let c = 0; c < cols; c++) {
        effect(() => {
          tds[c].textContent = $row().cells[c]();
        });
      }
      effect(() => {
        if (isSelected($row().id)()) tr.setAttribute('class', 'selected');
        else tr.removeAttribute('class');
      });
      return tr;
    });

    effect(() => {
      syncChildren(tbody, trs());
    });

    // Keyed: the row object is fixed, the index is a signal.
    const keyedTrs = computedKeyedMap(rows, (row) => {
      const tr = new FakeNode('tr');
      const tds = range(cols).map(() => tr.appendChild(new FakeNode('td')));
      for (let c = 0; c < cols; c++) {
        effect(() => {
          tds[c].textContent = row.cells[c]();
        });
      }
      const $selected = isSelected(row.id);
      effect(() => {
        if ($selected()) tr.setAttribute('class', 'selected');
        else tr.removeAttribute('class');
      });
      return tr;
    });

    effect(() => {
      syncChildren(keyedBody, keyedTrs());
    });

    // update 10% of the visible cells in 10 batches
    const perBatch = Math.max(1, Math.round((n * cols) / 100));
    for (let b = 0; b < 10; b++) {
      const visible = rows();
      for (let i = 0; i < perBatch; i++) {
        visible[rand.int(visible.length)].cells[rand.int(cols)].set((v) => v + 1);
      }
      tick();
    }

    // sort by the first column (descending), then back by id
    rows.set(
      rows()
        .slice()
        .sort((a, b) => b.cells[0]() - a.cells[0]()),
    );
    tick();
    rows.set(
      rows()
        .slice()
        .sort((a, b) => a.id - b.id),
    );
    tick();

    // select 100 rows one after another
    for (let i = 0; i < 100; i++) {
      selected.set(rows()[rand.int(n)].id);
      tick();
    }

    // page: replace the list with the next pages
    for (let p = 1; p < 3; p++) {
      rows.set(data.slice(p * n, (p + 1) * n));
      tick();
    }

    // scroll: shift the window by 10% ten times
    const step = Math.max(1, Math.round(n / 10));
    for (let s = 0; s < 10; s++) {
      rows.set(data.slice(s * step, s * step + n));
      tick();
    }

    return dispose;
  });

  dispose();
  sink.value = table.children.length;
}

// ---------------------------------------------------------------------------------------
// Nested components
// ---------------------------------------------------------------------------------------

/**
 * @param {Lib} lib
 * @param {{ depth: number, branching: number }} size
 */
function nestedComponents(lib, { depth, branching }) {
  const { signal, computed, effect, root, tick, getContext, setContext, getScope, scoped } = lib;

  const container = new FakeNode('main');

  /**
   * @typedef {object} Component
   * @property {FakeNode} el
   * @property {any} scope
   * @property {() => void} dispose
   * @property {Component[]} children
   * @property {{ a: any, b: any, c: any }} state
   */

  /**
   * @param {FakeNode} parent
   * @param {number} level
   * @returns {Component}
   */
  function Component(parent, level) {
    return root((dispose) => {
      const scope = getScope();
      const theme = getContext('theme');

      const el = new FakeNode('div');
      const title = new FakeNode('h3');
      parent.appendChild(el);
      el.appendChild(title);

      const a = signal(level);
      const b = signal(1);
      const c = signal('idle');

      const sum = computed(() => a() + b());
      const label = computed(() => `${theme}: ${sum()}`);

      effect(() => {
        title.textContent = label();
      });
      effect(() => {
        el.setAttribute('data-state', c());
      });
      effect(() => {
        el.setAttribute('class', sum() % 2 ? `${theme} odd` : `${theme} even`);
      });

      /** @type {Component[]} */
      const children = [];
      if (level < depth) {
        for (let i = 0; i < branching; i++) children.push(Component(el, level + 1));
      }

      return { el, scope, dispose, children, state: { a, b, c } };
    });
  }

  /** @param {Component} component @param {Component[]} out */
  function collectLeaves(component, out) {
    if (!component.children.length) out.push(component);
    else for (const child of component.children) collectLeaves(child, out);
    return out;
  }

  const app = root((dispose) => {
    setContext('theme', 'dark');
    return { tree: Component(container, 0), dispose };
  });

  // update all leaf signals (3 rounds)
  let leaves = collectLeaves(app.tree, []);
  for (let round = 1; round <= 3; round++) {
    for (const leaf of leaves) {
      leaf.state.a.set((v) => v + 1);
      leaf.state.b.set((v) => v + round);
      leaf.state.c.set(round % 2 ? 'active' : 'idle');
    }
    tick();
  }

  // re-render one subtree: dispose the first child and recreate it under the same parent scope
  const victim = app.tree.children[0];
  victim.dispose();
  app.tree.el.removeChild(victim.el);
  app.tree.children[0] = scoped(() => Component(app.tree.el, 1), app.tree.scope);
  tick();

  // update again so the new subtree gets exercised
  leaves = collectLeaves(app.tree, []);
  for (const leaf of leaves) leaf.state.a.set((v) => v + 1);
  tick();

  app.dispose();
  sink.value = container.children.length;
}

// ---------------------------------------------------------------------------------------
// Form
// ---------------------------------------------------------------------------------------

/**
 * @param {Lib} lib
 * @param {{ fields: number, keystrokes: number }} size
 */
function form(lib, { fields: n, keystrokes }) {
  const { signal, computed, effect, root, tick } = lib;

  const formEl = new FakeNode('form');

  const dispose = root((dispose) => {
    const submitted = signal(false);

    const fields = range(n).map((i) => {
      const value = signal('');
      const error = computed(() => {
        const v = value();
        if (v.length === 0) return 'Required';
        if (v.length < 5) return 'Too short';
        if (i % 3 === 0 && !/\d/.test(v)) return 'Must contain a digit';
        if (i % 5 === 0 && v.length > 24) return 'Too long';
        return null;
      });

      const wrapper = new FakeNode('div');
      const input = new FakeNode('input');
      const message = new FakeNode('span');
      formEl.appendChild(wrapper);
      wrapper.appendChild(input);
      wrapper.appendChild(message);

      effect(() => {
        input.setAttribute('value', value());
      });

      effect(() => {
        const e = error();
        const show = submitted() && e;
        message.textContent = show ? e : '';
        if (show) wrapper.setAttribute('class', 'invalid');
        else wrapper.removeAttribute('class');
      });

      return { value, error };
    });

    const formValid = computed(() => {
      if (!submitted()) return false;
      for (let i = 0; i < fields.length; i++) if (fields[i].error()) return false;
      return true;
    });

    const summary = new FakeNode('p');
    const button = new FakeNode('button');
    formEl.appendChild(summary);
    formEl.appendChild(button);

    effect(() => {
      summary.textContent = !submitted() ? '' : formValid() ? 'All good' : 'Please fix the errors';
    });
    effect(() => {
      if (formValid()) button.removeAttribute('disabled');
      else button.setAttribute('disabled', '');
    });

    /** @param {number} k */
    const key = (k) => (k % 4 === 3 ? String(k % 10) : String.fromCharCode(97 + (k % 26)));

    // type into every field
    for (let k = 0; k < keystrokes; k++) {
      for (let i = 0; i < fields.length; i++) {
        fields[i].value.set((v) => v + key(k));
        tick();
      }
    }

    // toggle submitted 10 times
    for (let i = 0; i < 10; i++) {
      submitted.set((v) => !v);
      tick();
    }

    // keep typing with errors visible (submitted === false after an even number of toggles, so
    // submit once more first)
    submitted.set(true);
    tick();
    for (let k = 0; k < keystrokes / 2; k++) {
      for (let i = 0; i < fields.length; i++) {
        fields[i].value.set((v) => v + key(k));
        tick();
      }
    }

    return dispose;
  });

  dispose();
  sink.value = formEl.children.length;
}

// ---------------------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------------------

/**
 * Lighter scenarios are repeated `reps` times per iteration so every iteration is at least ~10ms
 * (sub-millisecond iterations are dominated by timer / scheduling noise).
 *
 * @type {Array<{ name: string, reps: number, run: (lib: Lib) => void }>}
 */
const scenarios = [
  {
    name: `TodoMVC (${quick ? 300 : 1_000} todos)`,
    reps: 1,
    run: (lib) => todoMVC(lib, { todos: quick ? 300 : 1_000 }),
  },
  {
    name: `data grid (${quick ? 300 : 1_000} rows x 10 cells, keyed + non-keyed)`,
    reps: 1,
    run: (lib) => dataGrid(lib, { rows: quick ? 300 : 1_000, cols: 10 }),
  },
  {
    name: `nested components (depth 6, branching 3) x${quick ? 2 : 4}`,
    reps: quick ? 2 : 4,
    run: (lib) => nestedComponents(lib, { depth: 6, branching: 3 }),
  },
  {
    name: `form (50 fields, 20 keystrokes each) x${quick ? 5 : 10}`,
    reps: quick ? 5 : 10,
    run: (lib) => form(lib, { fields: 50, keystrokes: 20 }),
  },
];

for (const { name, reps, run } of scenarios) {
  scenario(
    libs,
    name,
    (lib) => ({
      fn() {
        for (let r = 0; r < reps; r++) run(lib);
      },
    }),
    {
      checkLabel: 'mutations',
      check(lib) {
        dom.mutations = 0;
        for (let r = 0; r < reps; r++) run(lib);
        return dom.mutations;
      },
    },
  );
}
