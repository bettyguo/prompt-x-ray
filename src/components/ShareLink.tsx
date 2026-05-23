import { useEffect, useMemo, useState } from "react";
import { buildShareUrl, encodePromptToUrl } from "../lib/urlState";

interface Props {
  prompt: string | null;
}

export function ShareLink({ prompt }: Props) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);

  // Detect ahead of time whether the prompt is too long to encode and whether
  // we're in a context where the clipboard API will actually work — the user
  // shouldn't have to click to discover either.
  const { encodable, secure, encodeError } = useMemo(() => {
    if (!prompt) return { encodable: false, secure: false, encodeError: null as string | null };
    const sec = typeof window !== "undefined" && window.isSecureContext;
    try {
      encodePromptToUrl(prompt);
      return { encodable: true, secure: sec, encodeError: null };
    } catch (e) {
      return {
        encodable: false,
        secure: sec,
        encodeError: e instanceof Error ? e.message : "prompt too long to share",
      };
    }
  }, [prompt]);

  if (!prompt) return null;

  const disabled = !encodable || !secure;
  const disabledLabel = !secure
    ? "Copy needs HTTPS"
    : encodeError ?? "Prompt too long to share";

  const onClick = async () => {
    if (disabled) return;
    setError(null);
    try {
      const url = buildShareUrl(prompt);
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "copy failed");
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        title={disabled ? disabledLabel : undefined}
        className={
          "rounded-md border border-ink-600 bg-ink-800 px-3 py-1.5 text-xs font-medium text-ink-200 transition hover:border-accent-400 hover:text-accent-300 disabled:cursor-not-allowed disabled:border-ink-700 disabled:text-ink-400 disabled:hover:border-ink-700 disabled:hover:text-ink-400 " +
          (copied ? "pxray-flash" : "")
        }
      >
        {copied ? "Link copied ✓" : disabled ? disabledLabel : "Copy share link"}
      </button>
      {error && <span className="text-xs text-danger-400">{error}</span>}
    </div>
  );
}
