"""Export GPT-2 small to ONNX with attentions + hidden states as graph outputs.

The standard `Xenova/gpt2` ONNX export only emits the `logits` tensor; it strips
`output_attentions` and `output_hidden_states` because they are not part of the
default causal-LM forward signature. The prompt-x-ray Attention and Logit-lens
panels need both, so this script rebuilds the export with a thin wrapper that
forces the model to surface them and pins them as named ONNX outputs.

Usage
-----
    python -m venv .venv
    source .venv/bin/activate            # PowerShell: .venv\\Scripts\\Activate.ps1
    pip install -r scripts/requirements.txt
    python scripts/export-gpt2.py --output-dir build/onnx-gpt2

The output directory will contain:
    model.onnx           # full graph, fp32
    tokenizer files      # passthrough from HuggingFace
    config.json          # passthrough
    export_meta.json     # provenance + shape contract

The ONNX binary is intentionally NOT committed (~500 MB). Host it on a
HuggingFace Hub repo (e.g. `<org>/gpt2-attn-hidden-onnx`) and reference the
repo id from `src/lib/modelLoader.ts` once verification passes.

Verification plan
-----------------
See `bench/phase-2.5.md` for the numerical-parity checklist that must hold
before the new graph is wired into the app.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

import torch
import torch.nn as nn
from transformers import AutoTokenizer, GPT2LMHeadModel


MODEL_ID = "gpt2"
# GPT-2 small constants — encoded here so the export is self-describing.
NUM_LAYERS = 12
NUM_HEADS = 12
HIDDEN_SIZE = 768
VOCAB_SIZE = 50257
# Dummy sequence length for tracing. ONNX dynamic_axes makes this not a runtime
# constraint, but the tracer needs a concrete shape to follow.
TRACE_SEQ_LEN = 8


class GPT2WithInternals(nn.Module):
    """Wraps GPT2LMHeadModel so attentions + hidden_states are graph outputs.

    HuggingFace's GPT2LMHeadModel returns a `CausalLMOutputWithCrossAttentions`
    object whose `.attentions` and `.hidden_states` fields are populated only
    when the corresponding flags are passed. `torch.onnx.export` ignores fields
    on dataclass-like outputs unless they are inside a tuple at the top level
    of `forward()`'s return — hence this wrapper.

    Output tuple layout (stable contract; do not reorder):
        logits                                 [B, T, V]
        attn_layer_00, ..., attn_layer_11      each [B, H, T, T]
        hidden_00, ..., hidden_12              each [B, T, D]
            (hidden_00 is the post-embedding residual; hidden_12 is post-final-
             block residual i.e. the input to ln_f; the final hidden state
             after ln_f is implicit in logits via the unembedding tie.)
    """

    def __init__(self, base: GPT2LMHeadModel) -> None:
        super().__init__()
        self.base = base

    def forward(self, input_ids: torch.Tensor, attention_mask: torch.Tensor):  # type: ignore[override]
        out = self.base(
            input_ids=input_ids,
            attention_mask=attention_mask,
            output_attentions=True,
            output_hidden_states=True,
            use_cache=False,
            return_dict=True,
        )
        # `out.attentions` is a tuple of NUM_LAYERS tensors of shape [B, H, T, T].
        # `out.hidden_states` is a tuple of NUM_LAYERS + 1 tensors of shape [B, T, D].
        return (out.logits, *out.attentions, *out.hidden_states)


def build_output_names() -> list[str]:
    names = ["logits"]
    names.extend(f"attn_layer_{i:02d}" for i in range(NUM_LAYERS))
    names.extend(f"hidden_{i:02d}" for i in range(NUM_LAYERS + 1))
    return names


def build_dynamic_axes() -> dict[str, dict[int, str]]:
    axes: dict[str, dict[int, str]] = {
        "input_ids": {0: "batch", 1: "sequence"},
        "attention_mask": {0: "batch", 1: "sequence"},
        "logits": {0: "batch", 1: "sequence"},
    }
    for i in range(NUM_LAYERS):
        axes[f"attn_layer_{i:02d}"] = {0: "batch", 2: "sequence", 3: "sequence"}
    for i in range(NUM_LAYERS + 1):
        axes[f"hidden_{i:02d}"] = {0: "batch", 1: "sequence"}
    return axes


def export(output_dir: Path, opset: int = 17) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)

    tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
    base = GPT2LMHeadModel.from_pretrained(MODEL_ID)
    base.eval()
    wrapped = GPT2WithInternals(base)
    wrapped.eval()

    dummy_ids = torch.randint(0, VOCAB_SIZE, (1, TRACE_SEQ_LEN), dtype=torch.long)
    dummy_mask = torch.ones((1, TRACE_SEQ_LEN), dtype=torch.long)

    onnx_path = output_dir / "model.onnx"
    output_names = build_output_names()
    dynamic_axes = build_dynamic_axes()

    with torch.no_grad():
        torch.onnx.export(
            wrapped,
            (dummy_ids, dummy_mask),
            onnx_path.as_posix(),
            input_names=["input_ids", "attention_mask"],
            output_names=output_names,
            dynamic_axes=dynamic_axes,
            opset_version=opset,
            do_constant_folding=True,
        )

    # Passthrough tokenizer + config so transformers.js can load directly.
    tokenizer.save_pretrained(output_dir.as_posix())
    base.config.save_pretrained(output_dir.as_posix())

    meta = {
        "source_model": MODEL_ID,
        "num_layers": NUM_LAYERS,
        "num_heads": NUM_HEADS,
        "hidden_size": HIDDEN_SIZE,
        "vocab_size": VOCAB_SIZE,
        "opset": opset,
        "trace_seq_len": TRACE_SEQ_LEN,
        "output_names": output_names,
        "notes": (
            "Wrapper forces output_attentions + output_hidden_states. "
            "See bench/phase-2.5.md for the verification contract."
        ),
    }
    (output_dir / "export_meta.json").write_text(json.dumps(meta, indent=2))

    print(f"Wrote: {onnx_path}")
    print(f"Wrote: {output_dir / 'export_meta.json'}")
    print(f"Vocab + tokenizer files: {output_dir}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("build/onnx-gpt2"),
        help="Directory to write model.onnx + tokenizer files. Default: build/onnx-gpt2",
    )
    parser.add_argument(
        "--opset",
        type=int,
        default=17,
        help="ONNX opset version. transformers.js >= 3 supports 14..17 reliably.",
    )
    args = parser.parse_args()
    export(args.output_dir, opset=args.opset)


if __name__ == "__main__":
    main()
