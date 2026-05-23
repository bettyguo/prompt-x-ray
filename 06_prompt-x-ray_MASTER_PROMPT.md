# prompt-x-ray — Master Implementation Prompt

*A Claude Code execution prompt. Read this file in full before writing any code. Treat every section as a binding constraint.*

---

## 0. Read first

**Pattern instantiated.** D — interpretability visualizer, applied to forensic prompt analysis.

**One-sentence elevator pitch.** Paste any prompt, get a forensic visualization of how the model "sees" it: tokenization, attention focus, layer-by-layer prediction evolution, top-k branches at each step.

**The viral hook.** A side-by-side screenshot: a user pastes a famous prompt (e.g., "John and Mary went to the shop. John gave Mary a ___") and the x-ray reveals at which layer the prediction crystallized, which heads focused where, and which alternative tokens were almost selected. Caption: "Forensic analysis of any prompt in 5 seconds."

**Release wave context.** Repo #6 of 10. Week 1 launch (Wednesday), the third pillar after nano-sae (Monday) and attention-orrery (Tuesday). Different surface from attention-orrery: orrery is "the live model in motion"; x-ray is "the post-mortem of a specific prompt."

---

## 1. Project constitution

### What this repo is

A static website that runs a small LM in the browser and produces an integrated forensic visualization of a single prompt across four panels:

1. **Tokenizer panel** — how the prompt is segmented; surprising token boundaries highlighted.
2. **Attention panel** — which tokens each layer's heads focus on; head-level summary.
3. **Layer panel (logit lens)** — for each layer, the model's prediction at that layer; convergence/divergence visible.
4. **Sampling panel** — at the final layer, the top-k candidate tokens with probabilities; what was almost said.

The four panels share a token-position axis so users can correlate findings across them.

### What this repo is not

- **Not** a generation tool (it doesn't run completions; it analyzes the model's processing of a given prompt).
- **Not** a real-time tool (computes once on paste, then displays; not optimized for live typing like attention-orrery).
- **Not** a TransformerLens replacement; it's the polished consumer surface, not the research library.
- **Not** an arbitrary-prompt tool against arbitrary models. GPT-2 small in-browser only at v1.

### Brand fit

Researcher-fun-viral. Every forensic analysis of an interesting prompt is a tweet. The "x-ray" framing is medical-scientific — serious aesthetic.

---

## 2. Architectural commitments

### Tech stack

Same as attention-orrery (deliberate, for portfolio coherence):

- **React 18 + TypeScript + Vite**
- **transformers.js 3.x** for in-browser GPT-2 inference (reuse the same loaded model from attention-orrery if both pages co-exist on one domain)
- **D3.js + SVG** for all four panels (heatmaps, bar charts, line charts)
- **Tailwind v4** for UI
- **Vercel or Cloudflare Pages**

### File structure

```
prompt-x-ray/
├── src/
│   ├── components/
│   │   ├── PromptInput.tsx
│   │   ├── TokenizerPanel.tsx
│   │   ├── AttentionPanel.tsx
│   │   ├── LayerPanel.tsx         # the logit-lens view
│   │   ├── SamplingPanel.tsx       # top-k at final layer
│   │   ├── ShareLink.tsx           # generate shareable URLs
│   │   └── ExamplePrompts.tsx
│   ├── lib/
│   │   ├── modelLoader.ts
│   │   ├── analyzePrompt.ts        # the unified analysis fn
│   │   ├── tokenizer.ts
│   │   ├── attentionExtract.ts
│   │   ├── logitLens.ts
│   │   └── sampling.ts
│   ├── App.tsx
│   └── main.tsx
├── public/
│   └── examples/                   # 10 curated forensic-interesting prompts
├── assets/
│   └── hero-xray.png
├── README.md
├── HOW-TO-READ.md                  # what each panel shows
├── CITATION.cff
├── LICENSE
└── package.json
```

### Hard rules

1. **In-browser inference only.** Same privacy positioning as attention-orrery.
2. **GPT-2 small only at v1.** Multi-model is v2.
3. **The four panels are integrated, not independent.** A token highlighted in one panel highlights in all panels.
4. **Shareable URLs**: every prompt's x-ray is shareable via URL parameters. This is essential for virality — every forensic finding becomes a tweetable link.
5. **Progressive disclosure**: default view is tokenizer + logit lens (the easiest to read). Attention + sampling are tabs. Power-user toggle reveals all four at once.

---

## 3. Phased implementation plan

### Phase 1 — Scaffolding (target: 3 hours)

- Vite + React + TypeScript + Tailwind v4 with shared design tokens
- transformers.js installed; GPT-2 small loads + tokenizes correctly
- D3 installed; placeholder panels render
- URL-parameter routing: `?prompt=<base64>` displays an analysis of that prompt on load

Exit gate: page loads, prompt input + four placeholder panels render.

### Phase 2 — Analysis backend (target: 6 hours)

1. **`analyzePrompt(text)`** function: takes text, runs a single GPT-2 small forward pass, extracts tokenizer output, all attention weights, all intermediate residual states, and final logits. ~2h.
2. **Logit lens computation**: for each layer's residual state, apply the unembedding to get a token-distribution. Pull top-5 tokens per layer per position. ~2h.
3. **Sampling computation**: at the final layer, compute top-k (k=10) with probabilities for the position immediately after the prompt. ~1h.
4. **Caching**: cache analysis results in IndexedDB keyed by prompt; instant reload for previously-analyzed prompts. ~1h.

Exit gate: pasting a prompt and clicking "Analyze" produces a JSON of all analysis data in <5 seconds.

### Phase 3 — The four panels (target: 14 hours)

This is the long phase. Each panel ~3.5h.

1. **Tokenizer panel** (~3h):
   - Show the prompt with token boundaries highlighted (alternating colors).
   - For each token: display its ID, its frequency rank.
   - Flag "surprising" boundaries (where a word breaks unexpectedly).

2. **Attention panel** (~4h):
   - 12×12 grid of head-level attention heatmaps. Hovering a head expands it.
   - Click a head to see its attention as arcs overlaying the input.
   - Auto-detect interesting heads (high entropy, or heads with strong specific patterns) and highlight them.

3. **Layer panel — logit lens** (~4h):
   - For each layer (0–11), a row of mini bar charts (one per position) showing top-3 predictions at that position.
   - Vertical highlights showing where the prediction "crystallizes" (becomes stable across remaining layers).
   - The most pedagogically striking panel; budget time accordingly.

4. **Sampling panel** (~3h):
   - Top-10 candidate tokens for the next position after the prompt.
   - Bar chart of probabilities (log-scale toggle).
   - Click any candidate to "fork" — see what would happen if that token were chosen and re-run the analysis on the extended prompt.

Exit gate: all four panels render correctly for any pasted prompt; hovering/clicking interactions work; the "share this analysis" URL feature works.

### Phase 4 — Integration + polish (target: 6 hours)

1. **Shared token-position axis** across all four panels — selecting a position in one highlights it in all. ~2h.
2. **Example prompts**: 10 curated prompts that produce visually striking analyses. Showcase as "Try one of these" gallery on the homepage. ~2h.
3. **Performance pass**: aim for <3 seconds from paste to analysis on a 2024 laptop. ~1h.
4. **Hero screenshot**: a forensic analysis of a famous prompt (e.g., the IOI / "John and Mary" prompt) with all four panels visible. ~1h.

Exit gate: hero screenshot exists; performance budget hit; example prompts load instantly (cached).

### Phase 5 — Documentation + launch kit (target: 3 hours)

1. README per §7.
2. HOW-TO-READ.md explaining what each panel reveals.
3. CITATION.cff.
4. Launch thread per §9.
5. Cross-references.

### Phase 6 — Post-launch (target: ongoing)

- Bug fixes / accessibility for first 2 weeks.
- Quarterly: add a new example prompt to the gallery if community submits a particularly interesting one.

---

## 4. Detailed specs per phase

### 4.1 The unified analysis function

```typescript
interface PromptAnalysis {
  prompt: string;
  tokens: Array<{
    id: number;
    text: string;
    surprising_boundary: boolean;  // heuristic: split mid-word, low frequency, etc.
  }>;
  attention: Array<Array<{
    layer: number;
    head: number;
    weights: number[][];  // [seq_len × seq_len]
    entropy: number;
    interesting: boolean;  // auto-flagged for highlighting
  }>>;
  logit_lens: Array<{
    layer: number;
    position: number;
    top_predictions: Array<{ token: string; prob: number }>;
  }>;
  sampling: Array<{ token: string; prob: number; logprob: number }>;
}

async function analyzePrompt(text: string): Promise<PromptAnalysis>;
```

### 4.2 The logit lens (Phase 3.3)

For each layer ℓ ∈ {0, ..., 11} and each position p ∈ {0, ..., len(prompt)-1}:

1. Apply layer ℓ's output to the unembedding matrix: `logits[ℓ, p] = unembed(residual[ℓ, p])`.
2. Softmax → probabilities.
3. Take top-3 tokens.
4. Render as a mini horizontal bar chart, with the token text inside the bar.

The pedagogical insight: at early layers, predictions look random (or dominated by frequent tokens like "the"). At middle layers, syntactic predictions emerge. At late layers, semantically appropriate predictions crystallize. Make this story visible by default.

### 4.3 Interesting-head heuristic (Phase 3.2)

A head is auto-flagged "interesting" if it satisfies one of:
- Attention entropy is unusually low (focused on a single token).
- Attention is mostly on the previous token (induction-head signature).
- Attention is on the first token (BOS-attractor).
- Attention is on a punctuation token (delimiter-attractor).

Document the heuristics in HOW-TO-READ.md so users understand the "interesting" badge.

### 4.4 The hero screenshot

Use the IOI / "John and Mary" prompt for the canonical example. All four panels visible. Highlight one finding from each panel:
- Tokenizer: "John" and "Mary" tokenize differently.
- Attention: heads 9.6 and 9.9 attend to "John" / "Mary".
- Layer panel: at layer 9, the prediction crystallizes on "Mary".
- Sampling: "Mary" wins with ~70% probability; "John" is second at ~10%.

Output: 2400×1600 px, designed for screenshotting in halves (top-bottom or left-right).

---

## 5. Rejected alternatives

### 5.1 Rejected: separate sites for each panel

Each as a standalone tool would be fine; the integration is the unique value. Four panels with a shared axis make this prompt-x-ray, not BertViz-plus-logit-lens-plus-tokenizer.

### 5.2 Rejected: real-time analysis as user types

Too expensive per keystroke. Click-to-analyze is intentional.

### 5.3 Rejected: server-side inference for larger models

Kills privacy positioning. The "post-mortem" model serves the small-model surface adequately.

### 5.4 Rejected: include MLP-level interpretability views

Adds significant surface area. Reserved for a dedicated tool or v2.

### 5.5 Rejected: include diffing two prompts

Tempting (the "what changed when I edited the prompt" view) but the v1 surface is already large. v2 feature.

---

## 6. Anti-fabrication rules

1. **All four panels show real data from the analyzed prompt.** No synthetic data.
2. **Interesting-head flags are computed**, not curated.
3. **The hero screenshot is from a real analysis run**, not composited.
4. **Performance claims are measured** on documented hardware.
5. **Example prompts produce the analyses claimed** in the gallery captions; verified before launch.

---

## 7. README scaffold

```markdown
# prompt-x-ray

> Paste a prompt, get a forensic visualization of how the model processes it.

[hero screenshot]

## What it is

Paste any prompt; see a four-panel x-ray of how GPT-2 small "sees" it:

1. **Tokenizer**: how the prompt is segmented.
2. **Attention**: which tokens each head focuses on.
3. **Logit lens**: layer-by-layer prediction evolution.
4. **Sampling**: top-10 candidate next tokens with probabilities.

All four panels share a token-position axis. Hovering a token in one highlights it in all.

## Try it

[link]

[example prompts gallery]

## Share an analysis

Every analysis has a shareable URL. Found an interesting prompt? Share the x-ray link.

## What it isn't

- Not a generation tool.
- Not a multi-model viewer.
- Not a real-time tool.

See LIMITATIONS.md.

## See also (release wave)

[10-repo block]

## Citation

See CITATION.cff.

## License

MIT.
```

---

## 8. Success criteria

- **Day 1:** ≥1200 stars; site ≥8000 visitors; launch thread ≥2500 impressions, ≥25 replies.
- **Day 7:** ≥6000 stars; on Trending; ≥40000 visitors; in 3+ newsletters.
- **Day 30:** ≥15000 stars; ≥150000 site visitors; multiple "look at this x-ray of [prompt]" tweets in the wild.
- **Non-star metric:** ≥10 unique users have generated shareable links of forensic-interesting findings.

---

## 9. Launch tactics

### Launch slot

Wednesday morning 10:00 ET, week 1. Third pillar after nano-sae (Monday) and attention-orrery (Tuesday).

### Launch thread

Tweet 1:
> prompt-x-ray: paste any prompt, get a forensic visualization of how the model processes it.
> 
> Four panels: tokenizer, attention, layer-by-layer predictions, sampling alternatives.
> 
> All synced on the same token-position axis.
> 
> [hero screenshot]

Tweet 2 (the famous-prompt demonstration):
> The IOI prompt — "John and Mary went to the shop. John gave Mary a ___" — under the x-ray.
> 
> Watch the prediction crystallize at layer 9. Heads 9.6 and 9.9 do the work.
> 
> [GIF zooming through the layer panel]

Tweet 3 (the shareable-link feature):
> Every analysis is shareable. Found an interesting prompt? Tweet the x-ray link.
> 
> [example shareable link]

Tweet 4 (link):
> [link]

Tweet 5 (cross-reference):
> Week 1 of the openproblems-labs release wave. Companion launches: nano-sae (Monday), attention-orrery (Tuesday). Same teal accent. Different surface.

Tweet 6 (the call):
> Show me your weirdest prompt's x-ray. I'm collecting findings for the example gallery.

### Co-amplifiers

- Neel Nanda
- Anthropic interpretability team voices
- Jay Alammar (illustrator-of-transformers)
- A logit-lens-niche voice (nostalgebraist if active; the original logit-lens framing)

### Reply prep

- *"This is just BertViz + a logit lens + a tokenizer."* → "Yes, integrated. The integration is the value. All four panels share a position axis."
- *"Can I use a bigger model?"* → "v1 is GPT-2 small only. Privacy-by-default constrains to in-browser models."
- *"How is this different from attention-orrery?"* → "Orrery is live, post-mortem. x-ray is forensic, on-demand."

---

## 10. Failure recovery

### Scenario 1: <300 stars in 24 hours

Recovery: highlight individual prompt findings as standalone threads over the next 7 days. Each forensic finding is its own viral moment.

### Scenario 2: Considered redundant with attention-orrery

Pin a Discussion explaining the distinction (live model vs forensic prompt analysis).

### Scenario 3: Performance unacceptable

Optimize attention extraction; throttle the layer panel rendering. Documented tradeoff.

---

## 11. Cross-references

- **attention-orrery** (Pattern B, week 1): same release week; companion. Cross-link aggressively.
- **nano-sae** (Pattern A, week 1): SAE features could become a fifth x-ray panel in v2; documented.
- **steering-playground** (Pattern D, week 2): paired interp tool; steering changes the x-ray.
- **interp-golf** (Pattern C, week 2): puzzles often involve x-ray findings.
- **policy-microscope** (Pattern B, week 2): no direct link.
- **nano-mcp** (Pattern A, week 2): no link.
- **llm-fossils** (Pattern F, week 3): fossils can be visualized via prompt-x-ray.
- **emergence-museum** (Pattern F, week 3): no direct link.
- **mechanistic-detective** (Pattern G, week 3): detective uses prompt-x-ray–style analysis; cross-link.

---

## 12. Citation block

```yaml
cff-version: 1.2.0
title: "prompt-x-ray: Forensic Visualization of Language Model Processing"
authors:
  - family-names: "{LAST_NAME}"
    given-names: "{FIRST_NAME}"
    orcid: "{ORCID}"
    affiliation: "{AFFILIATION}"
date-released: "{LAUNCH_DATE}"
repository-code: "https://github.com/openproblems-labs/prompt-x-ray"
url: "https://prompt-x-ray.openproblems-labs.org"
license: MIT
keywords:
  - mechanistic interpretability
  - language model analysis
  - prompt engineering
  - visualization
```

---

## 13. Open decisions for the implementer

- Hosting (Vercel vs Cloudflare)
- Whether to support server-side larger-model mode in v1 (recommend no; v2)
- Whether to expose the analysis JSON as a downloadable artifact (recommend yes; researchers will want raw data)

---

*End of prompt-x-ray master prompt. Total lines: ~430.*
