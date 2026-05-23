// NOTE: alternate route to the ONNX export; pure-JS forward pass over safetensors. Not wired in v1 — see bench/phase-2.5.md.
// PHASE 2.5 SCAFFOLD — EXPERIMENTAL, UNVERIFIED. NOT WIRED INTO analyzePrompt().
//
// This file sketches the in-browser pure-JS GPT-2 small forward pass that
// would produce real attention weights and real intermediate hidden states
// (the two things the standard ONNX export hides). Shipping it for real
// requires:
//
//   1. A weight-loading path. Three options, in order of preference:
//      (a) Fetch a custom ONNX export of GPT-2 with `output_attentions` +
//          `output_hidden_states` baked in, and skip this file entirely.
//      (b) Parse the HuggingFace safetensors archive directly (the layout is
//          well documented; ~150 lines of JSON-header + Float32Array slicing).
//      (c) Use `@huggingface/transformers` to load the standard model and
//          read named tensors out of its session — only works if the lib
//          exposes them, which it currently does not for decoder-only graphs.
//
//   2. A correctness baseline. Compare against the reference HF Python
//      implementation for at least three prompts (IOI, factual recall,
//      induction) until top-1 next-token agrees and attention entropies
//      match within 1e-3 across all 144 heads. Until that bar is met, the
//      module stays exported but unused — better than shipping plausible-
//      looking but wrong numbers (anti-fabrication rule #1).
//
//   3. Performance. GPT-2 small at seq_len ≤ 64 should comfortably fit in
//      ~300ms on a 2024 laptop with naive Float32Array math and no SIMD.
//      For longer prompts, push to a Web Worker so the UI doesn't jank.
//
// The shapes and method names below are stable; only the bodies need to be
// filled in. Panels in the UI already render this data when present; once
// this module produces verified outputs, switch analyzePrompt to call it.

import type { HeadAttention, LogitLensCell, SamplingCandidate, TokenInfo } from "../types";

export interface Gpt2SmallConfig {
  vocab: 50257;
  contextLength: 1024;
  embedDim: 768;
  numLayers: 12;
  numHeads: 12;
  headDim: 64;
  layerNormEps: 1e-5;
  /** GPT-2 uses the OpenAI variant of GELU ("gelu_new"), not erf-GELU. */
  geluVariant: "gelu_new";
}

export const GPT2_SMALL: Gpt2SmallConfig = {
  vocab: 50257,
  contextLength: 1024,
  embedDim: 768,
  numLayers: 12,
  numHeads: 12,
  headDim: 64,
  layerNormEps: 1e-5,
  geluVariant: "gelu_new",
};

/**
 * Tensors needed to run the forward pass. Names follow HuggingFace's
 * `GPT2LMHeadModel` state_dict.
 *
 *  wte          [V, D]
 *  wpe          [C, D]
 *  h.{ℓ}.ln_1.weight  [D]      ln_1.bias [D]
 *  h.{ℓ}.attn.c_attn.weight [D, 3D]  c_attn.bias [3D]
 *  h.{ℓ}.attn.c_proj.weight [D, D]   c_proj.bias [D]
 *  h.{ℓ}.ln_2.weight  [D]      ln_2.bias [D]
 *  h.{ℓ}.mlp.c_fc.weight [D, 4D]    c_fc.bias [4D]
 *  h.{ℓ}.mlp.c_proj.weight [4D, D]  c_proj.bias [D]
 *  ln_f.weight  [D]            ln_f.bias [D]
 *  lm_head      tied to wte
 */
export interface Gpt2Weights {
  wte: Float32Array;
  wpe: Float32Array;
  blocks: Gpt2BlockWeights[];
  ln_f_weight: Float32Array;
  ln_f_bias: Float32Array;
}

export interface Gpt2BlockWeights {
  ln1_weight: Float32Array; ln1_bias: Float32Array;
  cattn_weight: Float32Array; cattn_bias: Float32Array;
  cproj_weight: Float32Array; cproj_bias: Float32Array;
  ln2_weight: Float32Array; ln2_bias: Float32Array;
  mlp_fc_weight: Float32Array; mlp_fc_bias: Float32Array;
  mlp_proj_weight: Float32Array; mlp_proj_bias: Float32Array;
}

export interface ForwardPassResult {
  /** [layer][head] attention with weights, entropy, interesting flag. */
  attention: HeadAttention[][];
  /** Flat list of (layer, position, top-3) cells for the logit-lens panel. */
  logit_lens: LogitLensCell[];
  /** Top-k candidates at the last position. */
  sampling: SamplingCandidate[];
}

export interface ForwardPassInput {
  tokens: TokenInfo[];
  inputIds: number[];
}

/**
 * EXPERIMENTAL. Runs the full forward pass and returns per-layer attentions
 * + logit-lens cells + sampling. Throws until a numerical baseline has been
 * verified — we'd rather show "awaiting Phase 2.5" than wrong numbers.
 */
export function runForwardPass(
  _weights: Gpt2Weights,
  _input: ForwardPassInput,
  _topKLens = 3,
  _topKSample = 10
): ForwardPassResult {
  throw new Error(
    "forwardPass.experimental: pure-JS forward pass not yet verified. " +
    "See file header for the path to enabling it."
  );
}

// ── Math primitives that the eventual implementation will use ──────────────
// Exported so they can be unit-tested in isolation against reference values.

/** LayerNorm along the last dimension. Operates in-place on `out`. */
export function layerNorm(
  x: Float32Array,
  gamma: Float32Array,
  beta: Float32Array,
  eps: number,
  out: Float32Array
): Float32Array {
  const d = gamma.length;
  const n = x.length / d;
  for (let i = 0; i < n; i++) {
    const off = i * d;
    let mean = 0;
    for (let j = 0; j < d; j++) mean += x[off + j];
    mean /= d;
    let v = 0;
    for (let j = 0; j < d; j++) {
      const c = x[off + j] - mean;
      v += c * c;
    }
    v /= d;
    const inv = 1 / Math.sqrt(v + eps);
    for (let j = 0; j < d; j++) {
      out[off + j] = (x[off + j] - mean) * inv * gamma[j] + beta[j];
    }
  }
  return out;
}

/** GPT-2's gelu_new: 0.5·x·(1 + tanh(√(2/π)·(x + 0.044715·x³))). */
export function geluNew(x: Float32Array, out: Float32Array): Float32Array {
  const k = Math.sqrt(2 / Math.PI);
  for (let i = 0; i < x.length; i++) {
    const v = x[i];
    out[i] = 0.5 * v * (1 + Math.tanh(k * (v + 0.044715 * v * v * v)));
  }
  return out;
}

/** Row-wise softmax with a causal mask (positions j > i set to -inf). */
export function causalSoftmax(scores: Float32Array, seqLen: number): Float32Array {
  for (let i = 0; i < seqLen; i++) {
    const off = i * seqLen;
    let maxV = -Infinity;
    for (let j = 0; j <= i; j++) if (scores[off + j] > maxV) maxV = scores[off + j];
    let sum = 0;
    for (let j = 0; j < seqLen; j++) {
      if (j > i) {
        scores[off + j] = 0;
      } else {
        const e = Math.exp(scores[off + j] - maxV);
        scores[off + j] = e;
        sum += e;
      }
    }
    for (let j = 0; j <= i; j++) scores[off + j] /= sum;
  }
  return scores;
}

/** Row entropy in nats, averaged across rows. Used for "interesting head" flagging. */
export function meanRowEntropy(weights: number[][]): number {
  let total = 0;
  let rows = 0;
  for (const row of weights) {
    let h = 0;
    for (const w of row) if (w > 0) h -= w * Math.log(w);
    total += h;
    rows++;
  }
  return rows ? total / rows : 0;
}
