# How to read prompt-x-ray

A guide to what each panel actually shows, and the heuristics behind the highlights. All four panels share a token-position axis — hover or click a token in any panel and it highlights in all of them.

## 1. Tokenizer

Each chip is one GPT-2 BPE token.

- The marker `·` at the start of a chip means the token includes a leading space (GPT-2's BPE tokenizer encodes whitespace as part of the *next* token, so most English words appear as `·word`).
- `↵` marks a newline token.
- **Chip background shade** maps to GPT-2 vocab id (≈ frequency rank): cool dark blue = common, warm amber = rare. This is a hint, not a measurement (see [LIMITATIONS.md](LIMITATIONS.md) for the caveat).
- **Amber ring** marks a "surprising boundary." Heuristics:
  - **midword-split** — a word breaks across two tokens unexpectedly (e.g., `John` and a following `son`).
  - **low-frequency** — token id past ~30 000 in GPT-2's vocab.
  - **uncommon-punctuation** — single-char punctuation outside the common set (`. , ! ? : ; " ' - ( )`).
  - **byte-fallback** — token decodes to a control byte.

Hover a chip for `pos N · id #X · rank Y` plus the reason list if any.

## 2. Attention

A 12×12 head summary grid (12 layers × 12 heads in GPT-2 small). Each cell's brightness encodes the head's mean per-row entropy: bright teal = sharp focus, dark = uniform. A teal outline marks a head auto-flagged as "interesting" by one of these patterns:

- **low-entropy** — focuses sharply on one position.
- **previous-token** — fires on position-1 (induction-head signature).
- **bos-attractor** — pulls toward the first token (BOS).
- **delimiter-attractor** — pulls toward a punctuation token.

Hover a cell to expand the head's full attention as a heatmap below the grid.

**Currently:** **Not yet available** — GPT-2's default ONNX export doesn't
expose attentions. A custom export is in flight ([`scripts/export-gpt2.py`](scripts/export-gpt2.py),
[`bench/phase-2.5.md`](bench/phase-2.5.md)); this panel will populate once it
lands. See [LIMITATIONS.md](LIMITATIONS.md) for the full picture.

## 3. Layer — logit lens

A layers × positions grid. Layer 0 at the bottom (closest to input), Layer 11 at the top (closest to output) — vertically reading bottom-up traces the residual stream through depth.

Each cell renders the **top-1** predicted next-token if the model stopped at that layer at that position. Cell brightness encodes the probability of that prediction. Hover to see the top-3 with full probabilities.

The pedagogical story across depth:

- Early layers (0–3): noisy / dominated by frequent tokens.
- Middle layers (4–8): syntactic candidates emerge.
- Late layers (9–11): semantic crystallization.

When the prediction stabilizes — the same argmax across the remaining layers — that's the "crystallization point." Phase 4 adds a vertical highlight to mark it visually.

**Currently:** **Not yet available** — GPT-2's default ONNX export doesn't
expose intermediate hidden states. A custom export is in flight
([`scripts/export-gpt2.py`](scripts/export-gpt2.py), [`bench/phase-2.5.md`](bench/phase-2.5.md));
this panel will populate once it lands. See [LIMITATIONS.md](LIMITATIONS.md) for the full picture.

## 4. Sampling

The top-10 candidate next tokens at the position immediately after the prompt, with their post-softmax probabilities. Bar height = probability; toggle the **log** scale to see the long tail.

The footer line reports cumulative probability mass: `Top-10 covers X%` tells you whether the model is confident (one or two candidates near 100%) or hedged (mass spread across many).

**Click any bar to fork:** the candidate token is appended to the current
prompt and the full analysis re-runs — a hand-rolled way to walk a beam.

## Shared axis

Hovering a token in the Tokenizer panel or a column in the Layer panel broadcasts a position; every panel responds. Clicking a token pins the selection. Click again to unpin.

## Privacy

Everything runs in your browser. The prompt never leaves your device. Model weights download once from the Hugging Face CDN and stay in your browser cache.
