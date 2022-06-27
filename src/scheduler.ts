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
export function createScheduler(onFlush?: () => void) {
  const seen = new Set<() => void>();
  const queue = new Set<() => void>();
  const microtask = Promise.resolve();
  const queueTask = typeof queueMicrotask !== 'undefined' ? queueMicrotask : microtask.then;

  function enqueue(task: () => void) {
    // `seen` is only populated during a flush.
    if (!seen.has(task)) queue.add(task);
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
        seen.add(task);
        queue.delete(task);
      }
    } while (queue.size > 0);

    seen.clear();
    flushing = false;
    onFlush?.();
  }

  return { seen, enqueue, flush: scheduleFlush, tick: microtask };
}
