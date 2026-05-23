import { useEffect, useRef, useState } from "react";
import { isMac } from "../lib/platform";

const STORAGE_KEY = "pxray.onboarded.v1";

interface Props {
  /** Called when the user presses "/" outside any input — App refocuses the prompt textarea. */
  onFocusPrompt: () => void;
}

export function KeyboardHints({ onFocusPrompt }: Props) {
  const [open, setOpen] = useState(false);
  const [showFirstVisit, setShowFirstVisit] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const gotItRef = useRef<HTMLButtonElement | null>(null);
  // Track the element that opened the dialog so we can restore focus on close
  // even if the user opened via the global "?" hotkey (not the trigger button).
  const lastFocusRef = useRef<HTMLElement | null>(null);

  // When the dialog opens, capture the previously-focused element, move focus
  // to the primary action, and trap Tab inside the dialog. On close, restore.
  useEffect(() => {
    if (!open) return;
    lastFocusRef.current = (document.activeElement as HTMLElement | null) ?? null;
    queueMicrotask(() => gotItRef.current?.focus());

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const root = dialogRef.current;
      if (!root) return;
      const focusable = root.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !root.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      const prev = lastFocusRef.current;
      if (prev && document.contains(prev)) {
        prev.focus();
      } else {
        triggerRef.current?.focus();
      }
    };
  }, [open]);

  // Show the onboarding hint once.
  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setShowFirstVisit(true);
    } catch {
      // localStorage might be disabled; that's fine.
    }
  }, []);

  // Global hotkeys: "?" toggles help, "/" focuses prompt. Ignore when typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (isTyping) return;
      if (e.key === "?") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "/") {
        e.preventDefault();
        onFocusPrompt();
      } else if (e.key === "Escape") {
        setOpen(false);
        setShowFirstVisit(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onFocusPrompt]);

  const dismissFirstVisit = () => {
    setShowFirstVisit(false);
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ignore
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rounded-full border border-ink-700 bg-ink-900/60 px-2 py-1 text-[11px] text-ink-300 hover:border-accent-400 hover:text-accent-300"
        title="Keyboard shortcuts (press ?)"
        aria-label="Keyboard shortcuts"
      >
        ?
      </button>

      {open && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-ink-950/70 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            ref={dialogRef}
            className="w-full max-w-sm rounded-xl border border-ink-700 bg-ink-900 p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="keyboard-hints-title"
            aria-describedby="keyboard-hints-desc"
          >
            <h2
              id="keyboard-hints-title"
              className="text-sm font-semibold text-ink-100"
            >
              Keyboard shortcuts
            </h2>
            <ul className="mt-3 space-y-2 text-xs text-ink-200">
              <Row keys={["/"]} label="Focus prompt input" />
              <Row keys={[isMac() ? "⌘" : "Ctrl", "Enter"]} label="Analyze" />
              <Row keys={["?"]} label="Toggle this help" />
              <Row keys={["Esc"]} label="Close help" />
            </ul>
            <p
              id="keyboard-hints-desc"
              className="mt-4 text-[11px] text-ink-300"
            >
              Tip: hover any token in the Tokenizer or Layer panel to highlight that position across all panels.
            </p>
            <button
              ref={gotItRef}
              type="button"
              onClick={() => setOpen(false)}
              className="mt-4 w-full rounded-md bg-accent-500 px-3 py-1.5 text-xs font-semibold text-ink-950 hover:bg-accent-400"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {showFirstVisit && !open && (
        <div className="fixed bottom-4 right-4 z-20 max-w-xs rounded-lg border border-accent-400/40 bg-ink-900/95 p-3 shadow-lg">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs text-ink-100">
              <span className="font-semibold text-accent-300">First time here?</span>{" "}
              Paste a prompt or pick an example. Hover tokens to highlight across panels. Press{" "}
              <kbd className="rounded border border-ink-600 bg-ink-800 px-1 text-[10px] text-ink-200">
                ?
              </kbd>{" "}
              for shortcuts.
            </p>
            <button
              type="button"
              onClick={dismissFirstVisit}
              className="text-ink-300 hover:text-ink-100"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function Row({ keys, label }: { keys: string[]; label: string }) {
  return (
    <li className="flex items-center justify-between gap-3">
      <span>{label}</span>
      <span className="flex items-center gap-1">
        {keys.map((k, i) => (
          <kbd
            key={i}
            className="rounded border border-ink-600 bg-ink-800 px-1.5 py-0.5 font-mono text-[10px] text-ink-200"
          >
            {k}
          </kbd>
        ))}
      </span>
    </li>
  );
}
