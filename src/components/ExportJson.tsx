import { useState } from "react";
import type { PromptAnalysis } from "../types";

interface Props {
  analysis: PromptAnalysis | null;
}

export function ExportJson({ analysis }: Props) {
  const [error, setError] = useState<string | null>(null);
  if (!analysis) return null;

  const onClick = () => {
    setError(null);
    // Filename intentionally does NOT include any prompt text — download
    // histories and screenshot leaks should not surface the user's content.
    const ts = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .slice(0, 19);
    let url: string | null = null;
    try {
      const blob = new Blob([JSON.stringify(analysis, null, 2)], {
        type: "application/json",
      });
      url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `prompt-x-ray-${ts}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (e) {
      setError(e instanceof Error ? e.message : "export failed");
    } finally {
      // Defer revoke so the click-driven download has a chance to start.
      const u = url;
      if (u) setTimeout(() => URL.revokeObjectURL(u), 0);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        className="rounded-md border border-ink-600 bg-ink-800 px-3 py-1.5 text-xs font-medium text-ink-200 hover:border-accent-400 hover:text-accent-300"
        title="Download the full PromptAnalysis as JSON"
      >
        Export JSON
      </button>
      {error && <span className="text-xs text-danger-400">{error}</span>}
    </div>
  );
}
