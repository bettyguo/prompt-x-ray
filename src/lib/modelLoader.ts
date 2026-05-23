// In-browser GPT-2 small loader using @huggingface/transformers (transformers.js).
//
// Hard rule #1 from the master prompt: in-browser inference only. We never
// send the prompt off-device. The model weights are fetched from the HF CDN
// the first time and cached by the browser. We expose a singleton accessor
// so the rest of the app can `await getModel()` without worrying about
// duplicate loads (StrictMode double-effects, multiple panels, etc.).

import {
  AutoTokenizer,
  AutoModelForCausalLM,
  env,
  type PreTrainedTokenizer,
  type PreTrainedModel,
} from "@huggingface/transformers";
import { emitProgress } from "./modelProgress";

// Re-export the lightweight progress API for callers that already import it
// from here. ModelStatus has been migrated to import from `modelProgress`
// directly so it doesn't drag in `@huggingface/transformers`.
export { onLoadProgress, type LoadProgress } from "./modelProgress";

// Use the WASM/WebGPU runtime that ships with transformers.js, not a local
// /models directory. Keeps `npm run build` self-contained.
env.allowLocalModels = false;
env.allowRemoteModels = true;

export interface ModelBundle {
  tokenizer: PreTrainedTokenizer;
  model: PreTrainedModel;
  /** Model id this bundle was loaded for; always "gpt2" in v1. */
  id: string;
  /** Number of transformer layers; 12 for GPT-2 small. */
  numLayers: number;
  /** Number of attention heads per layer; 12 for GPT-2 small. */
  numHeads: number;
}

// TODO(phase-2.5): swap to a custom-export Hub repo that emits attention +
// hidden-state tensors as named outputs. The export script lives at
// `scripts/export-gpt2.py`; see `bench/phase-2.5.md` for the wiring plan and
// the verification contract that must pass before this constant changes.
const MODEL_ID = "Xenova/gpt2";

let bundlePromise: Promise<ModelBundle> | null = null;
let currentAttempt = 0;

export function getModel(): Promise<ModelBundle> {
  if (bundlePromise) return bundlePromise;
  const attempt = ++currentAttempt;
  bundlePromise = loadModel(attempt);
  return bundlePromise;
}

async function loadModel(attempt: number): Promise<ModelBundle> {
  try {
    emitProgress({ stage: "downloading", file: "tokenizer", pct: 0 });

    const progressCallback = (info: {
      status: string;
      file?: string;
      progress?: number;
    }) => {
      if (info.status === "progress" && info.file && typeof info.progress === "number") {
        emitProgress({ stage: "downloading", file: info.file, pct: info.progress });
      } else if (info.status === "ready") {
        emitProgress({ stage: "initializing" });
      }
    };

    const tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID, {
      progress_callback: progressCallback,
    });

    const model = await AutoModelForCausalLM.from_pretrained(MODEL_ID, {
      progress_callback: progressCallback,
      // GPT-2 small is small enough that fp32 is fine on most devices.
      dtype: "fp32",
    });

    // GPT-2 small constants — these aren't always plumbed onto the JS config,
    // so we encode them. We only support gpt2 small in v1.
    const numLayers = 12;
    const numHeads = 12;

    emitProgress({ stage: "ready" });
    return { tokenizer, model, id: MODEL_ID, numLayers, numHeads };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    emitProgress({ stage: "error", message: msg });
    // Only clear the singleton if no newer load attempt has been kicked off
    // in the meantime; otherwise we'd race the next caller. We also clear
    // after a microtask so any concurrent `getModel()` callers awaiting this
    // exact promise see the rejection rather than a stale fresh promise.
    queueMicrotask(() => {
      if (currentAttempt === attempt) bundlePromise = null;
    });
    throw e;
  }
}
