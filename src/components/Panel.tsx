import type { ReactNode } from "react";

interface EmptyStateProps {
  /** Optional height class (e.g. "h-24", "h-40"). Defaults to h-24 to keep
   *  empty panels compact without causing post-analysis layout shift. */
  heightClass?: string;
  children: ReactNode;
}

/**
 * Shared dashed-border empty-state placeholder. Used by TokenizerPanel and
 * SamplingPanel; LayerPanel/AttentionPanel deliberately render their grids
 * in skeleton form instead so the user sees the eventual shape immediately.
 */
export function EmptyState({ heightClass = "h-24", children }: EmptyStateProps) {
  return (
    <div
      className={
        "flex items-center justify-center rounded-md border border-dashed border-ink-700 text-xs text-ink-300 " +
        heightClass
      }
    >
      {children}
    </div>
  );
}

interface PanelProps {
  id: string;
  title: string;
  subtitle?: string;
  /** Right-aligned controls (legend, toggles, log-scale, etc.). */
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Panel({ id, title, subtitle, right, children, className }: PanelProps) {
  return (
    <section
      id={id}
      className={
        "rounded-xl border border-ink-700 bg-ink-900/60 backdrop-blur-sm " +
        "shadow-[0_0_0_1px_rgba(45,212,191,0.04)] overflow-hidden " +
        (className ?? "")
      }
    >
      <header className="flex items-baseline justify-between gap-4 border-b border-ink-700 bg-ink-900/40 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold tracking-wide text-ink-100">
            {title}
          </h2>
          {subtitle && (
            <p className="text-xs text-ink-300 mt-0.5">{subtitle}</p>
          )}
        </div>
        {right && <div className="flex items-center gap-2 text-xs text-ink-300">{right}</div>}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}
