// Tiny pub/sub for the shared token-position axis. Every panel subscribes;
// hovering or clicking a token in one panel broadcasts to all four. Avoids
// pulling in a state library for one cross-cutting concern.

import { useEffect, useSyncExternalStore } from "react";
import type { AxisSelection } from "../types";

type Listener = () => void;

const listeners = new Set<Listener>();
let state: AxisSelection = { position: null, hover: null };

function emit() {
  for (const l of listeners) l();
}

export const axis = {
  subscribe(l: Listener): () => void {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
  get(): AxisSelection {
    return state;
  },
  setHover(pos: number | null) {
    if (state.hover === pos) return;
    state = { ...state, hover: pos };
    emit();
  },
  setPosition(pos: number | null) {
    if (state.position === pos) return;
    state = { ...state, position: pos };
    emit();
  },
  togglePosition(pos: number) {
    state = { ...state, position: state.position === pos ? null : pos };
    emit();
  },
  reset() {
    if (state.position === null && state.hover === null) return;
    state = { position: null, hover: null };
    emit();
  },
};

export function useAxis(): AxisSelection {
  return useSyncExternalStore(axis.subscribe, axis.get, axis.get);
}

/** Returns whichever of hover or position is "live" (hover wins if both set). */
export function useActivePosition(): number | null {
  const a = useAxis();
  return a.hover ?? a.position;
}

/** Hook that resets the axis whenever `key` changes (e.g., new analysis). */
export function useAxisReset(key: unknown) {
  useEffect(() => {
    axis.reset();
  }, [key]);
}
