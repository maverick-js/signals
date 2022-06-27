export type ScheduledTask = () => void;
export type SchedulerFlushed = () => void;

export type Scheduler = {
  enqueue: (task: ScheduledTask) => void;
  served: (task: ScheduledTask) => boolean;
  flush: () => void;
  tick: Promise<void>;
};

/**
 * Creates a scheduler which batches tasks and runs them in the microtask queue.
 *
 * @param onFlush - callback is invoked each time the queue is flushed.
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
export function createScheduler(onFlush?: SchedulerFlushed): Scheduler {
  const processed = new Set<ScheduledTask>();
  const queue = new Set<ScheduledTask>();
  const microtask = Promise.resolve();
  const queueTask = typeof queueMicrotask !== 'undefined' ? queueMicrotask : microtask.then;

  function enqueue(task: ScheduledTask) {
    // `processed` is only populated during a flush.
    if (!processed.has(task)) queue.add(task);
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
        processed.add(task);
        queue.delete(task);
      }
    } while (queue.size > 0);

    processed.clear();
    flushing = false;
    onFlush?.();
  }

  return {
    enqueue,
    served: (task) => processed.has(task),
    flush: scheduleFlush,
    tick: microtask,
  };
}
