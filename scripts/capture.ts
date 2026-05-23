// Requires: npm i -D playwright @playwright/test tsx
//
// Capture script for prompt-x-ray launch artifacts.
//
// HONESTY GATE — read before running:
//   Per the project's anti-fabrication rule #3, "The hero screenshot is from a
//   real analysis run, not composited." Phase 2.5 lights up the Attention and
//   Logit-lens panels with real data. Until Phase 2.5 has landed and you've
//   verified that all four panels render real numbers (not capability notes),
//   DO NOT run this script and DO NOT commit assets/hero-xray.png.
//
// Usage (post-Phase-2.5):
//   1. npm i -D playwright @playwright/test tsx
//   2. npx playwright install chromium
//   3. npm run build
//   4. (in a separate terminal) npm run preview     # serves on :4173
//   5. npm run capture
//
// Outputs:
//   assets/hero-xray.png   2400x1600 — <main> screenshot, all-four view
//   assets/og.png          1200x630  — SamplingPanel clip, teal background
//
// demo.gif: NOT captured by this script. Record a 6s screen capture manually
// (e.g. macOS Cmd+Shift+5 → "Record selected portion") then convert with
// ffmpeg — exact invocation is documented in scripts/capture-README.md.

import { chromium, type Page } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");
const ASSETS_DIR = resolve(ROOT, "assets");

// IOI canonical prompt (see src/components/ExamplePrompts.tsx).
const IOI_PROMPT = "John and Mary went to the shop. John gave Mary a";

// URL-safe base64 encoder, mirrors src/lib/urlState.ts toBase64Url().
function toBase64Url(s: string): string {
  return Buffer.from(s, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

const PORT = 4173;
const ORIGIN = `http://localhost:${PORT}`;
const TARGET_URL = `${ORIGIN}/?prompt=${toBase64Url(IOI_PROMPT)}`;

async function ensureAssets(): Promise<void> {
  if (!existsSync(ASSETS_DIR)) {
    await mkdir(ASSETS_DIR, { recursive: true });
  }
}

async function startPreview(): Promise<ChildProcess> {
  // Spawn `vite preview` ourselves so the script is fully self-contained.
  // Operator can also start it manually and skip this — controlled by the
  // CAPTURE_USE_RUNNING env var.
  if (process.env.CAPTURE_USE_RUNNING === "1") {
    console.log("[capture] Using already-running preview server.");
    return null as unknown as ChildProcess;
  }
  console.log(`[capture] Starting vite preview on :${PORT}…`);
  const isWin = process.platform === "win32";
  const child = spawn(isWin ? "npm.cmd" : "npm", ["run", "preview", "--", "--port", String(PORT)], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  });
  // Wait for the server to declare itself ready.
  await new Promise<void>((res, rej) => {
    const timer = setTimeout(() => rej(new Error("preview server did not start within 30s")), 30_000);
    const onData = (buf: Buffer) => {
      const line = buf.toString();
      process.stdout.write(`[preview] ${line}`);
      if (line.includes(String(PORT))) {
        clearTimeout(timer);
        child.stdout?.off("data", onData);
        // Give it a beat to actually accept connections.
        setTimeout(res, 500);
      }
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", (b) => process.stderr.write(`[preview!] ${b.toString()}`));
    child.on("exit", (code) => rej(new Error(`preview exited early with code ${code}`)));
  });
  return child;
}

async function waitForAnalysis(page: Page): Promise<void> {
  // Preferred future signal — orchestrator sets data-analysis-ready="true"
  // on the App root once all four panels finish hydrating. Until that marker
  // ships, fall back to the SamplingPanel's first bar.
  const ready = page.locator('[data-analysis-ready="true"]');
  const samplingBar = page.locator('svg[aria-label*="sampling candidates"]');
  await Promise.race([
    ready.waitFor({ state: "attached", timeout: 60_000 }).catch(() => null),
    samplingBar.waitFor({ state: "visible", timeout: 60_000 }),
  ]);
  // Small additional settle — give D3 transitions a chance to finish.
  await page.waitForTimeout(750);
}

async function toggleAllFour(page: Page): Promise<void> {
  // The ViewToggle for "All four" is a button with that text. See App.tsx.
  const btn = page.getByRole("button", { name: "All four" });
  await btn.click({ timeout: 5_000 });
  await page.waitForTimeout(300);
}

async function captureHero(page: Page): Promise<void> {
  const main = page.locator("main").first();
  await main.waitFor({ state: "visible" });
  const out = resolve(ASSETS_DIR, "hero-xray.png");
  await main.screenshot({ path: out, scale: "css", animations: "disabled" });
  console.log(`[capture] Wrote ${out}`);
}

async function captureOg(page: Page): Promise<void> {
  // Crop the SamplingPanel <aside> and composite it on a teal background so
  // the OG card has a recognisable brand colour even when the panel is narrow.
  // We use a clipping screenshot then re-encode with a tinted backdrop via
  // a second offscreen page (cheap PNG composition without sharp/Jimp deps).
  const aside = page.locator("aside").filter({ has: page.locator('svg[aria-label*="sampling candidates"]') }).first();
  await aside.waitFor({ state: "visible", timeout: 10_000 });
  const panelShot = await aside.screenshot({ scale: "css", animations: "disabled" });

  const browser = page.context().browser();
  if (!browser) throw new Error("no browser handle for og compositing");
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  const composer = await ctx.newPage();
  // Inline data URL keeps the composer page self-contained.
  const dataUrl = `data:image/png;base64,${panelShot.toString("base64")}`;
  await composer.setContent(`<!doctype html>
<html><head><style>
  html, body { margin: 0; padding: 0; background: #0b1419; }
  .card {
    width: 1200px; height: 630px;
    background: linear-gradient(135deg, #0b1419 0%, #0f2a33 60%, #14b8a6 220%);
    display: grid; grid-template-columns: 1fr 560px; align-items: center;
    color: #e6f1f0; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  }
  .copy { padding: 56px 32px 56px 64px; }
  .kicker { font-size: 13px; letter-spacing: 0.18em; text-transform: uppercase; color: #5eead4; }
  h1 { font-size: 52px; line-height: 1.05; margin: 14px 0 18px; font-weight: 700; }
  p  { font-size: 19px; line-height: 1.5; color: #b8c7ce; max-width: 460px; margin: 0; }
  .panel { padding: 32px 64px 32px 0; display: flex; justify-content: flex-end; }
  .panel img { max-width: 100%; max-height: 540px; border: 1px solid rgba(94, 234, 212, 0.25); border-radius: 12px; box-shadow: 0 24px 64px rgba(0,0,0,0.45); background: #0e1a20; }
</style></head>
<body>
  <div class="card">
    <div class="copy">
      <div class="kicker">prompt-x-ray</div>
      <h1>Watch a prompt<br/>turn into tokens.</h1>
      <p>Forensic visualizer for tokenizer, attention, logit lens, and sampling — all in your browser.</p>
    </div>
    <div class="panel"><img src="${dataUrl}" alt="" /></div>
  </div>
</body></html>`);
  await composer.waitForLoadState("networkidle");
  const out = resolve(ASSETS_DIR, "og.png");
  await composer.screenshot({ path: out, clip: { x: 0, y: 0, width: 1200, height: 630 } });
  await ctx.close();
  console.log(`[capture] Wrote ${out}`);
}

async function main(): Promise<void> {
  await ensureAssets();

  const previewProc = await startPreview();
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 2400, height: 1600 },
      deviceScaleFactor: 1,
      colorScheme: "dark",
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => console.error("[page error]", e));
    page.on("console", (m) => {
      if (m.type() === "error") console.error("[page console]", m.text());
    });

    console.log(`[capture] Navigating to ${TARGET_URL}`);
    await page.goto(TARGET_URL, { waitUntil: "domcontentloaded" });
    await waitForAnalysis(page);
    await toggleAllFour(page);
    // Re-wait so the freshly-mounted panels finish their first paint.
    await waitForAnalysis(page);

    await captureHero(page);
    await captureOg(page);

    // Tiny manifest so the operator can see what was captured.
    await writeFile(
      resolve(ASSETS_DIR, "capture.manifest.json"),
      JSON.stringify(
        {
          capturedAt: new Date().toISOString(),
          prompt: IOI_PROMPT,
          url: TARGET_URL,
          viewport: { width: 2400, height: 1600 },
          artifacts: ["hero-xray.png", "og.png"],
        },
        null,
        2
      )
    );

    await context.close();
  } finally {
    await browser.close();
    if (previewProc) {
      previewProc.kill("SIGTERM");
    }
  }
  console.log("[capture] Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
