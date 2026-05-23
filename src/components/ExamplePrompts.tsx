// Phase 4 — 10 forensic-interesting prompts. Captions describe what we EXPECT
// each prompt to surface once Phase 2.5 lights the attention + logit-lens
// panels. They are framed as predictions, not assertions, so users can
// verify (anti-fabrication rule #5). The launch checklist re-confirms each
// caption against the live run before publication.

export interface ExamplePrompt {
  title: string;
  prompt: string;
  blurb: string;
}

export const EXAMPLES: ExamplePrompt[] = [
  {
    title: "IOI — John & Mary",
    prompt: "John and Mary went to the shop. John gave Mary a",
    blurb: "Indirect Object Identification — the canonical interp benchmark.",
  },
  {
    title: "Country capitals",
    prompt: "The capital of France is",
    blurb: "Simple factual recall — watch where it crystallizes.",
  },
  {
    title: "Induction A·B·A",
    prompt: "A B C D A B C",
    blurb: "Induction-head signature should fire on the repeated suffix.",
  },
  {
    title: "Repeated 'the'",
    prompt: "The the the the the the the the the",
    blurb: "What does sampling do when one token dominates context?",
  },
  {
    title: "Code completion",
    prompt: "def fibonacci(n):\n    if n <= 1:\n        return",
    blurb: "Indentation + syntactic prior. Watch tokenization of whitespace.",
  },
  {
    title: "Math",
    prompt: "2 + 2 =",
    blurb: "Tiny arithmetic prompt. Does '4' really win?",
  },
  {
    title: "Lowercase trap",
    prompt: "the capital of france is",
    blurb: "Compare against the cased version — different tokenization, different ranking.",
  },
  {
    title: "Negation",
    prompt: "Paris is not the capital of",
    blurb: "Does negation surface late or early?",
  },
  {
    title: "Translation",
    prompt: "English: hello\nFrench:",
    blurb: "Few-shot pattern. Look for the colon-attractor head.",
  },
  {
    title: "Multi-token name",
    prompt: "Albert Einstein was a famous",
    blurb: "Compound entity. Surprising-boundary on 'Einstein'?",
  },
];

interface Props {
  onPick: (prompt: string) => void;
  busy: boolean;
}

export function ExamplePromptsGallery({ onPick, busy }: Props) {
  return (
    <div>
      <h2 className="mb-2 text-xs uppercase tracking-wider text-ink-300">
        Try one of these
      </h2>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {EXAMPLES.map((ex) => (
          <button
            key={ex.title}
            type="button"
            disabled={busy}
            onClick={() => onPick(ex.prompt)}
            className="group rounded-lg border border-ink-700 bg-ink-900/40 p-3 text-left transition hover:border-accent-400/60 hover:bg-ink-800/60 disabled:opacity-50"
          >
            <div className="text-xs font-semibold text-accent-300">{ex.title}</div>
            <div className="mt-1 font-mono text-[11px] text-ink-200 line-clamp-2 whitespace-pre">
              {ex.prompt}
            </div>
            <div className="mt-2 text-[11px] text-ink-300 line-clamp-2">{ex.blurb}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
