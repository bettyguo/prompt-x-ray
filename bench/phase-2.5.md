# Phase 2.5 — Real Attention & Hidden States

**Status:** Export script committed; numerical verification pending. App still
renders capability notes in the Attention and Logit-lens panels (anti-
fabrication rule #1).

## Why this phase exists

The standard `Xenova/gpt2` ONNX export emits a single `logits` output. Two of
the four panels in prompt-x-ray need more:

| Panel        | Data required                                        | Available from `Xenova/gpt2`? |
| ------------ | ---------------------------------------------------- | ----------------------------- |
| Tokenizer    | BPE token ids + char spans                           | Yes (via tokenizer)           |
| Sampling     | Final-position logits                                | Yes                           |
| Attention    | Per-layer per-head attention weights `[L, H, T, T]`  | **No**                        |
| Logit-lens   | Hidden states at each block `[L+1, T, D]`            | **No**                        |

The HuggingFace PyTorch model can emit both via `output_attentions=True` and
`output_hidden_states=True`, but those flags are stripped by the default ONNX
conversion path because they aren't part of the model's standard forward
signature returned from `CausalLMOutputWithCrossAttentions`.

## What `scripts/export-gpt2.py` does

1. Loads `gpt2` (small) from HuggingFace with PyTorch.
2. Wraps it in `GPT2WithInternals(nn.Module)` whose `forward` returns a flat
   tuple:
   ```
   (logits,
    attn_layer_00, ..., attn_layer_11,           # 12 tensors [B, H, T, T]
    hidden_00, ..., hidden_12)                   # 13 tensors [B, T, D]
   ```
   ONNX's tracer only records tensors that flow through `forward`'s return, so
   the wrapper is what makes them graph outputs rather than discarded
   intermediates.
3. Calls `torch.onnx.export` with `dynamic_axes` set so the sequence dimension
   stays flexible at inference time.
4. Writes `model.onnx` plus the matching tokenizer + config so the bundle is
   transformers.js-loadable as a single HF Hub repo.

### Expected output shapes (contract)

For an input `[B, T]`:

- `logits` — `[B, T, 50257]`
- `attn_layer_NN` (N ∈ 0..11) — `[B, 12, T, T]`, post-softmax causal attention
- `hidden_NN` (N ∈ 0..12) —  `[B, T, 768]`
  - `hidden_00` is the residual stream right after the token+positional embedding sum.
  - `hidden_12` is the residual stream entering `ln_f`. The post-`ln_f` state
    used by the unembedding is the implicit "layer 13" reachable by applying
    `ln_f` then the embedding tied unembed to `hidden_12`.

## Verification plan (must pass before wiring into the app)

We compare the ONNX graph against the HF PyTorch reference for three
canonical prompts:

| Prompt                                                  | Why                                                                 |
| ------------------------------------------------------- | ------------------------------------------------------------------- |
| `John and Mary went to the shop. John gave Mary a`      | IOI — non-trivial attention pattern, easy top-1 sanity              |
| `The capital of France is`                              | Factual recall — final-layer logit-lens should sharpen to ` Paris`  |
| `A B C D A B C`                                         | Induction — heads 5.1 / 6.9 should display the classic offset spike |

For each prompt, the following must hold:

1. **Top-1 next-token agreement.** `argmax(logits[0, -1])` from ONNX equals
   the HF PyTorch top-1. Required exact match (not approximate).
2. **Per-head attention entropy within 1e-3** of the PyTorch reference, across
   all 144 heads. Entropy is in nats, computed on the row at the final query
   position only.
3. **Logit-lens top-1 at final layer matches sampling top-1.** Apply `ln_f`
   then the embedding-tied unembed to `hidden_12[:, -1]` and confirm argmax
   matches `argmax(logits[0, -1])`. (This catches off-by-one mistakes in the
   hidden-state index — a common bug; e.g. did we capture pre- or post-ln?)
4. **Spot check intermediate logit-lens top-1.** At layer 6, the top-1 for the
   factual-recall prompt should not yet be ` Paris` — it usually surfaces in
   the last 2-3 layers. The exact layer is observation, not a hard test; what
   we test is that intermediate ≠ final on at least one prompt, proving the
   hidden states aren't all collapsed to the final-layer value.

A small `verify.py` companion (not yet written) should produce a table:

```
prompt                       top1_match   max_head_entropy_err   ll_final_match
"John and Mary..."           PASS         3.1e-4                 PASS
"The capital of France..."   PASS         2.7e-4                 PASS
"A B C D A B C"              PASS         5.9e-4                 PASS
```

Anything failing means the wiring is wrong, not the script — the script is
just plumbing PyTorch internals through to ONNX, so failures are most likely
in our consumer code (axis order, fp32 vs fp16 cast, wrong layer index).

## Wiring plan (after verification passes)

1. Upload `model.onnx` + tokenizer files to an HF Hub repo, e.g.
   `<owner>/gpt2-attn-hidden-onnx`. **The binary is NOT committed to this
   repo** — it's ~500 MB and would balloon clone times.
2. In `src/lib/modelLoader.ts`, change `MODEL_ID` to that repo and set
   `dtype: "fp32"`. transformers.js should pick up the new named outputs
   automatically because they're declared via ONNX `output_names`.
3. Replace the body of `src/lib/attentionExtract.ts` so it pulls
   `attn_layer_00` ... `attn_layer_11` from the outputs object, slices the
   final-query-position row out of each `[1, 12, T, T]` tensor, and returns
   `{ attention, available: true }` shaped `[layer][head]`.
4. Replace the body of `src/lib/logitLens.ts` similarly: for each
   `hidden_NN`, apply `ln_f` then unembed (we need `wte.weight` and
   `ln_f.{weight,bias}` — extract them once at export time into a tiny
   companion `.bin` and ship in the same Hub repo, OR redo unembedding in
   PyTorch and emit a `logit_lens_NN` output per layer to avoid pushing ln+
   unembed math into JS). The latter is preferred — fewer moving parts.
5. Wire the warning suppression: when both extractors return
   `available: true`, the corresponding entries should drop out of
   `analysis.warnings`.

## Current landing state

- `scripts/export-gpt2.py` — committed.
- `scripts/requirements.txt` — committed.
- `bench/phase-2.5.md` — this file.
- `src/lib/attentionExtract.ts` — still returns `{ available: false }`.
- `src/lib/logitLens.ts` — still returns `{ available: false }`.
- Attention and Logit-lens panels render their capability notes.
- App builds and typechecks cleanly.

That is the v1 landing state. Per `POLISH_PROMPTS.md`, this is **stronger**
than shipping plausible-but-unverified numbers: a reader who opens the
Attention panel sees an honest explanation of what's missing and a pointer to
this file, not a heatmap that might be wrong.

## Next step for whoever picks this up

1. `pip install -r scripts/requirements.txt`
2. `python scripts/export-gpt2.py --output-dir build/onnx-gpt2`
3. Write the `verify.py` companion described above. The bar is the table in
   the verification-plan section.
4. If verification passes, push to HF Hub and edit `modelLoader.ts` plus the
   two extractor modules per the wiring plan.
5. Delete this status block and replace with a "verified on YYYY-MM-DD"
   stamp, plus the actual entropy numbers from the verification run.
