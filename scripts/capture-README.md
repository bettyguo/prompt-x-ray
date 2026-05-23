# Launch-artifact capture

This directory contains the capture pipeline for prompt-x-ray's launch
artifacts. The actual artifacts live in `../assets/` and are committed to
git only after Phase 2.5 lands.

## Honesty constraint (read first)

Anti-fabrication rule #3 says: **"The hero screenshot is from a real analysis
run, not composited."**

Today, the Attention and Logit-lens panels render capability notes — they
explain what they *will* show once Phase 2.5 (custom ONNX export with
attentions + hidden states) lands. A hero screenshot captured before that
work merges would either:

- only show real data on two of four panels (Tokenizer + Sampling), or
- silently misrepresent the others.

**Do not run `npm run capture` and do not commit `assets/hero-xray.png`
until all four panels render real numbers.** The capture script itself is
committed early so the post-Phase-2.5 launch is a one-command operation.

A static `assets/social-card.svg` placeholder is committed for the launch
tweet and is honest about being a placeholder, not a real screenshot.

## Expected artifact set

| File | Source | Purpose |
| ---- | ------ | ------- |
| `assets/hero-xray.png` | `npm run capture` | 2400×1600 hero on README and the launch post. Generated. |
| `assets/og.png` | `npm run capture` | 1200×630 OG/Twitter card. Generated. |
| `assets/demo.gif` | manual screen recording + `ffmpeg` | ≤4 MB, ≤12 fps, ~6 s loop. See "demo.gif workflow" below. |
| `assets/social-card.svg` | hand-authored | Pre-launch placeholder. Static, honest. |
| `assets/capture.manifest.json` | `npm run capture` | Metadata about the most recent run (timestamp, prompt, url). |

## What `npm run capture` does

1. Starts `npm run preview` on port 4173 (skip with `CAPTURE_USE_RUNNING=1`
   if you already have one running).
2. Opens Chromium headless at 2400×1600, dark colour scheme, reduced motion.
3. Navigates to `/?prompt=<base64 of the IOI prompt>` — the canonical
   interp benchmark, `"John and Mary went to the shop. John gave Mary a"`.
4. Waits for `[data-analysis-ready="true"]` on the App root (added by the
   orchestrator post-Phase-2.5) OR for the SamplingPanel's first bar
   (`svg[aria-label*="sampling candidates"]`) — whichever resolves first.
5. Clicks the "All four" view toggle.
6. Re-waits for the freshly-mounted panels.
7. Screenshots `<main>` to `assets/hero-xray.png`.
8. Clips the SamplingPanel `<aside>` and composites it onto a teal-gradient
   1200×630 backdrop → `assets/og.png`.
9. Writes `assets/capture.manifest.json`.

## When to re-run

- After Phase 2.5 lands (the *real* trigger).
- After any major visual change to the four panels.
- Before a release announcement (verify the hero still matches the live app).

## Setup

Capture deps are intentionally **not** in `package.json` — they are heavy
and the CI sandbox can't run a browser. Install them only when you're about
to capture:

```bash
npm i -D playwright @playwright/test tsx
npx playwright install chromium
```

Then:

```bash
npm run build
npm run capture        # this also spawns `npm run preview` for you
```

## demo.gif workflow (document, do not execute)

The capture script does not produce `demo.gif`. Record a ~6 s screen capture
manually showing a fresh analysis run (paste prompt → Analyze → tokens
animate in → flip to "All four"). Save the source as `assets/demo.mov` or
`assets/demo.mp4` (ignored by git). Then convert with two-pass ffmpeg for
palette-quality output under the size cap:

```bash
# 1. Generate a palette tuned for the recording.
ffmpeg -y -i assets/demo.mov \
  -vf "fps=12,scale=960:-1:flags=lanczos,palettegen=stats_mode=diff" \
  assets/demo.palette.png

# 2. Apply the palette with dithering.
ffmpeg -y -i assets/demo.mov -i assets/demo.palette.png \
  -lavfi "fps=12,scale=960:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle" \
  -loop 0 \
  assets/demo.gif

# 3. Verify size.
ls -lh assets/demo.gif    # must be <= 4 MB
```

If the result is over 4 MB, reduce in this order: drop fps to 10, then
scale to 800, then trim to ~5 s.

## Why these settings

- **2400×1600 hero** — 2× Retina at the README's max content width of
  1200 px. Sharp on every display, file size still under ~600 KB.
- **1200×630 OG** — the canonical Twitter/Open Graph card dimensions.
- **Dark colour scheme** — the app's default; matches the brand.
- **`reduced-motion: reduce`** — prevents D3 entry transitions from
  catching the screenshot mid-animation.
- **Headless Chromium** — Firefox renders Tailwind v4 oklch() slightly
  differently; we standardise on Chromium for reproducible output.
