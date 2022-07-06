export type ScheduledTask = () => void;
export type Unsubscribe = () => void;

export type Scheduler = {
  tick: Promise<void>;
  enqueue: (task: ScheduledTask) => void;
  served: (task: ScheduledTask) => boolean;
  flush: () => void;
  syncFlush: () => void;
  onFlush: (callback: () => void) => Unsubscribe;
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
 * // Wait for flush to complete.
 * await scheduler.tick;
 * ```
 */
export function createScheduler(): Scheduler {
  const served = new Set<ScheduledTask>();
  const queue = new Set<ScheduledTask>();
  const microtask = Promise.resolve();
  const callbacks = new Set<() => void>();
  const queueTask = typeof queueMicrotask !== 'undefined' ? queueMicrotask : microtask.then;

  function enqueue(task: ScheduledTask) {
    // `processed` is only populated during a flush.
    if (!served.has(task)) queue.add(task);
    scheduleFlush();
  }

  let flushing = false;
  function scheduleFlush() {
    if (!flushing) {
      flushing = true;
      queueTask(flush);
    }
  }

  function flush() {
    do {
      for (const task of queue) {
        task();
        served.add(task);
        queue.delete(task);
      }
    } while (queue.size > 0);

    served.clear();
    flushing = false;

    for (const callback of callbacks) callback();
  }

  return {
    enqueue,
    served: (task) => served.has(task),
    flush: scheduleFlush,
    syncFlush: flush,
    tick: microtask,
    onFlush: (callback) => {
      callbacks.add(callback);
      return () => callbacks.delete(callback);
    },
  };
}
