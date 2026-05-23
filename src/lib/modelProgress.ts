// Lightweight pub/sub for model-load progress events.
//
// Lives in its own module so consumers like `ModelStatus` (which only needs
// to *display* progress) don't transitively pull `@huggingface/transformers`
// into the main bundle chunk. The heavy `modelLoader.ts` imports
// `emitProgress` from here when it actually starts loading.

export type LoadProgress =
  | { stage: "idle" }
  | { stage: "downloading"; file: string; pct: number }
  | { stage: "initializing" }
  | { stage: "ready" }
  | { stage: "error"; message: string };

const progressListeners = new Set<(p: LoadProgress) => void>();
let lastProgress: LoadProgress = { stage: "idle" };

export function emitProgress(p: LoadProgress): void {
  lastProgress = p;
  for (const l of progressListeners) l(p);
}

export function onLoadProgress(cb: (p: LoadProgress) => void): () => void {
  progressListeners.add(cb);
  // Defer the initial replay until after the subscriber has finished wiring
  // up, so React useEffect setup that calls setState in `cb` can't fire
  // re-entrantly during render.
  const snapshot = lastProgress;
  queueMicrotask(() => {
    if (progressListeners.has(cb)) cb(snapshot);
  });
  return () => {
    progressListeners.delete(cb);
  };
}
