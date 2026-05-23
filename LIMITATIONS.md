# Limitations

prompt-x-ray runs entirely in the browser using `@huggingface/transformers` to drive an ONNX-exported GPT-2 small. That choice has consequences. This document is the authoritative list.

## Current (v1)

### Attention panel and Logit-lens panel are gated behind Phase 2.5

The default ONNX export of GPT-2 (`Xenova/gpt2`) emits only the final `logits` tensor — it does not expose intermediate residual states or per-head attention probabilities as graph outputs. Without those, real values for the Attention and Layer panels are not available.

Anti-fabrication rule #1 of the master prompt forbids showing synthetic data, so those panels render a "Not yet available" capability note in place of placeholder numbers.

**Phase 2.5 plan.** Two routes; we'll ship whichever lands first:
1. **Custom ONNX export** of GPT-2 with `output_attentions=True` and `output_hidden_states=True` baked in. The export script is committed at [`scripts/export-gpt2.py`](scripts/export-gpt2.py); the full verification + wiring plan lives in [`bench/phase-2.5.md`](bench/phase-2.5.md). Drop-in replacement; no code changes downstream of `modelLoader.ts`.
2. **Pure-JS forward pass** over safetensors weights. Scaffolded at [src/lib/forwardPass.experimental.ts](src/lib/forwardPass.experimental.ts); requires numerical verification against the HF Python reference before enabling.

### GPT-2 small only

Hard rule from the master prompt. Multi-model and larger-model support is a v2 feature.

### Prompt length capped at 256 tokens

GPT-2's context window is 1024, but in-browser memory + render time for the layer panel scales O(layers × positions × top-k). The 256-token cap is the headroom we left for the 3-second analysis target on a 2024 laptop; the matching benchmark lands in Phase 4.

### URL share length capped at ~4500 bytes

Encoded as URL-safe base64 in `?prompt=<>`. Longer prompts can be analyzed locally but can't be shared as a single link (the textarea has no limit; only the share button refuses).

### Frequency-rank ≈ token id

The "rarity" shade on tokenizer chips uses GPT-2's vocab id directly as a proxy for frequency. The GPT-2 vocab is *approximately* frequency-ordered but not strictly so — common contractions and capitalization variants can land at unintuitive ranks. The shade is a hint, not a measurement.

### Sampling is greedy-only

We surface top-10 probabilities at the position immediately after the prompt. There is no temperature, top-p, or repetition-penalty exploration in v1 — the panel is "what would the model say next, ranked," not "what would it generate over many steps."

## Roadmap (post-v1)

- Multi-model: GPT-2 medium/large in browsers with enough RAM, optional server-side fallback for 1B+.
- MLP-level interpretability (currently rejected per master prompt §5.4).
- Diff-two-prompts view (currently rejected per master prompt §5.5).
- SAE feature panel as a fifth panel, populated from [nano-sae].
- Live-as-you-type mode, gated by a perf budget.

If any of these matter to you, the issue tracker is the right place to push priority.
