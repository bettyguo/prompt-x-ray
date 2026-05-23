// Shared "this panel can't render real data yet" note. Used by AttentionPanel
// and LayerPanel; ensures the user-facing copy stays consistent and avoids the
// jargon "Awaiting Phase 2.5" leaking into the UI without context.

import type { ReactNode } from "react";

interface CapabilityNoteProps {
  /** Short label for the missing capability, e.g. "attentions" / "hidden states". */
  what: string;
  children?: ReactNode;
}

export function CapabilityNote({ what, children }: CapabilityNoteProps) {
  return (
    <p className="mt-3 rounded-md border border-warn-400/30 bg-warn-400/5 px-3 py-2 text-xs text-warn-400">
      <span className="font-semibold">Not yet available</span>
      <span className="text-ink-200">
        {" "}— GPT-2's default ONNX export doesn't expose {what}. We're shipping
        a custom export; this panel will populate once it lands.
      </span>
      {children && <span className="text-ink-200"> {children}</span>}
    </p>
  );
}
