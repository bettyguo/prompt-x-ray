import { useMemo, useState } from "react";
import * as d3 from "d3";
import { Panel } from "./Panel";
import { CapabilityNote } from "./CapabilityNote";
import { useActivePosition } from "../state/axis";
import type { HeadAttention, PromptAnalysis } from "../types";

interface Props {
  analysis: PromptAnalysis | null;
}

const LAYERS = 12;
const HEADS = 12;

export function AttentionPanel({ analysis }: Props) {
  const unavailable = analysis?.warnings.includes("attentions-unavailable");
  const [hovered, setHovered] = useState<{ layer: number; head: number } | null>(null);

  // Build a 12×12 matrix of {entropy, interesting} for the summary grid.
  // Memoized so we don't rebuild on every hover.
  const grid = useMemo<(HeadAttention | null)[][]>(() => {
    const g: (HeadAttention | null)[][] = Array.from({ length: LAYERS }, () =>
      Array.from({ length: HEADS }, () => null)
    );
    if (!analysis) return g;
    for (const layerRow of analysis.attention) {
      for (const h of layerRow) {
        g[h.layer][h.head] = h;
      }
    }
    return g;
  }, [analysis]);

  // Map entropy to color; lower entropy → brighter accent. Max entropy is
  // bounded above by ln(positions), so use that rather than a magic 4.
  const positions = analysis?.tokens.length ?? 2;
  const entropyColor = useMemo(
    () =>
      d3
        .scaleLinear<string>()
        .domain([0, Math.log(Math.max(2, positions))])
        .range(["#2dd4bf", "#1b2740"])
        .clamp(true),
    [positions]
  );

  // TODO(phase-2.5): when real attention lands, the unavailable branch goes
  // away and the cells will hold actual entropy values.
  const subtitle = unavailable
    ? "Attentions not exposed by the default ONNX export (awaiting Phase 2.5)."
    : "12×12 head summary. Brighter cells have lower entropy (sharper focus). Auto-flagged heads get a teal ring.";

  return (
    <Panel
      id="attention"
      title="Attention"
      subtitle={subtitle}
      right={<span>{LAYERS} layers · {HEADS} heads</span>}
    >
      <div className="grid grid-cols-[auto_1fr] gap-2">
        <div className="flex flex-col justify-around pr-1 text-[9px] font-mono text-ink-300">
          {Array.from({ length: LAYERS }).map((_, l) => (
            <span key={l}>L{l}</span>
          ))}
        </div>
        <div
          className="grid gap-[2px] rounded-md border border-ink-700 bg-ink-900 p-1"
          style={{ gridTemplateColumns: `repeat(${HEADS}, minmax(0, 1fr))` }}
        >
          {grid.flatMap((row, layer) =>
            row.map((cell, head) => {
              const fill = cell ? entropyColor(cell.entropy) : "var(--color-ink-800)";
              const ring = cell?.interesting ? "outline outline-1 outline-accent-400" : "";
              return (
                <div
                  key={`${layer}-${head}`}
                  className={"aspect-square rounded-sm hover:outline hover:outline-1 hover:outline-accent-400/40 " + ring}
                  style={{ backgroundColor: fill }}
                  onMouseEnter={() => setHovered({ layer, head })}
                  onMouseLeave={() => setHovered(null)}
                  title={
                    cell
                      ? `L${layer} H${head} · entropy ${cell.entropy.toFixed(2)}` +
                        (cell.interesting_reasons.length
                          ? "\n" + cell.interesting_reasons.join(", ")
                          : "")
                      : `L${layer} H${head}`
                  }
                />
              );
            })
          )}
        </div>
        <div />
        <div className="flex justify-around pl-0 pr-0 text-[9px] font-mono text-ink-300">
          {Array.from({ length: HEADS }).map((_, h) => (
            <span key={h}>H{h}</span>
          ))}
        </div>
      </div>

      <HeadDetail
        analysis={analysis}
        hovered={hovered}
        unavailable={!!unavailable}
      />

      {unavailable && <CapabilityNote what="attentions" />}
      {!analysis && !unavailable && (
        <p className="mt-3 text-xs text-ink-300">
          Attention heatmaps will appear here after analysis.
        </p>
      )}
    </Panel>
  );
}

function HeadDetail({
  analysis,
  hovered,
  unavailable,
}: {
  analysis: PromptAnalysis | null;
  hovered: { layer: number; head: number } | null;
  unavailable: boolean;
}) {
  // Reserve vertical space so the panel layout never shifts as hover toggles
  // between hint text and heatmap. The 12em floor matches the heatmap card's
  // visual footprint within a 280-px-tall SVG plus header chrome.
  const head = hovered && !unavailable ? analysis?.attention[hovered.layer]?.[hovered.head] : null;
  const showHeatmap = !!hovered && !!analysis && !!head && !unavailable;

  return (
    <div className="mt-3" style={{ minHeight: "12em" }}>
      {!hovered || !analysis ? (
        <p className="text-[11px] text-ink-300 transition-opacity duration-100 ease-out opacity-100">
          Hover a cell above to inspect a single head. <ActivePositionHint />
        </p>
      ) : !head || unavailable ? (
        <p className="text-[11px] text-ink-300 transition-opacity duration-100 ease-out opacity-100">
          L{hovered.layer} H{hovered.head} — attention values not available yet (see note below).
        </p>
      ) : null}
      {showHeatmap && head && hovered && (
        <HeadHeatmap layer={hovered.layer} head={hovered.head} weights={head.weights} entropy={head.entropy} interesting={head.interesting} />
      )}
    </div>
  );
}

function HeadHeatmap({
  layer,
  head,
  weights,
  entropy,
  interesting,
}: {
  layer: number;
  head: number;
  weights: number[][];
  entropy: number;
  interesting: boolean;
}) {
  const n = weights.length;
  const cell = 280 / Math.max(n, 1);
  const fill = d3.scaleSequential(d3.interpolateViridis).domain([0, 1]);

  return (
    <div
      key={`${layer}-${head}`}
      className="rounded-md border border-ink-700 bg-ink-900 p-3 transition-opacity duration-100 ease-out animate-[head-fade-in_100ms_ease-out]"
    >
      <div className="mb-1 flex items-center justify-between text-[11px] text-ink-300">
        <span>L{layer} H{head}</span>
        <span>entropy {entropy.toFixed(2)}{interesting && " · interesting"}</span>
      </div>
      <svg
        width={cell * n}
        height={cell * n}
        role="img"
        aria-label={`Attention heatmap for layer ${layer} head ${head}`}
      >
        {weights.map((row, i) =>
          row.map((w, j) => (
            <rect
              key={`${i}-${j}`}
              x={j * cell}
              y={i * cell}
              width={cell}
              height={cell}
              fill={fill(w)}
            />
          ))
        )}
      </svg>
    </div>
  );
}

/** Tiny isolated subscriber to the shared axis so HeadDetail itself doesn't
 *  re-render on every hover unless it's actually showing a value. */
function ActivePositionHint() {
  const active = useActivePosition();
  if (active === null) return null;
  return (
    <>Position <span className="text-ink-100">{active}</span> is selected.</>
  );
}
