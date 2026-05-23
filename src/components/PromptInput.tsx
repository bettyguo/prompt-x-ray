import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { isMac } from "../lib/platform";

export interface PromptInputHandle {
  focus: () => void;
  setText: (text: string) => void;
}

interface PromptInputProps {
  initialValue?: string;
  busy: boolean;
  onAnalyze: (text: string) => void;
  onCancel?: () => void;
}

const PLACEHOLDER =
  'Paste a prompt. e.g.  "John and Mary went to the shop. John gave Mary a"';

export const PromptInput = forwardRef<PromptInputHandle, PromptInputProps>(function PromptInput(
  { initialValue = "", busy, onAnalyze, onCancel },
  ref
) {
  const [text, setText] = useState(initialValue);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setText(initialValue);
  }, [initialValue]);

  useImperativeHandle(ref, () => ({
    focus: () => {
      taRef.current?.focus();
      taRef.current?.select();
    },
    setText: (t: string) => {
      setText(t);
      // Defer focus until after the state update flushes.
      queueMicrotask(() => taRef.current?.focus());
    },
  }), []);

  const submit = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    onAnalyze(trimmed);
  }, [text, busy, onAnalyze]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Swallow Cmd/Ctrl+Enter while an IME is composing a glyph — committing a
    // half-typed candidate as a prompt is worse than missing the shortcut.
    if (e.nativeEvent.isComposing) return;
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="rounded-xl border border-ink-700 bg-ink-900/60 p-3 backdrop-blur-sm">
      <label htmlFor="prompt-input" className="sr-only">
        Prompt to analyze
      </label>
      <textarea
        id="prompt-input"
        ref={taRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={PLACEHOLDER}
        rows={3}
        spellCheck={false}
        className="w-full resize-y rounded-md border border-ink-700 bg-ink-950 px-3 py-2 font-mono text-sm text-ink-100 placeholder:text-ink-400 focus:border-accent-400 focus:outline-none focus:ring-2 focus:ring-accent-400/40"
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="text-xs text-ink-300">
          <kbd className="rounded border border-ink-600 bg-ink-800 px-1.5 py-0.5 font-mono text-[10px] text-ink-200">
            {isMac() ? "⌘" : "Ctrl"}
          </kbd>{" "}
          +{" "}
          <kbd className="rounded border border-ink-600 bg-ink-800 px-1.5 py-0.5 font-mono text-[10px] text-ink-200">
            Enter
          </kbd>{" "}
          to analyze · everything runs in your browser
        </p>
        <div className="flex items-center gap-2">
          {busy && onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md border border-ink-600 bg-ink-800 px-3 py-1.5 text-xs font-medium text-ink-200 hover:border-ink-500 hover:bg-ink-700"
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            onClick={submit}
            disabled={busy || !text.trim()}
            className="rounded-md bg-accent-500 px-4 py-1.5 text-xs font-semibold text-ink-950 shadow-sm transition hover:bg-accent-400 disabled:cursor-not-allowed disabled:bg-ink-700 disabled:text-ink-400"
          >
            {busy ? "Analyzing…" : "Analyze"}
          </button>
        </div>
      </div>
    </div>
  );
});
