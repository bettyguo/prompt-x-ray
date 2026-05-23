import { useMemo, useState } from "react";
import * as d3 from "d3";
import { EmptyState, Panel } from "./Panel";
import type { PromptAnalysis, SamplingCandidate } from "../types";

interface Props {
  analysis: PromptAnalysis | null;
  /** Called when a user clicks a candidate to "fork" — extend the prompt with that token. */
  onFork?: (token: string) => void;
}

const HEIGHT = 240;
const PADDING = { top: 16, right: 16, bottom: 36, left: 56 };

export function SamplingPanel({ analysis, onFork }: Props) {
  const [scaleKind, setScaleKind] = useState<"linear" | "log">("linear");

  // Filter to candidates with positive probability; zero/negative values would
  // create a no-op fork button and break the log scale.
  const candidates = useMemo(
    () => (analysis?.sampling ?? []).filter((c) => c.prob > 0),
    [analysis]
  );

  if (!analysis || candidates.length === 0) {
    return (
      <Panel
        id="sampling"
        title="Sampling"
        subtitle="Top-10 candidates for the position immediately after the prompt."
      >
        <EmptyState heightClass="h-40">
          Candidates will appear here after analysis.
        </EmptyState>
      </Panel>
    );
  }

  return (
    <Panel
      id="sampling"
      title="Sampling"
      subtitle="Top-10 candidates at the position immediately after the prompt. Click a bar to fork."
      right={
        <div className="inline-flex rounded-md border border-ink-700 bg-ink-900/50 p-0.5">
          <ScaleToggle
            label="linear"
            active={scaleKind === "linear"}
            onClick={() => setScaleKind("linear")}
          />
          <ScaleToggle
            label="log"
            active={scaleKind === "log"}
            onClick={() => setScaleKind("log")}
          />
        </div>
      }
    >
      <SamplingChart
        candidates={candidates}
        scaleKind={scaleKind}
        onFork={onFork}
        animKey={analysis.prompt}
      />
      <CumulativeMass candidates={candidates} />
    </Panel>
  );
}

function ScaleToggle({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-md px-2 py-0.5 text-[11px] transition " +
        (active
          ? "bg-accent-500 text-ink-950 font-semibold"
          : "text-ink-300 hover:text-ink-100")
      }
    >
      {label}
    </button>
  );
}

function SamplingChart({
  candidates,
  scaleKind,
  onFork,
  animKey,
}: {
  candidates: SamplingCandidate[];
  scaleKind: "linear" | "log";
  onFork?: (token: string) => void;
  /** Re-mount key — re-trigger the stagger-grow animation on new analysis. */
  animKey: string;
}) {
  const width = 560;
  const innerW = width - PADDING.left - PADDING.right;
  const innerH = HEIGHT - PADDING.top - PADDING.bottom;

  const { yScale, ticks } = useMemo(() => {
    if (scaleKind === "log") {
      const minProb = Math.max(1e-6, d3.min(candidates, (c) => c.prob) ?? 1e-6);
      const s = d3
        .scaleLog()
        .domain([minProb, 1])
        .range([innerH, 0])
        .clamp(true);
      return { yScale: s, ticks: s.ticks(4) };
    }
    const s = d3.scaleLinear().domain([0, 1]).range([innerH, 0]);
    return { yScale: s, ticks: s.ticks(5) };
  }, [candidates, scaleKind, innerH]);

  const xScale = useMemo(
    () =>
      d3
        .scaleBand<number>()
        .domain(candidates.map((_, i) => i))
        .range([0, innerW])
        .padding(0.18),
    [candidates, innerW]
  );

  const bandwidth = xScale.bandwidth();
  const interactive = !!onFork;

  // Horizontal scroll on small viewports keeps labels legible; on larger
  // viewports the SVG just fills the container width.
  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <svg
        viewBox={`0 0 ${width} ${HEIGHT}`}
        className="w-full"
        style={{ minWidth: 320 }}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`Top-${candidates.length} sampling candidates`}
      >
      <g transform={`translate(${PADDING.left},${PADDING.top})`}>
        {ticks.map((t, i) => (
          <g key={i} transform={`translate(0,${yScale(t)})`}>
            <line x1={0} x2={innerW} stroke="rgba(180,200,232,0.06)" />
            <text
              x={-8}
              y={3}
              textAnchor="end"
              className="fill-ink-300"
              style={{ fontSize: "0.85em", fontFamily: "var(--font-mono)" }}
            >
              {scaleKind === "log"
                ? formatLogTick(t)
                : `${Math.round(t * 100)}%`}
            </text>
          </g>
        ))}

        <g key={animKey}>
        {candidates.map((c, i) => {
          const x = xScale(i) ?? 0;
          const y = yScale(Math.max(c.prob, 1e-6));
          const h = innerH - y;
          const disabled = !c.token;
          const canFork = interactive && !disabled;
          return (
            <g
              key={i}
              transform={`translate(${x},0)`}
              role={canFork ? "button" : undefined}
              tabIndex={canFork ? 0 : undefined}
              aria-disabled={disabled || undefined}
              onClick={() => canFork && onFork?.(c.token)}
              onKeyDown={(e) => {
                if (!canFork) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onFork?.(c.token);
                }
              }}
              className={canFork ? "cursor-pointer" : undefined}
              aria-label={
                canFork
                  ? `Fork with ${displayToken(c.token)}, probability ${(c.prob * 100).toFixed(2)}%`
                  : undefined
              }
            >
              <rect
                y={y}
                width={bandwidth}
                height={Math.max(0, h)}
                rx={3}
                className={
                  "sampling-bar " +
                  (i === 0 ? "fill-accent-400" : "fill-accent-600/60") +
                  (canFork ? " hover:brightness-110" : "")
                }
                style={{
                  transformBox: "fill-box",
                  transformOrigin: "center bottom",
                  animationDelay: `${i * 25}ms`,
                }}
              >
                <title>
                  {displayToken(c.token)} · {(c.prob * 100).toFixed(2)}% · logp{" "}
                  {c.logprob.toFixed(2)}
                  {canFork ? " · click to fork" : ""}
                </title>
              </rect>
              {/* Larger transparent hit area for easier clicks on tiny bars */}
              <rect
                y={0}
                width={bandwidth}
                height={innerH}
                fill="transparent"
                pointerEvents={canFork ? "auto" : "none"}
              />
              <text
                x={bandwidth / 2}
                y={innerH + 14}
                textAnchor="middle"
                className="fill-ink-200 pointer-events-none"
                style={{ fontSize: "0.95em", fontFamily: "var(--font-mono)" }}
              >
                {truncate(displayToken(c.token), 10)}
              </text>
              <text
                x={bandwidth / 2}
                y={y - 4}
                textAnchor="middle"
                className="fill-ink-100 pointer-events-none"
                style={{ fontSize: "0.85em", fontFamily: "var(--font-mono)" }}
              >
                {(c.prob * 100).toFixed(c.prob >= 0.1 ? 0 : 1)}%
              </text>
            </g>
          );
        })}
        </g>

        <line x1={0} y1={0} x2={0} y2={innerH} stroke="rgba(180,200,232,0.18)" />
      </g>
    </svg>
    </div>
  );
}

function CumulativeMass({ candidates }: { candidates: SamplingCandidate[] }) {
  const sum = candidates.reduce((acc, c) => acc + c.prob, 0);
  // Floor so we never claim "100%" while there's still a non-zero tail.
  const pct = Math.floor(sum * 100);
  const remaining = 100 - pct;
  const tail = 1 - sum;

  return (
    <p className="mt-2 text-[11px] text-ink-300">
      Top-{candidates.length} covers <span className="text-ink-100">{pct}%</span> of next-token probability mass.
      {pct < 99 && (
        <>
          {" "}The remaining <span className="text-ink-100">{remaining}%</span> is spread across the rest of the vocab.
        </>
      )}
      {pct >= 99 && tail > 0 && tail < 0.001 && (
        <> Remaining tail <span className="text-ink-100">&lt;0.1%</span>.</>
      )}
    </p>
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

function formatLogTick(t: number): string {
  if (t >= 0.01) return `${(t * 100).toFixed(0)}%`;
  if (t >= 0.001) return `${(t * 100).toFixed(1)}%`;
  return t.toExponential(0);
}
