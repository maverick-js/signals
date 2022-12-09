export type ScheduledTask = () => void;
export type StopFlushUpdates = () => void;

export type Scheduler = {
  enqueue: (task: ScheduledTask) => void;
  flush: () => void;
  flushSync: () => void;
  onBeforeFlush: (callback: () => void) => StopFlushUpdates;
  onFlush: (callback: () => void) => StopFlushUpdates;
};

/**
 * Creates a scheduler which batches tasks and runs them in the microtask queue.
 *
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/HTML_DOM_API/Microtask_guide}
 * @example
 * ```ts
 * const scheduler = createScheduler();
 *
 * // Queue tasks.
 * scheduler.enqueue(() => {});
 * scheduler.enqueue(() => {});
 *
 * // Schedule a flush - can be invoked more than once.
 * scheduler.flush();
 *
 * // Run a synchronous flush.
 * await scheduler.flushSync();
 * ```
 */
export function createScheduler(): Scheduler {
  let i = 0,
    j = 0,
    flushing = false,
    tasks: ScheduledTask[] = [],
    beforeTasks: (() => void)[] = [],
    afterTasks: (() => void)[] = [];

  function enqueue(task: ScheduledTask) {
    tasks.push(task);
    if (!flushing) scheduleFlush();
  }

  function scheduleFlush() {
    if (!flushing) {
      flushing = true;
      queueMicrotask(flush);
    }
  }

  function runTasks(start = 0) {
    for (i = start; i < tasks.length; i++) tasks[i]();
    if (tasks.length > start) runTasks(i);
  }

  function flush() {
    try {
      for (j = 0; j < beforeTasks.length; j++) beforeTasks[j]();
      runTasks();
      for (j = 0; j < afterTasks.length; j++) afterTasks[j]();
    } finally {
      tasks = tasks.slice(i);
      i = 0;
      flushing = false;
    }
  }

  return {
    enqueue,
    flush: scheduleFlush,
    flushSync: flush,
    onBeforeFlush: hook(beforeTasks),
    onFlush: hook(afterTasks),
  };
}

function hook(callbacks: (() => void)[]) {
  return function removeFlushHook(callback: () => void) {
    callbacks.push(callback);
    return () => callbacks.splice(callbacks.indexOf(callback), 1);
  };
}
