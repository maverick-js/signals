/**
 * "Real work" benchmarks against a fake DOM: `current` (dist/prod) vs `baseline` (bench/.baseline).
 *
 *   pnpm bench:dom            # or: vitest bench --run bench/dom
 *   BENCH_QUICK=1 pnpm bench:dom
 *
 * Each scenario builds a UI (signals + computeds + effects writing to `FakeNode`s), drives it through
 * a scripted sequence of interactions with `tick()` after every write, and disposes everything.
 * The first four scenarios (TodoMVC, data grid, nested components, form) time the whole thing,
 * creation and disposal included. The stateful ones (js-framework-benchmark operations, media
 * player, component churn) build their state untimed and time one operation, restoring the state
 * between iterations where the operation is not its own inverse. Before benchmarking, every
 * scenario is run once per library and the number of fake-DOM mutations is asserted to be
 * identical - a difference means the builds are not doing the same work.
 */

import * as fakeDom from './lib/fake-dom.js';
import { loadLibs } from './lib/load.js';
import * as random from './lib/rng.js';
import * as helpers from './lib/scenario.js';

// Local bindings: inside a vitest worker every access to an imported name goes through a module
// getter, which adds overhead to hot loops (see "Module runner overhead" in bench/README.md).
const { FakeNode, dom, syncChildren } = fakeDom;
const { rng } = random;
const { quick, range, scenario, sink, withRoot } = helpers;

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
      const list = todos.get();
      const f = filter.get();
      if (f === 'all') return list;
      return list.filter((t) => (f === 'active' ? !t.completed.get() : t.completed.get()));
    });

    const items = computedKeyedMap(visible, (todo) => {
      const li = new FakeNode('li');
      const toggle = new FakeNode('input');
      const label = new FakeNode('label');
      li.appendChild(toggle);
      li.appendChild(label);
      effect(() => {
        label.textContent = todo.title.get();
      });
      effect(() => {
        if (todo.completed.get()) {
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
      syncChildren(ul, items.get());
    });

    effect(() => {
      const list = todos.get();
      let active = 0;
      for (let i = 0; i < list.length; i++) if (!list[i].completed.get()) active++;
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
    const all = todos.get();
    for (let i = 0; i < n / 2; i++) {
      all[rand.int(all.length)].completed.set((v) => !v);
      tick();
    }

    // edit N/5 titles
    for (let i = 0; i < n / 5; i++) {
      const todo = all[rand.int(all.length)];
      todo.title.set(todo.title.get() + ' (edited)');
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
      const list = todos.get();
      const victim = list[rand.int(list.length)];
      todos.set(list.filter((t) => t !== victim));
      tick();
    }

    // clear completed
    todos.set((list) => list.filter((t) => !t.completed.get()));
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
          tds[c].textContent = $row.get().cells[c].get();
        });
      }
      effect(() => {
        if (isSelected($row.get().id).get()) tr.setAttribute('class', 'selected');
        else tr.removeAttribute('class');
      });
      return tr;
    });

    effect(() => {
      syncChildren(tbody, trs.get());
    });

    // Keyed: the row object is fixed, the index is a signal.
    const keyedTrs = computedKeyedMap(rows, (row) => {
      const tr = new FakeNode('tr');
      const tds = range(cols).map(() => tr.appendChild(new FakeNode('td')));
      for (let c = 0; c < cols; c++) {
        effect(() => {
          tds[c].textContent = row.cells[c].get();
        });
      }
      const $selected = isSelected(row.id);
      effect(() => {
        if ($selected.get()) tr.setAttribute('class', 'selected');
        else tr.removeAttribute('class');
      });
      return tr;
    });

    effect(() => {
      syncChildren(keyedBody, keyedTrs.get());
    });

    // update 10% of the visible cells in 10 batches
    const perBatch = Math.max(1, Math.round((n * cols) / 100));
    for (let b = 0; b < 10; b++) {
      const visible = rows.get();
      for (let i = 0; i < perBatch; i++) {
        visible[rand.int(visible.length)].cells[rand.int(cols)].set((v) => v + 1);
      }
      tick();
    }

    // sort by the first column (descending), then back by id
    rows.set(
      rows
        .get()
        .slice()
        .sort((a, b) => b.cells[0].get() - a.cells[0].get()),
    );
    tick();
    rows.set(
      rows
        .get()
        .slice()
        .sort((a, b) => a.id - b.id),
    );
    tick();

    // select 100 rows one after another
    for (let i = 0; i < 100; i++) {
      selected.set(rows.get()[rand.int(n)].id);
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

      const sum = computed(() => a.get() + b.get());
      const label = computed(() => `${theme}: ${sum.get()}`);

      effect(() => {
        title.textContent = label.get();
      });
      effect(() => {
        el.setAttribute('data-state', c.get());
      });
      effect(() => {
        el.setAttribute('class', sum.get() % 2 ? `${theme} odd` : `${theme} even`);
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
        const v = value.get();
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
        input.setAttribute('value', value.get());
      });

      effect(() => {
        const e = error.get();
        const show = submitted.get() && e;
        message.textContent = show ? e : '';
        if (show) wrapper.setAttribute('class', 'invalid');
        else wrapper.removeAttribute('class');
      });

      return { value, error };
    });

    const formValid = computed(() => {
      if (!submitted.get()) return false;
      for (let i = 0; i < fields.length; i++) if (fields[i].error.get()) return false;
      return true;
    });

    const summary = new FakeNode('p');
    const button = new FakeNode('button');
    formEl.appendChild(summary);
    formEl.appendChild(button);

    effect(() => {
      summary.textContent = !submitted.get()
        ? ''
        : formValid.get()
          ? 'All good'
          : 'Please fix the errors';
    });
    effect(() => {
      if (formValid.get()) button.removeAttribute('disabled');
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
// js-framework-benchmark
// ---------------------------------------------------------------------------------------

// Word lists from the Krausest benchmark's `buildData()`.
const ADJECTIVES = [
  'pretty',
  'large',
  'big',
  'small',
  'tall',
  'short',
  'long',
  'handsome',
  'plain',
  'quaint',
  'clean',
  'elegant',
  'easy',
  'angry',
  'crazy',
  'helpful',
  'mushy',
  'odd',
  'unsightly',
  'adorable',
  'important',
  'inexpensive',
  'cheap',
  'expensive',
  'fancy',
];
const COLOURS = [
  'red',
  'yellow',
  'blue',
  'green',
  'pink',
  'brown',
  'purple',
  'brown',
  'white',
  'black',
  'orange',
];
const NOUNS = [
  'table',
  'chair',
  'house',
  'bbq',
  'desk',
  'car',
  'pony',
  'cookie',
  'sandwich',
  'burger',
  'pizza',
  'mouse',
  'keyboard',
];

/**
 * @typedef {{ id: number, base: string, label: { get(): string, set(v: string): void } }} Row
 *
 * @typedef {object} JsFrameworkBenchmark
 * @property {{ get(): Row[], set(v: Row[] | ((prev: Row[]) => Row[])): void }} rows
 * @property {{ set(v: number): void }} selected
 * @property {(n: number) => Row[]} buildRows      allocates rows with fresh ids and labels
 * @property {(list: Row[]) => void} set           `rows.set(list)` + `tick()`
 * @property {FakeNode} tbody
 * @property {ReturnType<typeof rng>} rand
 * @property {Row[]} initial                       the list the phase started with (set by `withRows`)
 * @property {boolean} flip
 * @property {() => void} dispose
 */

/**
 * The Krausest table: one `computedKeyedMap` over a `rows` signal renders `<tr>`s whose label
 * cell is bound by an effect and whose class is driven by a `selector` on the selected id.
 *
 * @param {Lib} lib
 * @returns {JsFrameworkBenchmark}
 */
function jsFrameworkBenchmark(lib) {
  const { signal, effect, tick, computedKeyedMap, selector } = lib;
  const rand = rng(31);

  const table = new FakeNode('table');
  const tbody = new FakeNode('tbody');
  table.appendChild(tbody);

  let nextId = 1;

  return withRoot(lib, () => {
    const rows = signal(/** @type {Row[]} */ ([]));
    const selected = signal(-1);
    const isSelected = selector(selected);

    const trs = computedKeyedMap(rows, (/** @type {Row} */ row) => {
      const tr = new FakeNode('tr');
      const idCell = tr.appendChild(new FakeNode('td'));
      const labelCell = tr.appendChild(new FakeNode('td'));
      const link = labelCell.appendChild(new FakeNode('a'));
      const removeCell = tr.appendChild(new FakeNode('td'));
      removeCell.appendChild(new FakeNode('a'));
      tr.appendChild(new FakeNode('td'));
      idCell.textContent = row.id;
      effect(() => {
        link.textContent = row.label.get();
      });
      const $selected = isSelected(row.id);
      effect(() => {
        if ($selected.get()) tr.setAttribute('class', 'danger');
        else tr.removeAttribute('class');
      });
      return tr;
    });

    effect(() => {
      syncChildren(tbody, trs.get());
    });

    /** @param {number} n */
    const buildRows = (n) =>
      range(n).map(() => {
        const base = `${rand.pick(ADJECTIVES)} ${rand.pick(COLOURS)} ${rand.pick(NOUNS)}`;
        return { id: nextId++, base, label: signal(base) };
      });

    /** @param {Row[]} list */
    const set = (list) => {
      rows.set(list);
      tick();
      sink.value = tbody.children.length;
    };

    return { rows, selected, buildRows, set, tbody, rand, initial: [], flip: false };
  });
}

// ---------------------------------------------------------------------------------------
// Media player
// ---------------------------------------------------------------------------------------

/**
 * A Vidstack-shaped player: media state signals fan out to ~20 derived computeds (formatted
 * times, progress / buffered percentages, chapter, volume level, ...) and ~15 effects that write
 * attributes and text on the controls.
 *
 * @param {Lib} lib
 */
function mediaPlayer(lib) {
  const { signal, computed, effect } = lib;

  const player = new FakeNode('media-player');
  const el = (/** @type {string} */ tag) => player.appendChild(new FakeNode(tag));
  const timeSlider = el('media-time-slider');
  const timeFill = el('div');
  const bufferedFill = el('div');
  const chapterFill = el('div');
  const timeDisplay = el('media-time');
  const durationDisplay = el('media-time');
  const remainingDisplay = el('media-time');
  const chapterTitle = el('media-chapter-title');
  const playButton = el('media-play-button');
  const volumeSlider = el('media-volume-slider');
  const volumeIcon = el('media-icon');
  const rateDisplay = el('span');

  const chapters = range(10).map((i) => ({ start: i * 60, title: `Chapter ${i + 1}` }));

  /** @param {number} seconds */
  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return withRoot(lib, () => {
    const currentTime = signal(0);
    const duration = signal(600);
    const paused = signal(true);
    const volume = signal(1);
    const muted = signal(false);
    const buffered = signal(0);
    const playbackRate = signal(1);

    // derived state
    const currentSecond = computed(() => Math.floor(currentTime.get()));
    const formattedTime = computed(() => formatTime(currentSecond.get()));
    const formattedDuration = computed(() => formatTime(duration.get()));
    const progress = computed(() => (currentTime.get() / duration.get()) * 100);
    const progressStyle = computed(() => `--progress: ${progress.get().toFixed(3)}%`);
    const ariaValueNow = computed(() => Math.round(progress.get()));
    const ariaValueText = computed(() => `${formattedTime.get()} of ${formattedDuration.get()}`);
    const bufferedPercent = computed(() => (buffered.get() / duration.get()) * 100);
    const bufferedStyle = computed(() => `--buffered: ${bufferedPercent.get().toFixed(3)}%`);
    const remaining = computed(() => Math.max(0, duration.get() - currentTime.get()));
    const formattedRemaining = computed(() => `-${formatTime(Math.ceil(remaining.get()))}`);
    const chapterIndex = computed(() => {
      const t = currentTime.get();
      let i = chapters.length - 1;
      while (i > 0 && chapters[i].start > t) i--;
      return i;
    });
    const chapter = computed(() => chapters[chapterIndex.get()]);
    const chapterProgress = computed(() => {
      const i = chapterIndex.get();
      const start = chapters[i].start;
      const end = i + 1 < chapters.length ? chapters[i + 1].start : duration.get();
      return ((currentTime.get() - start) / (end - start)) * 100;
    });
    const chapterStyle = computed(() => `--chapter-progress: ${chapterProgress.get().toFixed(3)}%`);
    const canPlay = computed(() => duration.get() > 0);
    const ended = computed(() => currentTime.get() >= duration.get());
    const playing = computed(() => canPlay.get() && !paused.get() && !ended.get());
    const playLabel = computed(() => (paused.get() ? 'Play' : 'Pause'));
    const volumeLevel = computed(() => (muted.get() ? 0 : volume.get()));
    const volumePercent = computed(() => Math.round(volumeLevel.get() * 100));
    const volumeIconName = computed(() => {
      const level = volumeLevel.get();
      return level === 0 ? 'mute' : level < 0.5 ? 'volume-low' : 'volume-high';
    });
    const rateLabel = computed(() => `${playbackRate.get()}x`);

    // rendering
    effect(() => {
      timeSlider.setAttribute('value', progress.get());
    });
    effect(() => {
      timeSlider.setAttribute('aria-valuenow', ariaValueNow.get());
    });
    effect(() => {
      timeSlider.setAttribute('aria-valuetext', ariaValueText.get());
    });
    effect(() => {
      timeFill.setAttribute('style', progressStyle.get());
    });
    effect(() => {
      bufferedFill.setAttribute('style', bufferedStyle.get());
    });
    effect(() => {
      chapterFill.setAttribute('style', chapterStyle.get());
    });
    effect(() => {
      timeDisplay.textContent = formattedTime.get();
    });
    effect(() => {
      durationDisplay.textContent = formattedDuration.get();
    });
    effect(() => {
      remainingDisplay.textContent = formattedRemaining.get();
    });
    effect(() => {
      chapterTitle.textContent = chapter.get().title;
    });
    effect(() => {
      playButton.setAttribute('aria-label', playLabel.get());
    });
    effect(() => {
      if (playing.get()) player.setAttribute('data-playing', '');
      else player.removeAttribute('data-playing');
      if (paused.get()) player.setAttribute('data-paused', '');
      else player.removeAttribute('data-paused');
      if (ended.get()) player.setAttribute('data-ended', '');
      else player.removeAttribute('data-ended');
    });
    effect(() => {
      volumeSlider.setAttribute('value', volumePercent.get());
      volumeSlider.setAttribute('aria-valuetext', `${volumePercent.get()}%`);
    });
    effect(() => {
      volumeIcon.setAttribute('data-icon', volumeIconName.get());
    });
    effect(() => {
      rateDisplay.textContent = rateLabel.get();
    });

    return {
      currentTime,
      duration,
      paused,
      volume,
      muted,
      buffered,
      playbackRate,
      player,
      time: 0,
      seconds: 0,
    };
  });
}

/**
 * One second of playback: 60 `currentTime` frames (ticking after each), a buffer-progress update
 * every 10 frames, and the occasional volume / mute / rate / duration change. Playback loops back
 * to 0 at the end of the media so the state stays bounded across iterations.
 *
 * @param {Lib} lib
 * @param {ReturnType<typeof mediaPlayer>} ctx
 */
function playOneSecond(lib, ctx) {
  const { tick } = lib;
  const { currentTime, duration, paused, volume, muted, buffered, playbackRate } = ctx;
  const length = duration.peek();

  paused.set(false);
  tick();

  for (let frame = 0; frame < 60; frame++) {
    ctx.time += 1 / 60;
    if (ctx.time >= length) ctx.time = 0;
    currentTime.set(ctx.time);
    tick();
    if (frame % 10 === 9) {
      buffered.set(Math.min(length, ctx.time + 30));
      tick();
    }
  }

  const second = ++ctx.seconds;
  volume.set(second % 2 ? 0.5 : 1);
  tick();
  if (second % 5 === 0) {
    muted.set((v) => !v);
    tick();
  }
  if (second % 10 === 0) {
    playbackRate.set((r) => (r === 1 ? 1.5 : 1));
    tick();
  }
  // `durationchange` jitter: the formatted duration does not change, so only the percentages do
  duration.set(second % 2 ? 600.25 : 600);
  tick();

  paused.set(true);
  tick();

  sink.value = ctx.player.children.length;
}

// ---------------------------------------------------------------------------------------
// Component churn
// ---------------------------------------------------------------------------------------

/**
 * Route changes: an app root provides context; every iteration mounts `count` component roots
 * under it (3 signals, 2 computeds, 3 effects and a `getContext` read each; every other component
 * also renders a `computedKeyedMap` of `children` items) and then disposes them all again.
 *
 * @param {Lib} lib
 * @param {{ count: number, children: number }} size
 */
function componentChurn(lib, { count, children: childCount }) {
  const {
    signal,
    computed,
    effect,
    root,
    tick,
    getContext,
    setContext,
    getScope,
    scoped,
    onDispose,
    computedKeyedMap,
  } = lib;

  const container = new FakeNode('main');
  const items = range(childCount).map((id) => ({ id, name: `item ${id}` }));

  const app = root((dispose) => {
    setContext('theme', 'dark');
    return { scope: getScope(), dispose };
  });

  /** @param {number} index @returns {() => void} */
  function Component(index) {
    return root((dispose) => {
      const theme = getContext('theme');

      const el = new FakeNode('section');
      const title = new FakeNode('h2');
      container.appendChild(el);
      el.appendChild(title);
      onDispose(() => container.removeChild(el));

      const a = signal(index);
      const b = signal(1);
      const c = signal('idle');

      const sum = computed(() => a.get() + b.get());
      const label = computed(() => `${theme}: ${sum.get()}`);

      effect(() => {
        title.textContent = label.get();
      });
      effect(() => {
        el.setAttribute('data-state', c.get());
      });
      effect(() => {
        el.setAttribute('class', sum.get() % 2 ? `${theme} odd` : `${theme} even`);
      });

      if (index % 2 === 0) {
        const ul = el.appendChild(new FakeNode('ul'));
        const list = signal(items);
        const lis = computedKeyedMap(list, (item, $index) => {
          const li = new FakeNode('li');
          effect(() => {
            li.textContent = `${$index.get()}. ${item.name}`;
          });
          return li;
        });
        effect(() => {
          syncChildren(ul, lis.get());
        });
      }

      return dispose;
    });
  }

  return {
    run() {
      const disposers = scoped(() => range(count).map(Component), app.scope);
      tick();
      for (let i = 0; i < disposers.length; i++) disposers[i]();
      sink.value = container.children.length;
    },
    dispose: app.dispose,
  };
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

// ---------------------------------------------------------------------------------------
// Stateful scenarios (untimed setup, timed operation)
// ---------------------------------------------------------------------------------------

/**
 * A scenario whose state outlives the iteration: `create(lib)` builds it (untimed, `beforeAll`),
 * `run(lib, ctx)` is timed, `restore(lib, ctx)` (optional, untimed, `afterEach`) puts the state
 * back so every iteration starts from the same place, and `ctx.dispose()` tears it down. `check`
 * counts the fake-DOM mutations of one `run` against freshly created state.
 *
 * @template {{ dispose: () => void }} Ctx
 * @param {string} name
 * @param {object} spec
 * @param {(lib: Lib) => Ctx} spec.create
 * @param {(lib: Lib, ctx: Ctx) => void} spec.run
 * @param {(lib: Lib, ctx: Ctx) => void} [spec.restore]
 * @param {Record<string, unknown>} [options]
 */
function stateful(name, { create, run, restore }, options) {
  scenario(
    libs,
    name,
    (lib) => {
      /** @type {Ctx} */
      let ctx;
      return {
        beforeAll() {
          ctx = create(lib);
        },
        fn() {
          run(lib, ctx);
        },
        afterEach: restore ? () => restore(lib, ctx) : undefined,
        afterAll() {
          ctx.dispose();
        },
      };
    },
    {
      options,
      checkLabel: 'mutations',
      check(lib) {
        const ctx = create(lib);
        dom.mutations = 0;
        run(lib, ctx);
        const mutations = dom.mutations;
        ctx.dispose();
        return mutations;
      },
    },
  );
}

// js-framework-benchmark: every Krausest operation is its own row and leaves the table as it found
// it (the state is restored untimed, or the operation is its own inverse).
{
  const n = 1_000;
  const big = quick ? 2_500 : 10_000;
  // The cheap operations are repeated so an iteration is not dominated by timer noise.
  const updates = 50;
  const selects = 500;
  const swaps = 10;
  const removals = 10;

  /**
   * @param {string} name
   * @param {object} spec
   * @param {(ctx: JsFrameworkBenchmark) => void} [spec.initial]
   * @param {(lib: Lib, ctx: JsFrameworkBenchmark) => void} spec.run
   * @param {(ctx: JsFrameworkBenchmark) => void} [spec.restore]
   * @param {Record<string, unknown>} [options]
   */
  const operation = (name, { initial, run, restore }, options) =>
    stateful(
      `js-framework-benchmark: ${name}`,
      {
        create(lib) {
          const ctx = jsFrameworkBenchmark(lib);
          initial?.(ctx);
          return ctx;
        },
        run,
        restore: restore ? (_, ctx) => restore(ctx) : undefined,
      },
      options,
    );

  /** @param {JsFrameworkBenchmark} ctx */
  const withRows = (ctx) => ctx.set((ctx.initial = ctx.buildRows(n)));
  /** @param {JsFrameworkBenchmark} ctx */
  const restoreRows = (ctx) => ctx.set(ctx.initial);
  /** @param {JsFrameworkBenchmark} ctx */
  const clear = (ctx) => ctx.set([]);

  operation(`create ${n} rows`, {
    run: (_, ctx) => ctx.set(ctx.buildRows(n)),
    restore: clear,
  });

  operation(`replace all ${n} rows`, {
    initial: withRows,
    run: (_, ctx) => ctx.set(ctx.buildRows(n)),
  });

  operation(`partial update (every 10th of ${n} rows) x${updates}`, {
    initial: withRows,
    run(lib, ctx) {
      const list = ctx.rows.get();
      for (let u = 0; u < updates; u++) {
        // alternate between the base label and a suffixed one so the strings never grow
        ctx.flip = !ctx.flip;
        const suffix = ctx.flip ? ' !!!' : '';
        for (let i = 0; i < list.length; i += 10) {
          list[i].label.set(list[i].base + suffix);
          lib.tick();
        }
      }
    },
  });

  operation(`select row (${n} rows) x${selects}`, {
    initial: withRows,
    run(lib, ctx) {
      const list = ctx.rows.get();
      for (let i = 0; i < selects; i++) {
        ctx.selected.set(list[ctx.rand.int(list.length)].id);
        lib.tick();
      }
    },
  });

  operation(`swap rows 1 and ${n - 2} (${n} rows) x${swaps}`, {
    initial: withRows,
    run(_, ctx) {
      // an even number of swaps is its own inverse
      for (let i = 0; i < swaps; i++) {
        const next = ctx.rows.get().slice();
        const a = next[1];
        next[1] = next[n - 2];
        next[n - 2] = a;
        ctx.set(next);
      }
    },
  });

  operation(`remove one row (${n} rows) x${removals}`, {
    initial: withRows,
    run(_, ctx) {
      for (let i = 0; i < removals; i++) {
        const list = ctx.rows.get();
        const victim = list[ctx.rand.int(list.length)];
        ctx.set(list.filter((row) => row !== victim));
      }
    },
    restore: restoreRows,
  });

  operation(`create ${big} rows`, {
    run: (_, ctx) => ctx.set(ctx.buildRows(big)),
    restore: clear,
  });

  operation(`append ${n} rows to ${n}`, {
    initial: withRows,
    run: (_, ctx) => ctx.set(ctx.rows.get().concat(ctx.buildRows(n))),
    restore: restoreRows,
  });

  operation(`clear ${n} rows`, {
    initial: withRows,
    run: (_, ctx) => ctx.set([]),
    restore: restoreRows,
  });
}

{
  const seconds = quick ? 5 : 10;
  stateful(`media player (1s of playback @ 60fps, ~20 computeds, 15 effects) x${seconds}`, {
    create: mediaPlayer,
    run(lib, ctx) {
      for (let s = 0; s < seconds; s++) playOneSecond(lib, ctx);
    },
  });
}

{
  const count = 100;
  const children = 10;
  const reps = quick ? 2 : 4;
  stateful(
    `component churn (mount + dispose ${count} components, half with ${children} keyed children) x${reps}`,
    {
      create: (lib) => componentChurn(lib, { count, children }),
      run(_, ctx) {
        for (let r = 0; r < reps; r++) ctx.run();
      },
    },
  );
}
