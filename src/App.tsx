import { useCallback, useEffect, useRef, useState } from "react";
import { PromptInput, type PromptInputHandle } from "./components/PromptInput";
import { TokenizerPanel } from "./components/TokenizerPanel";
import { AttentionPanel } from "./components/AttentionPanel";
import { LayerPanel } from "./components/LayerPanel";
import { SamplingPanel } from "./components/SamplingPanel";
import { ShareLink } from "./components/ShareLink";
import { ExamplePromptsGallery } from "./components/ExamplePrompts";
import { ModelStatus } from "./components/ModelStatus";
import { ExportJson } from "./components/ExportJson";
import { KeyboardHints } from "./components/KeyboardHints";
import {
  readPromptFromLocation,
  writePromptToLocation,
  clearPromptFromLocation,
} from "./lib/urlState";
import { analyzePrompt } from "./lib/analyzePrompt";
import { useAxisReset } from "./state/axis";
import type { PromptAnalysis } from "./types";

type ViewMode = "default" | "all";
type SideTab = "attention" | "sampling";

const MAX_TOKENS = 256;

export function App() {
  const [analysis, setAnalysis] = useState<PromptAnalysis | null>(null);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("default");
  const [sideTab, setSideTab] = useState<SideTab>("attention");
  const [initialPrompt, setInitialPrompt] = useState<string>("");
  const [liveMessage, setLiveMessage] = useState<string>("");
  const inputRef = useRef<PromptInputHandle | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const didHydrateRef = useRef(false);
  const headerRef = useRef<HTMLElement | null>(null);

  // Add data-scrolled to the sticky header so it can lift visually once the
  // page starts scrolling. Cheap passive scroll listener; raf-throttle would be
  // overkill at this DOM size.
  useEffect(() => {
    const update = () => {
      const el = headerRef.current;
      if (!el) return;
      if (window.scrollY > 0) {
        el.setAttribute("data-scrolled", "true");
      } else {
        el.removeAttribute("data-scrolled");
      }
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  useAxisReset(analysis);

  const runAnalyze = useCallback(
    async (text: string, opts: { fromUrl?: boolean } = {}) => {
      // Cancel any in-flight run before starting a new one.
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      setBusy(true);
      setError(null);
      try {
        const result = await analyzePrompt(text, { signal: ctrl.signal });
        if (ctrl.signal.aborted) return;
        setAnalysis(result);
        setPrompt(text);
        setLiveMessage(
          `Analyzed ${result.tokens.length} tokens in ${result.computeMs} ms.`
        );
        if (!opts.fromUrl) writePromptToLocation(text);
      } catch (e) {
        if ((e as { name?: string })?.name === "AbortError") return;
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        setAnalysis(null);
        setPrompt(text);
      } finally {
        if (abortRef.current === ctrl) {
          setBusy(false);
          abortRef.current = null;
        }
      }
    },
    []
  );

  const cancelAnalyze = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
  }, []);

  // Hydrate ?prompt= on first paint. Guarded so StrictMode double-mount
  // doesn't kick two analyses.
  useEffect(() => {
    if (didHydrateRef.current) return;
    didHydrateRef.current = true;
    const p = readPromptFromLocation();
    if (p) {
      setInitialPrompt(p);
      void runAnalyze(p, { fromUrl: true });
    }
  }, [runAnalyze]);

  const onFork = useCallback(
    (token: string) => {
      if (!prompt || busy || !token) return;
      // Pre-check the 256-token cap so we don't hand a guaranteed failure to
      // the analyzer. We approximate via the current token count + 1; if the
      // fork token tokenizes to more than one piece, analyzePrompt's own check
      // still catches it and surfaces a friendly error.
      if (analysis && analysis.tokens.length >= MAX_TOKENS) {
        setError(
          `Prompt is already at the ${MAX_TOKENS}-token cap; clear it or shorten before forking.`
        );
        return;
      }
      const extended = prompt + token;
      inputRef.current?.setText(extended);
      void runAnalyze(extended);
    },
    [prompt, busy, analysis, runAnalyze]
  );

  const onClear = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setAnalysis(null);
    setPrompt(null);
    setError(null);
    setInitialPrompt("");
    clearPromptFromLocation();
  };

  const focusPrompt = useCallback(() => inputRef.current?.focus(), []);

  return (
    <div className="min-h-full">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-accent-500 focus:px-3 focus:py-1.5 focus:text-xs focus:font-semibold focus:text-ink-950"
      >
        Skip to main content
      </a>
      <header
        ref={headerRef}
        className="app-header border-b border-ink-800 bg-ink-950/80 backdrop-blur sticky top-0 z-10 transition-shadow duration-150 ease-out"
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <Logo />
            <div>
              <h1 className="text-sm font-semibold text-ink-100">prompt-x-ray</h1>
              <p className="text-[11px] text-ink-300">
                forensic visualization of language-model processing
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <ModelStatus />
            <KeyboardHints onFocusPrompt={focusPrompt} />
            <a
              href="https://github.com/openproblems-labs/prompt-x-ray"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-ink-300 hover:text-accent-300"
            >
              GitHub
            </a>
          </div>
        </div>
      </header>

      <main
        id="main"
        aria-busy={busy || undefined}
        className="mx-auto max-w-7xl space-y-4 px-4 py-6"
      >
        <PromptInput
          ref={inputRef}
          initialValue={initialPrompt}
          busy={busy}
          onAnalyze={(t) => void runAnalyze(t)}
          onCancel={cancelAnalyze}
        />

        {error && (
          <div className="rounded-md border border-danger-400/40 bg-danger-400/10 px-4 py-3 text-xs text-danger-400">
            <div className="font-semibold">Analysis failed</div>
            <div className="mt-1 font-mono">{error}</div>
          </div>
        )}

        {!analysis && !busy && !error && (
          <ExamplePromptsGallery onPick={(t) => void runAnalyze(t)} busy={busy} />
        )}

        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="inline-flex rounded-md border border-ink-700 bg-ink-900/50 p-0.5 text-xs">
            <ViewToggle
              label="Default"
              hint="Tokenizer + Logit Lens, Attention/Sampling in side tab"
              active={view === "default"}
              onClick={() => setView("default")}
            />
            <ViewToggle
              label="All four"
              hint="Power view"
              active={view === "all"}
              onClick={() => setView("all")}
            />
          </div>
          <div className="flex items-center gap-3">
            {analysis && (
              <span className="text-[11px] text-ink-300">
                {analysis.fromCache ? "from cache · " : "computed in "}
                <span className="text-ink-100">{analysis.computeMs} ms</span>
                {" · "}
                <span className="text-ink-100">{analysis.tokens.length}</span> tokens
              </span>
            )}
            <ExportJson analysis={analysis} />
            <ShareLink prompt={prompt} />
            {analysis && (
              <button
                type="button"
                onClick={onClear}
                className="text-xs text-ink-300 hover:text-ink-100"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {view === "default" ? (
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-4">
              <TokenizerPanel analysis={analysis} />
              <LayerPanel analysis={analysis} />
            </div>
            <aside className="space-y-2">
              <div className="inline-flex rounded-md border border-ink-700 bg-ink-900/50 p-0.5 text-xs">
                <ViewToggle
                  label="Attention"
                  active={sideTab === "attention"}
                  onClick={() => setSideTab("attention")}
                />
                <ViewToggle
                  label="Sampling"
                  active={sideTab === "sampling"}
                  onClick={() => setSideTab("sampling")}
                />
              </div>
              {sideTab === "attention" ? (
                <AttentionPanel analysis={analysis} />
              ) : (
                <SamplingPanel analysis={analysis} onFork={onFork} />
              )}
            </aside>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <TokenizerPanel analysis={analysis} />
            <AttentionPanel analysis={analysis} />
            <LayerPanel analysis={analysis} />
            <SamplingPanel analysis={analysis} onFork={onFork} />
          </div>
        )}

        <Footer />
      </main>

      <div role="status" aria-live="polite" className="sr-only">
        {liveMessage}
      </div>
    </div>
  );
}

function ViewToggle({
  label,
  hint,
  active,
  onClick,
}: {
  label: string;
  hint?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-md px-2.5 py-1 transition " +
        (active
          ? "bg-accent-500 text-ink-950 font-semibold"
          : "text-ink-300 hover:text-ink-100")
      }
      title={hint}
    >
      {label}
    </button>
  );
}

function Logo() {
  return (
    <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden>
      <rect width="32" height="32" rx="6" fill="#0f172a" />
      <g stroke="#2dd4bf" strokeWidth="2" strokeLinecap="round" fill="none">
        <path d="M8 8h6v6" />
        <path d="M24 8h-6v6" />
        <path d="M8 24h6v-6" />
        <path d="M24 24h-6v-6" />
      </g>
      <circle cx="16" cy="16" r="2" fill="#2dd4bf" />
    </svg>
  );
}

function Footer() {
  return (
    <footer className="mt-8 border-t border-ink-800 pt-4 text-xs text-ink-300">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>Runs in your browser. No prompts leave your device.</span>
        <a
          className="text-accent-300 hover:underline"
          href="https://github.com/openproblems-labs/prompt-x-ray/blob/main/HOW-TO-READ.md"
        >
          How to read each panel →
        </a>
      </p>
    </footer>
  );
}
