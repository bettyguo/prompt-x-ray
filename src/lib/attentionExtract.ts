// Attention extraction (Phase 3.2 panel data source).
//
// CAPABILITY NOTE: the standard Xenova/gpt2 ONNX export does not emit
// attention weights as graph outputs. Reading them in-browser requires either
// (a) a custom ONNX re-export of GPT-2 with `output_attentions=True` baked in,
// or (b) operating below the ONNX graph and computing attention from QKV
// projections ourselves.
//
// Both are tracked as Phase 2.5 work. Until that lands, this module returns
// an empty 12×12 grid and flags `attentions-unavailable` so the panel can
// surface the limitation honestly (anti-fabrication rule #1).

import type { HeadAttention } from "../types";

export interface AttentionExtractionResult {
  /** Layer-major: attention[layer][head]. Empty array if unavailable. */
  attention: HeadAttention[][];
  available: boolean;
}

export function extractAttention(_modelOutputs: unknown): AttentionExtractionResult {
  return { attention: [], available: false };
}
