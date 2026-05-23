// Shared types for the analysis pipeline. Mirrors §4.1 of the master prompt,
// with small extensions for the cross-panel highlight axis and the residual
// stack we need internally for the logit-lens. The wire/storage format is the
// `PromptAnalysis` here; everything in `lib/` produces or consumes it.

export type SurprisingReason =
  | "midword-split"
  | "low-frequency"
  | "byte-fallback"
  | "uncommon-punctuation";

export interface TokenInfo {
  id: number;
  /** Display text with leading-space marker normalized for rendering. */
  text: string;
  /** Raw text including the ▁/Ġ marker if present. */
  raw: string;
  /** Inclusive char offsets back into the original prompt. */
  charStart: number;
  charEnd: number;
  /** Raw GPT-2 vocab id (≈ frequency-ordered but not strictly so — used as
   *  the "rarity shade" hint only). */
  vocabId: number;
  surprising_boundary: boolean;
  surprising_reasons: SurprisingReason[];
}

export type InterestingReason =
  | "low-entropy"
  | "previous-token"
  | "bos-attractor"
  | "delimiter-attractor";

export interface HeadAttention {
  layer: number;
  head: number;
  /** [seq_len × seq_len] row-stochastic attention weights. */
  weights: number[][];
  /** Mean attention entropy across rows (nats). */
  entropy: number;
  interesting: boolean;
  interesting_reasons: InterestingReason[];
}

export interface LogitLensCell {
  layer: number;
  position: number;
  top_predictions: { token: string; prob: number }[];
  /** Probability of the actually-predicted next-token (argmax of final layer at this position). */
  final_token_prob: number;
}

export interface SamplingCandidate {
  token: string;
  /** Probability after softmax. */
  prob: number;
  /** Natural-log probability. */
  logprob: number;
}

export type AnalysisWarning =
  | "attentions-unavailable"
  | "hidden-states-unavailable";

export interface PromptAnalysis {
  prompt: string;
  /** Model id; v1 is always "gpt2". */
  model: string;
  /** ms taken for the forward pass + analysis on the producing machine. */
  computeMs: number;
  /** True when this analysis came from IndexedDB rather than a fresh compute.
   *  Used to label the "analyzed in N ms" pill honestly — a 2 ms cache hit
   *  next to a 1.4 s original compute would otherwise mislead. */
  fromCache?: boolean;
  tokens: TokenInfo[];
  /** Empty when the underlying ONNX export does not expose attention weights. */
  attention: HeadAttention[][];
  /** Empty when the underlying ONNX export does not expose intermediate hidden states. */
  logit_lens: LogitLensCell[];
  sampling: SamplingCandidate[];
  /** Non-fatal capability gaps; panels render an explanation when their data is missing. */
  warnings: AnalysisWarning[];
}

/** UI state for cross-panel highlight axis. */
export interface AxisSelection {
  /** Selected token position (sticky on click). */
  position: number | null;
  /** Hovered token position (transient). */
  hover: number | null;
}
