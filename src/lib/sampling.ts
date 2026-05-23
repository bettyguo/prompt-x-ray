// Top-k sampling at the position immediately after the prompt. The standard
// Xenova/gpt2 ONNX model exposes final-layer logits, so this panel produces
// real data without any custom export.

import type { PreTrainedTokenizer } from "@huggingface/transformers";
import type { SamplingCandidate } from "../types";

export interface LogitsLike {
  data: Float32Array | number[];
  dims: number[];
}

/**
 * Extract top-k candidates from logits at the *last* position of a [B, T, V]
 * tensor. Returns probabilities + log-probabilities, sorted by descending prob.
 */
export function topKFromFinalLogits(
  logits: LogitsLike,
  tokenizer: PreTrainedTokenizer,
  k = 10
): SamplingCandidate[] {
  if (logits.dims.length !== 3) {
    throw new Error(
      `Expected logits tensor of rank 3 [B, T, V]; got dims ${JSON.stringify(logits.dims)}`
    );
  }
  if (!(logits.data instanceof Float32Array)) {
    throw new Error(
      `Expected logits.data to be Float32Array; got ${Object.prototype.toString.call(logits.data)}`
    );
  }
  const [_b, seqLen, vocab] = logits.dims;
  if (seqLen === 0 || vocab === 0) {
    throw new Error(
      `Logits tensor has empty axis (seqLen=${seqLen}, vocab=${vocab})`
    );
  }
  const lastRowStart = (seqLen - 1) * vocab;
  const data = logits.data;

  // Stable softmax: subtract max before exp. Read directly from the source
  // Float32Array using `lastRowStart` rather than copying into a temporary
  // `row` — saves a 50 257 * 4 B = ~200 kB allocation on every analysis.
  let maxLogit = -Infinity;
  for (let i = 0; i < vocab; i++) {
    const v = data[lastRowStart + i];
    if (v > maxLogit) maxLogit = v;
  }

  // First pass: collect top-k by raw (logit - max). exp() is monotonic so
  // we can rank on logits and only call Math.exp() on the k winners. Avoids
  // 50 257 Math.exp() calls and a second Float32Array allocation.
  const top: { idx: number; logit: number }[] = [];
  for (let i = 0; i < vocab; i++) {
    const v = data[lastRowStart + i] - maxLogit;
    if (top.length < k) {
      top.push({ idx: i, logit: v });
      if (top.length === k) top.sort((a, b) => a.logit - b.logit);
    } else if (v > top[0].logit) {
      top[0] = { idx: i, logit: v };
      top.sort((a, b) => a.logit - b.logit);
    }
  }

  // Second pass over the *full* vocab: accumulate the softmax denominator.
  // O(V) Math.exp calls, but no allocations.
  let sum = 0;
  for (let i = 0; i < vocab; i++) {
    sum += Math.exp(data[lastRowStart + i] - maxLogit);
  }
  if (!(sum > 0) || !Number.isFinite(sum)) {
    throw new Error(
      `Softmax denominator is non-positive (sum=${sum}); logits underflowed.`
    );
  }

  // Convert top-k logits to probabilities, sort descending.
  const topProbs = top
    .map((t) => ({ idx: t.idx, prob: Math.exp(t.logit) / sum }))
    .sort((a, b) => b.prob - a.prob);

  return topProbs.map((t) => ({
    token: tokenizer.decode([t.idx], { skip_special_tokens: false }),
    prob: t.prob,
    logprob: Math.log(t.prob),
  }));
}
