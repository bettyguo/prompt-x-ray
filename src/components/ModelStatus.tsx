import { useEffect, useState } from "react";
// Import from the lightweight progress module rather than `modelLoader`, so
// this component doesn't transitively pull `@huggingface/transformers` into
// the main bundle chunk. The heavy loader is lazy-imported inside
// `analyzePrompt`.
import { onLoadProgress, type LoadProgress } from "../lib/modelProgress";

export function ModelStatus() {
  const [p, setP] = useState<LoadProgress>({ stage: "idle" });

  useEffect(() => onLoadProgress(setP), []);

  let label: string;
  let dot: string;
  switch (p.stage) {
    case "idle":
      label = "Model: not yet loaded";
      dot = "bg-ink-500";
      break;
    case "downloading":
      label = `Downloading ${p.file} · ${Math.round(p.pct)}%`;
      dot = "bg-warn-400";
      break;
    case "initializing":
      label = "Initializing model…";
      dot = "bg-warn-400 animate-pulse";
      break;
    case "ready":
      label = "GPT-2 small · ready, in-browser";
      dot = "bg-accent-400";
      break;
    case "error":
      label = `Error: ${p.message}`;
      dot = "bg-danger-400";
      break;
  }

  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-ink-700 bg-ink-900/60 px-3 py-1 text-xs text-ink-300">
      <span className={"inline-block h-2 w-2 rounded-full " + dot} aria-hidden />
      <span>{label}</span>
    </div>
  );
}
