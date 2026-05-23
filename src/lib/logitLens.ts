// Logit-lens extraction (Phase 3.3 panel data source).
//
// CAPABILITY NOTE: requires the residual stream at each transformer block,
// which is not exposed by the standard Xenova/gpt2 ONNX export. Unblock with
// a custom export that adds the 13 hidden-state tensors (embed + 12 blocks)
// as graph outputs, then apply `ln_f` followed by the unembedding for each
// layer ℓ to recover layer-wise top-3 predictions per position.
//
// Until that lands, this module returns an empty array and flags
// `hidden-states-unavailable`. The LayerPanel renders an explanation in lieu
// of synthetic data (anti-fabrication rule #1).

import type { LogitLensCell } from "../types";

export interface LogitLensExtractionResult {
  cells: LogitLensCell[];
  available: boolean;
}

export function extractLogitLens(_modelOutputs: unknown): LogitLensExtractionResult {
  return { cells: [], available: false };
}
