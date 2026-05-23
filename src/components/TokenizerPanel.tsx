import { useMemo } from "react";
import * as d3 from "d3";
import { EmptyState, Panel } from "./Panel";
import { axis, useActivePosition } from "../state/axis";
import type { PromptAnalysis, TokenInfo } from "../types";

interface Props {
  analysis: PromptAnalysis | null;
}

// Map a GPT-2 token id (≈ 50 257 vocab) to a 0..1 rarity score, then to a chip
// background shade. The darkest chip is held a notch brighter than ink-700 so
// it stays visibly distinct from the panel background, even at small sizes.
const RARITY_LOW = "#28365b"; // lifted from #1b2740 to keep contrast against ink-700
const RARITY_HIGH = "#7c4a0a";

function rarityShade(id: number): string {
  const vocab = 50257;
  const t = Math.min(1, Math.max(0, id / vocab));
  const interp = d3.interpolateLab(RARITY_LOW, RARITY_HIGH);
  return interp(t);
}

export function TokenizerPanel({ analysis }: Props) {
  const active = useActivePosition();

  return (
    <Panel
      id="tokenizer"
      title="Tokenizer"
      subtitle="How GPT-2 small segments the prompt. Surprising boundaries glow amber; chip shade reflects vocab-id position."
      right={
        analysis && (
          <span>
            {analysis.tokens.length} token{analysis.tokens.length === 1 ? "" : "s"}
          </span>
        )
      }
    >
      {!analysis ? (
        <EmptyState heightClass="h-24">Paste a prompt to see tokenization.</EmptyState>
      ) : (
        <TokenStrip tokens={analysis.tokens} active={active} />
      )}
    </Panel>
  );
}

function TokenStrip({
  tokens,
  active,
}: {
  tokens: TokenInfo[];
  active: number | null;
}) {
  const stats = useMemo(() => {
    const surprising = tokens.filter((t) => t.surprising_boundary).length;
    const avgId = Math.round(
      d3.mean(tokens, (t) => t.vocabId) ?? 0
    );
    return { surprising, avgId };
  }, [tokens]);

  return (
    <div>
      <div className="flex flex-wrap gap-1 font-mono text-sm leading-7">
        {tokens.map((t, i) => {
          const isActive = active === i;
          const bg = rarityShade(t.vocabId);
          return (
            <button
              key={i}
              type="button"
              data-token-position={i}
              className={
                "token-pos relative rounded-md px-1.5 py-0.5 transition border border-transparent hover:brightness-110 outline outline-1 transition-[outline-color] duration-150 ease-out " +
                (t.surprising_boundary
                  ? (isActive ? "ring-2 ring-warn-400/80 " : "ring-1 ring-warn-400/60 ")
                  : "") +
                (isActive ? "outline-accent-400 " : "outline-transparent ")
              }
              style={{ backgroundColor: bg }}
              data-highlight={isActive ? "true" : "false"}
              onMouseEnter={() => axis.setHover(i)}
              onMouseLeave={() => axis.setHover(null)}
              onClick={() => axis.togglePosition(i)}
              title={
                `pos ${i} · id #${t.id}` +
                (t.surprising_reasons.length
                  ? "\n" + t.surprising_reasons.join(", ")
                  : "")
              }
            >
              <span className="text-ink-100">{renderTokenText(t.text)}</span>
              <span className="ml-1 text-[9px] text-ink-300 align-top">
                {i}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-300">
        <LegendDot color={RARITY_LOW} label="low id" />
        <LegendDot color={RARITY_HIGH} label="high id" />
        <span>
          <span
            className="inline-block h-2 w-2 rounded-sm border border-warn-400/60"
            aria-hidden
          />
          {"  "}
          surprising boundary ({stats.surprising})
        </span>
        <span>avg id · {stats.avgId.toLocaleString()}</span>
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block h-2 w-3 rounded-sm"
        style={{ backgroundColor: color }}
        aria-hidden
      />
      {label}
    </span>
  );
}

function renderTokenText(text: string) {
  if (text.startsWith(" ")) {
    return (
      <>
        <span className="text-ink-300">·</span>
        {text.slice(1)}
      </>
    );
  }
  if (text === "\n") return <span className="text-ink-300">↵</span>;
  return text;
}
