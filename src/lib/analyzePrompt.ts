// The unified analysis function — see §4.1 of the master prompt.
//
// Phase 2 implementation status:
//   - Tokenizer panel data: REAL (BPE tokens + char spans + surprising-boundary flags)
//   - Sampling panel data:  REAL (top-k from final-position logits via the model forward pass)
//   - Attention panel data: AWAITS Phase 2.5 (needs a custom ONNX export — see lib/attentionExtract.ts)
//   - Logit-lens panel data: AWAITS Phase 2.5 (needs hidden-states output — see lib/logitLens.ts)
//
// Panels with unavailable data render an honest "not yet wired" state, never
// synthetic data (anti-fabrication rule #1).

import type { AnalysisWarning, PromptAnalysis } from "../types";
import { tokenizePrompt } from "./tokenizer";
import { topKFromFinalLogits } from "./sampling";
import { extractAttention } from "./attentionExtract";
import { extractLogitLens } from "./logitLens";
import { getCached, putCached } from "./cache";

// `@huggingface/transformers` and the `modelLoader` that wraps it are
// dynamically imported below so they don't land in the main JS chunk. The
// Analyze button is the only entry that needs them, so first paint and warm
// reloads don't pay the ~800 kB transformers-chunk parse cost.

export interface AnalyzeOptions {
  /** If true, skip the IndexedDB cache. */
  bypassCache?: boolean;
  /** Optional progress callback for the long phases. */
  onProgress?: (msg: string, pct: number) => void;
  /** AbortSignal for cancellation. */
  signal?: AbortSignal;
}

/** Race a promise against an AbortSignal. Resolves with the original promise's
 *  result unless the signal aborts first, in which case rejects with AbortError. */
function withAbort<T>(p: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return p;
  if (signal.aborted) {
    return Promise.reject(new DOMException("Aborted", "AbortError"));
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new DOMException("Aborted", "AbortError"));
    signal.addEventListener("abort", onAbort, { once: true });
    p.then(
      (v) => {
        signal.removeEventListener("abort", onAbort);
        resolve(v);
      },
      (e) => {
        signal.removeEventListener("abort", onAbort);
        reject(e);
      }
    );
  });
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
}

export async function analyzePrompt(
  text: string,
  opts: AnalyzeOptions = {}
): Promise<PromptAnalysis> {
  const { onProgress, signal } = opts;
  const t0 = performance.now();

  onProgress?.("Checking cache…", 1);
  if (!opts.bypassCache) {
    const cached = await withAbort(getCached(text), signal);
    if (cached) {
      onProgress?.("Loaded cached analysis", 100);
      return { ...cached, fromCache: true };
    }
  }

  throwIfAborted(signal);

  onProgress?.("Loading model…", 5);
  // Both imports resolve from the same already-fetched `transformers` chunk
  // after the first call, so parallelising via Promise.all keeps the
  // microtask hop count down without an extra network round-trip.
  const [{ getModel }, { Tensor }] = await withAbort(
    Promise.all([import("./modelLoader"), import("@huggingface/transformers")]),
    signal
  );
  throwIfAborted(signal);
  const { tokenizer, model } = await withAbort(getModel(), signal);
  throwIfAborted(signal);

  onProgress?.("Tokenizing…", 20);
  const { ids, tokens } = tokenizePrompt(tokenizer, text);
  throwIfAborted(signal);

  if (ids.length === 0) {
    throw new Error("Tokenizer produced no tokens. Try a different prompt.");
  }
  if (ids.length > 256) {
    throw new Error(
      `Prompt is too long for v1 (${ids.length} tokens; max 256). Shorten it and try again.`
    );
  }

  onProgress?.("Running forward pass…", 40);
  // Build the input tensor directly from the ids we already have so we don't
  // run the tokenizer twice.
  const inputIds = new Tensor(
    "int64",
    BigInt64Array.from(ids.map((n) => BigInt(n))),
    [1, ids.length]
  );
  const attentionMask = new Tensor(
    "int64",
    BigInt64Array.from(ids.map(() => 1n)),
    [1, ids.length]
  );
  const inputs = { input_ids: inputIds, attention_mask: attentionMask };

  // The standard ONNX export emits `logits`. Attentions/hidden states are not
  // exposed; the corresponding extractors return empty + a warning.
  // TODO(phase-2.5): once `scripts/export-gpt2.py` is verified and the new
  // graph is loaded by `modelLoader.ts`, this call will surface
  // `attn_layer_NN` and `hidden_NN` outputs that the extractors below can
  // parse. See `bench/phase-2.5.md` for the contract + verification plan.
  // Cast to `any` because the model wrapper's call signature is typed loosely
  // and the dynamic output shape is what we actually depend on.
  const outputs: { logits?: { data: Float32Array | number[]; dims: number[] } } =
    await withAbort((model as unknown as (i: typeof inputs) => Promise<{
      logits?: { data: Float32Array | number[]; dims: number[] };
    }>)(inputs), signal);
  if (!outputs?.logits) {
    throw new Error(
      "Model forward pass did not return logits. The ONNX export may be incompatible."
    );
  }

  onProgress?.("Extracting top-k…", 70);
  const sampling = topKFromFinalLogits(outputs.logits, tokenizer, 10);

  const att = extractAttention(outputs);
  const ll = extractLogitLens(outputs);
  const warnings: AnalysisWarning[] = [];
  if (!att.available) warnings.push("attentions-unavailable");
  if (!ll.available) warnings.push("hidden-states-unavailable");

  const computeMs = Math.round(performance.now() - t0);
  const analysis: PromptAnalysis = {
    prompt: text,
    model: "gpt2",
    computeMs,
    tokens,
    attention: att.attention,
    logit_lens: ll.cells,
    sampling,
    warnings,
  };

  onProgress?.("Caching…", 95);
  // Cache best-effort; quota/state errors shouldn't block the user, but log
  // anything else so we don't silently lose persistence bugs.
  void putCached(text, analysis).catch((err: unknown) => {
    const name = (err as { name?: string } | undefined)?.name;
    if (name !== "QuotaExceededError" && name !== "InvalidStateError") {
      console.warn("cache put failed:", err);
    }
  });

  onProgress?.("Done", 100);
  return analysis;
}
