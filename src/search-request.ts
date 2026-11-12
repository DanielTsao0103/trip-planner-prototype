/** Bound each provider independently so an optional lookup cannot consume the whole search. */
export async function searchRequest<T>(
  run: (signal: AbortSignal) => Promise<T>,
  parent: AbortSignal,
  milliseconds: number,
): Promise<T> {
  parent.throwIfAborted();
  const controller = new AbortController();
  const cancel = () => controller.abort(parent.reason);
  parent.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException('Search timed out', 'TimeoutError')), milliseconds);
  let rejectAbort: () => void = () => {};
  try {
    return await Promise.race([
      Promise.resolve().then(() => { controller.signal.throwIfAborted(); return run(controller.signal); }),
      new Promise<never>((_, reject) => {
        rejectAbort = () => reject(controller.signal.reason);
        controller.signal.addEventListener('abort', rejectAbort, { once: true });
      }),
    ]);
  } finally {
    clearTimeout(timer);
    parent.removeEventListener('abort', cancel);
    controller.signal.removeEventListener('abort', rejectAbort);
    controller.abort();
  }
}
