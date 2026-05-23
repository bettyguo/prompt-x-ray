import { useMemo } from "react";
import * as d3 from "d3";
import { Panel } from "./Panel";
import { CapabilityNote } from "./CapabilityNote";
import { axis, useActivePosition } from "../state/axis";
import type { LogitLensCell, PromptAnalysis } from "../types";

interface Props {
  analysis: PromptAnalysis | null;
}

const LAYERS = 12;

export function LayerPanel({ analysis }: Props) {
  const positions = analysis?.tokens.length ?? 8;
  const unavailable = analysis?.warnings.includes("hidden-states-unavailable");
  const active = useActivePosition();

  const cellByLayerPos: (LogitLensCell | null)[][] = useMemo(() => {
    const grid: (LogitLensCell | null)[][] = Array.from({ length: LAYERS }, () =>
      Array.from({ length: positions }, () => null)
    );
    if (analysis) {
      for (const c of analysis.logit_lens) {
        if (c.layer < LAYERS && c.position < positions) {
          grid[c.layer][c.position] = c;
        }
      }
    }
    return grid;
  }, [analysis, positions]);

  const probScale = d3.scaleLinear<string>()
    .domain([0, 1])
    .range(["var(--color-ink-800)", "#2dd4bf"]);

  const subtitle = unavailable
    ? "Hidden states not exposed by the default ONNX export (awaiting Phase 2.5)."
    : "Top-1 prediction at each (layer × position). Cell brightness = probability. Watch the prediction crystallize.";

  return (
    <Panel
      id="layer"
      title="Layer panel — logit lens"
      subtitle={subtitle}
      right={
        analysis ? <span>L0 → L{LAYERS - 1} · {positions} pos</span> : <span>{LAYERS} layers</span>
      }
    >
      <div className="grid grid-cols-[auto_1fr] gap-2">
        <div className="flex flex-col-reverse justify-between pr-1 text-[9px] font-mono text-ink-300">
          {Array.from({ length: LAYERS }).map((_, l) => (
            <span key={l} className="leading-none">L{l}</span>
          ))}
        </div>
        <div className="overflow-x-auto">
          <div
            className="grid gap-px rounded-md bg-ink-700 min-w-fit"
            style={{ gridTemplateColumns: `repeat(${positions}, minmax(28px, 1fr))` }}
          >
            {/* render from top (L11) to bottom (L0) so visual stacking matches transformer depth */}
            {Array.from({ length: LAYERS }).flatMap((_, lFromTop) => {
              const layer = LAYERS - 1 - lFromTop;
              return Array.from({ length: positions }).map((_, pos) => {
                const cell = cellByLayerPos[layer]?.[pos];
                const top = cell?.top_predictions[0];
                const bg = top ? probScale(top.prob) : "var(--color-ink-900)";
                const isColActive = active === pos;
                return (
                  <button
                    type="button"
                    key={`${layer}-${pos}`}
                    className={
                      "aspect-[3/2] flex items-center justify-center px-1 text-[9px] font-mono leading-none transition " +
                      (isColActive ? "outline outline-1 outline-accent-400 z-10 relative " : "")
                    }
                    style={{ backgroundColor: bg, color: top ? "#0b1220" : "var(--color-ink-400)" }}
                    onMouseEnter={() => axis.setHover(pos)}
                    onMouseLeave={() => axis.setHover(null)}
                    onClick={() => axis.togglePosition(pos)}
                    title={
                      cell
                        ? `L${layer} pos ${pos}\n` +
                          cell.top_predictions
                            .map((p) => `${displayToken(p.token)} ${(p.prob * 100).toFixed(1)}%`)
                            .join("\n")
                        : `L${layer} pos ${pos}`
                    }
                  >
                    {top ? truncate(displayToken(top.token), 4) : ""}
                  </button>
                );
              });
            })}
          </div>
          <div
            className="mt-1 grid text-[9px] font-mono text-ink-300"
            style={{ gridTemplateColumns: `repeat(${positions}, minmax(28px, 1fr))` }}
          >
            {Array.from({ length: positions }).map((_, p) => {
              const isColActive = active === p;
              return (
                <span key={p} className="relative text-center pt-1">
                  <span
                    aria-hidden
                    className={
                      "absolute left-1/2 -translate-x-1/2 top-0 h-[2px] w-3/4 rounded-full bg-accent-400 transition-opacity duration-150 ease-out " +
                      (isColActive ? "opacity-100" : "opacity-0")
                    }
                  />
                  <span className={isColActive ? "text-accent-300" : undefined}>{p}</span>
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {unavailable && <CapabilityNote what="intermediate hidden states" />}
      {!analysis && !unavailable && (
        <p className="mt-3 text-xs text-ink-300">
          Each cell will show the top-3 predicted next tokens after that layer at that position.
        </p>
      )}
    </Panel>
  );
}

function displayToken(t: string): string {
  if (t.startsWith(" ")) return "·" + t.slice(1);
  if (t === "\n") return "↵";
  return t;
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}
